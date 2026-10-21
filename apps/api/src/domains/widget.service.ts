import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { effectiveHours, employeeWeek, tzOffsetMinutes, weekHoursOf, type ScheduleException } from '@dentasmart/shared';
import { PrismaService } from '../prisma/prisma.service';
import { WidgetBookDto, WidgetLookupDto, WidgetRescheduleDto } from './dto/widget.dto';

const MAX_VISIT_MS = 4 * 60 * 60 * 1000;

function phoneTail(phone?: string | null) {
  return (phone ?? '').replace(/\D/g, '').slice(-10);
}

function sameSurname(left?: string | null, right?: string | null) {
  const clean = (value?: string | null) => (value ?? '').trim().toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
  return Boolean(clean(left)) && clean(left) === clean(right);
}

function visitWindow(startsAtRaw: string, endsAtRaw: string) {
  const startsAt = new Date(startsAtRaw);
  const endsAt = new Date(endsAtRaw);
  const length = endsAt.getTime() - startsAt.getTime();
  if (!(length > 0) || length > MAX_VISIT_MS || startsAt <= new Date()) throw new BadRequestException('Выберите свободное время');
  return { startsAt, endsAt };
}

@Injectable()
export class WidgetService {
  constructor(private readonly prisma: PrismaService) {}

  async getConfig(orgSlug: string) {
    const org = await this.prisma.organization.findUnique({
      where: { slug: orgSlug },
      include: {
        widgetConfigs: { where: { isActive: true }, take: 1 },
        // Only branches with a working chair can take a booking.
        branches: { where: { isActive: true, cabinets: { some: { isActive: true } } }, orderBy: { name: 'asc' }, select: { id: true, name: true } },
      },
    });
    if (!org) throw new NotFoundException('Клиника не найдена');
    return {
      organization: { name: org.name, slug: org.slug },
      config: org.widgetConfigs[0] ?? { primaryColor: '#3b9eff' },
      branches: org.branches,
    };
  }

  async publicServices(orgSlug: string) {
    const org = await this.prisma.organization.findUnique({ where: { slug: orgSlug } });
    if (!org) throw new NotFoundException();
    return this.prisma.service.findMany({
      where: { organizationId: org.id, isActive: true, parentId: null },
      select: { id: true, name: true, description: true, durationMin: true, basePrice: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async publicSlots(orgSlug: string, branchId: string, from: string, to: string, durationMin = 30) {
    const org = await this.prisma.organization.findUnique({ where: { slug: orgSlug } });
    if (!org) throw new NotFoundException();
    const branch = await this.branchOf(org.id, branchId);
    return this.freeSlots(org.id, branch.id, durationMin, new Date(from), new Date(to), { limit: 40 });
  }

  /**
   * A booking asked for on the site becomes a request the clinic confirms; it holds the slot meanwhile.
   * The answer carries no patient data back to the anonymous caller.
   */
  async book(orgSlug: string, data: WidgetBookDto) {
    const org = await this.prisma.organization.findUnique({ where: { slug: orgSlug } });
    if (!org) throw new NotFoundException();
    const branch = await this.branchOf(org.id, data.branchId);
    const tail = phoneTail(data.phone);
    if (tail.length < 10) throw new BadRequestException('Укажите телефон');
    if (!data.firstName?.trim() || !data.lastName?.trim()) throw new BadRequestException('Укажите имя и фамилию');
    if (data.consent !== true) throw new BadRequestException('Нужно согласие на обработку персональных данных');
    if (data.serviceId) {
      const service = await this.prisma.service.findFirst({ where: { id: data.serviceId, organizationId: org.id, isActive: true } });
      if (!service) throw new BadRequestException('Услуга не найдена');
    }
    const { startsAt, endsAt } = visitWindow(data.startsAt, data.endsAt);
    const open = await this.freeSlots(org.id, branch.id, Math.round((endsAt.getTime() - startsAt.getTime()) / 60000), new Date(startsAt.getTime() - 60000), new Date(endsAt.getTime() + 60000), { limit: 400 });
    if (!open.some((slot) => slot.startsAt === startsAt.toISOString())) throw new BadRequestException('Это время уже занято. Выберите другое.');
    const chat = data.chatId ? await this.prisma.widgetChat.findFirst({ where: { id: data.chatId, organizationId: org.id } }) : null;
    const request = await this.prisma.bookingRequest.create({
      data: {
        organizationId: org.id,
        branchId: branch.id,
        chatId: chat?.id ?? null,
        serviceId: data.serviceId ?? chat?.serviceId ?? null,
        firstName: data.firstName.trim(),
        lastName: data.lastName.trim(),
        phone: data.phone.trim(),
        startsAt,
        endsAt,
        summary: chat?.summary ?? (data.comment?.trim() || null),
        urgent: chat?.urgent ?? false,
        consentAt: new Date(),
      },
      select: { id: true, startsAt: true, endsAt: true, status: true },
    });
    return request;
  }

  async visitsByPhone(orgSlug: string, data: WidgetLookupDto) {
    const org = await this.prisma.organization.findUnique({ where: { slug: orgSlug } });
    if (!org) throw new NotFoundException('Клиника не найдена');
    const tail = phoneTail(data.phone);
    if (tail.length < 10) return [];
    const patients = await this.prisma.patient.findMany({
      where: { organizationId: org.id, isActive: true, phone: { not: null } },
      select: { id: true, phone: true, lastName: true },
    });
    const patient = patients.find((row) => phoneTail(row.phone) === tail && sameSurname(row.lastName, data.lastName));
    if (!patient) return [];
    return this.prisma.appointment.findMany({
      where: {
        organizationId: org.id,
        patientId: patient.id,
        status: { in: ['SCHEDULED', 'CONFIRMED'] },
        startsAt: { gte: new Date() },
      },
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
        service: { select: { name: true } },
      },
      orderBy: { startsAt: 'asc' },
    });
  }

  async reschedule(orgSlug: string, data: WidgetRescheduleDto) {
    const org = await this.prisma.organization.findUnique({ where: { slug: orgSlug } });
    if (!org) throw new NotFoundException('Клиника не найдена');
    const appointment = await this.prisma.appointment.findFirst({
      where: { id: data.appointmentId, organizationId: org.id, status: { in: ['SCHEDULED', 'CONFIRMED'] } },
      include: { patient: { select: { phone: true, lastName: true } } },
    });
    const tail = phoneTail(data.phone);
    // One answer for every mismatch, so the endpoint cannot be used to probe which visits exist.
    if (!appointment || !tail || tail !== phoneTail(appointment.patient.phone) || !sameSurname(appointment.patient.lastName, data.lastName)) {
      throw new NotFoundException('Запись не найдена');
    }
    const { startsAt, endsAt } = visitWindow(data.startsAt, data.endsAt);
    const cabinetId = await this.pickCabinet(org.id, appointment.branchId, startsAt, endsAt, appointment.id);
    if (!cabinetId) throw new BadRequestException('На это время нет свободного кресла');
    return this.prisma.appointment.update({
      where: { id: appointment.id },
      data: { startsAt, endsAt, cabinetId },
      select: { id: true, startsAt: true, endsAt: true, status: true },
    });
  }

  async branchOf(orgId: string, branchId?: string) {
    const branch = await this.prisma.branch.findFirst({
      where: branchId
        ? { id: branchId, organizationId: orgId, isActive: true }
        : { organizationId: orgId, isActive: true, cabinets: { some: { isActive: true } } },
      orderBy: { name: 'asc' },
    });
    if (!branch) throw new BadRequestException('У клиники нет филиала для записи');
    return branch;
  }

  /**
   * Free start times inside the clinic's working hours (its week, holidays and breaks; a doctor's own
   * week and vacation when one is named). A pending site request holds its slot like a visit.
   */
  async freeSlots(orgId: string, branchId: string, durationMin: number, from: Date, to: Date, options: { doctorId?: string | null; limit?: number } = {}) {
    const duration = Math.min(180, Math.max(15, durationMin || 30));
    const limit = options.limit ?? 16;
    const [org, branch, cabinets] = await Promise.all([
      this.prisma.organization.findUniqueOrThrow({ where: { id: orgId }, select: { weekHours: true, workHours: true } }),
      this.prisma.branch.findFirstOrThrow({ where: { id: branchId, organizationId: orgId }, select: { timezone: true } }),
      this.prisma.cabinet.findMany({ where: { branchId, isActive: true, branch: { organizationId: orgId } }, orderBy: { name: 'asc' }, select: { id: true } }),
    ]);
    if (!cabinets.length) return [];
    const doctor = options.doctorId
      ? await this.prisma.employee.findFirst({ where: { id: options.doctorId, user: { organizationId: orgId } }, include: { schedules: { where: { isActive: true } } } })
      : null;
    const offset = tzOffsetMinutes(branch.timezone || 'Europe/Moscow', from);
    const week = (doctor ? employeeWeek(doctor.schedules) : null) ?? weekHoursOf(org.weekHours, org.workHours);
    const fromDate = new Date(from.getTime() + offset * 60000).toISOString().slice(0, 10);
    const toDate = new Date(to.getTime() + offset * 60000).toISOString().slice(0, 10);
    const exceptions = (await this.prisma.scheduleException.findMany({
      where: { organizationId: orgId, dateFrom: { lte: toDate }, dateTo: { gte: fromDate } },
    })) as ScheduleException[];
    const [visits, blocks, pending] = await Promise.all([
      this.prisma.appointment.findMany({
        where: { organizationId: orgId, branchId, cabinetId: { not: null }, status: { notIn: ['CANCELLED', 'NO_SHOW'] }, startsAt: { lt: to }, endsAt: { gt: from } },
        select: { cabinetId: true, startsAt: true, endsAt: true, doctorId: true },
      }),
      this.prisma.cabinetBlock.findMany({
        where: { organizationId: orgId, branchId, startsAt: { lt: to }, endsAt: { gt: from } },
        select: { cabinetId: true, startsAt: true, endsAt: true },
      }),
      this.prisma.bookingRequest.findMany({
        where: { organizationId: orgId, branchId, status: 'PENDING', startsAt: { lt: to }, endsAt: { gt: from } },
        select: { startsAt: true, endsAt: true },
      }),
    ]);
    const now = Date.now();
    const slots: { startsAt: string; endsAt: string }[] = [];
    for (let day = Date.parse(`${fromDate}T00:00:00Z`); day <= Date.parse(`${toDate}T00:00:00Z`) && slots.length < limit; day += 86400000) {
      const date = new Date(day).toISOString().slice(0, 10);
      const hours = effectiveHours(week, date, exceptions, doctor?.id ?? null);
      if (!hours) continue;
      for (let minute = Math.ceil(hours.opensAt / 30) * 30; minute + duration <= hours.closesAt && slots.length < limit; minute += 30) {
        if (hours.breakFrom !== undefined && hours.breakTo !== undefined && minute < hours.breakTo && minute + duration > hours.breakFrom) continue;
        const startsAt = new Date(day + (minute - offset) * 60000);
        const endsAt = new Date(startsAt.getTime() + duration * 60000);
        if (startsAt.getTime() <= now + 30 * 60000 || startsAt < from || endsAt > to) continue;
        if (doctor && visits.some((row) => row.doctorId === doctor.id && startsAt < row.endsAt && endsAt > row.startsAt)) continue;
        const freeChairs = cabinets.filter((cabinet) => this.chairFree(cabinet.id, startsAt, endsAt, visits, blocks)).length;
        const held = pending.filter((row) => startsAt < row.endsAt && endsAt > row.startsAt).length;
        if (freeChairs > held) slots.push({ startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() });
      }
    }
    return slots;
  }

  async pickCabinet(orgId: string, branchId: string, startsAt: Date, endsAt: Date, ignoreId?: string) {
    const cabinets = await this.prisma.cabinet.findMany({
      where: { branchId, isActive: true, branch: { organizationId: orgId } },
      orderBy: { name: 'asc' },
      select: { id: true },
    });
    const visits = await this.prisma.appointment.findMany({
      where: {
        organizationId: orgId,
        branchId,
        ...(ignoreId ? { id: { not: ignoreId } } : {}),
        cabinetId: { not: null },
        status: { notIn: ['CANCELLED', 'NO_SHOW'] },
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
      },
      select: { cabinetId: true, startsAt: true, endsAt: true },
    });
    const blocks = await this.prisma.cabinetBlock.findMany({
      where: { organizationId: orgId, branchId, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } },
      select: { cabinetId: true, startsAt: true, endsAt: true },
    });
    return cabinets.find((cabinet) => this.chairFree(cabinet.id, startsAt, endsAt, visits, blocks))?.id ?? null;
  }

  private chairFree(
    cabinetId: string,
    startsAt: Date,
    endsAt: Date,
    visits: { cabinetId: string | null; startsAt: Date; endsAt: Date }[],
    blocks: { cabinetId: string; startsAt: Date; endsAt: Date }[],
  ) {
    const hit = (row: { cabinetId: string | null; startsAt: Date; endsAt: Date }) =>
      row.cabinetId === cabinetId && startsAt < row.endsAt && endsAt > row.startsAt;
    return !visits.some(hit) && !blocks.some(hit);
  }
}
