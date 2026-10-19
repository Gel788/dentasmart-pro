import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
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
        branches: { where: { isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } },
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
    return this.freeSlots(org.id, branch.id, durationMin, new Date(from), new Date(to));
  }

  async book(orgSlug: string, data: WidgetBookDto) {
    const org = await this.prisma.organization.findUnique({ where: { slug: orgSlug } });
    if (!org) throw new NotFoundException();
    const branch = await this.branchOf(org.id, data.branchId);
    const tail = phoneTail(data.phone);
    if (tail.length < 10) throw new BadRequestException('Укажите телефон');
    if (!data.firstName?.trim() || !data.lastName?.trim()) throw new BadRequestException('Укажите имя и фамилию');
    if (data.serviceId) {
      const service = await this.prisma.service.findFirst({ where: { id: data.serviceId, organizationId: org.id, isActive: true } });
      if (!service) throw new BadRequestException('Услуга не найдена');
    }
    const { startsAt, endsAt } = visitWindow(data.startsAt, data.endsAt);
    const cabinetId = await this.pickCabinet(org.id, branch.id, startsAt, endsAt);
    if (!cabinetId) throw new BadRequestException('На это время нет свободного кресла');

    const known = await this.prisma.patient.findMany({
      where: { organizationId: org.id, isActive: true, phone: { not: null } },
      select: { id: true, phone: true },
    });
    const match = known.find((row) => phoneTail(row.phone) === tail);
    const patientId = match
      ? match.id
      : (await this.prisma.patient.create({
          data: {
            organizationId: org.id,
            firstName: data.firstName.trim(),
            lastName: data.lastName.trim(),
            phone: data.phone,
            email: data.email,
          },
          select: { id: true },
        })).id;

    // The caller is anonymous: confirm the slot, never echo back the patient card.
    return this.prisma.appointment.create({
      data: {
        organizationId: org.id,
        branchId: branch.id,
        cabinetId,
        patientId,
        serviceId: data.serviceId,
        startsAt,
        endsAt,
        status: 'SCHEDULED',
      },
      select: { id: true, startsAt: true, endsAt: true, status: true },
    });
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

  private async branchOf(orgId: string, branchId?: string) {
    const branch = await this.prisma.branch.findFirst({
      where: branchId
        ? { id: branchId, organizationId: orgId, isActive: true }
        : { organizationId: orgId, isActive: true },
      orderBy: { name: 'asc' },
    });
    if (!branch) throw new BadRequestException('У клиники нет филиала для записи');
    return branch;
  }

  private async freeSlots(orgId: string, branchId: string, durationMin: number, from: Date, to: Date) {
    const duration = Math.min(180, Math.max(15, durationMin || 30));
    const cabinets = await this.prisma.cabinet.findMany({
      where: { branchId, isActive: true, branch: { organizationId: orgId } },
      orderBy: { name: 'asc' },
      select: { id: true },
    });
    if (!cabinets.length) return [];
    const visits = await this.prisma.appointment.findMany({
      where: {
        organizationId: orgId,
        branchId,
        cabinetId: { not: null },
        status: { notIn: ['CANCELLED', 'NO_SHOW'] },
        startsAt: { lt: to },
        endsAt: { gt: from },
      },
      select: { cabinetId: true, startsAt: true, endsAt: true },
    });
    const blocks = await this.prisma.cabinetBlock.findMany({
      where: { organizationId: orgId, branchId, startsAt: { lt: to }, endsAt: { gt: from } },
      select: { cabinetId: true, startsAt: true, endsAt: true },
    });
    const slots: { startsAt: string; endsAt: string }[] = [];
    const day = new Date(from);
    day.setHours(0, 0, 0, 0);
    const last = new Date(to);
    while (day <= last && slots.length < 16) {
      for (let minute = 8 * 60; minute + duration <= 20 * 60 && slots.length < 16; minute += 30) {
        const startsAt = new Date(day);
        startsAt.setHours(Math.floor(minute / 60), minute % 60, 0, 0);
        const endsAt = new Date(startsAt.getTime() + duration * 60_000);
        if (startsAt <= new Date()) continue;
        const open = cabinets.some((cabinet) => this.chairFree(cabinet.id, startsAt, endsAt, visits, blocks));
        if (open) slots.push({ startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() });
      }
      day.setDate(day.getDate() + 1);
    }
    return slots;
  }

  private async pickCabinet(orgId: string, branchId: string, startsAt: Date, endsAt: Date, ignoreId?: string) {
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
