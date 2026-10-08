import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

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

  async book(orgSlug: string, data: {
    branchId: string;
    serviceId?: string;
    startsAt: string;
    endsAt: string;
    firstName: string;
    lastName: string;
    phone: string;
    email?: string;
  }) {
    const org = await this.prisma.organization.findUnique({ where: { slug: orgSlug } });
    if (!org) throw new NotFoundException();
    const branch = await this.branchOf(org.id, data.branchId);
    const tail = data.phone.replace(/\D/g, '').slice(-10);
    if (tail.length < 10) throw new BadRequestException('Укажите телефон');
    if (!data.firstName?.trim() || !data.lastName?.trim()) throw new BadRequestException('Укажите имя и фамилию');
    const known = await this.prisma.patient.findMany({
      where: { organizationId: org.id, isActive: true, phone: { not: null } },
      select: { id: true, phone: true },
    });
    const match = known.find((row) => (row.phone ?? '').replace(/\D/g, '').slice(-10) === tail);
    const patient = match
      ? await this.prisma.patient.findUniqueOrThrow({ where: { id: match.id } })
      : await this.prisma.patient.create({
          data: {
            organizationId: org.id,
            firstName: data.firstName,
            lastName: data.lastName,
            phone: data.phone,
            email: data.email,
          },
        });

    const startsAt = new Date(data.startsAt);
    const endsAt = new Date(data.endsAt);
    if (!(endsAt > startsAt) || startsAt <= new Date()) throw new BadRequestException('Выберите свободное время');
    const cabinetId = await this.pickCabinet(org.id, branch.id, startsAt, endsAt);
    if (!cabinetId) throw new BadRequestException('На это время нет свободного кресла');
    return this.prisma.appointment.create({
      data: {
        organizationId: org.id,
        branchId: branch.id,
        cabinetId,
        patientId: patient.id,
        serviceId: data.serviceId,
        startsAt,
        endsAt,
        status: 'SCHEDULED',
      },
    });
  }

  async visitsByPhone(orgSlug: string, phone: string) {
    const org = await this.prisma.organization.findUnique({ where: { slug: orgSlug } });
    if (!org) throw new NotFoundException('Клиника не найдена');
    const tail = phone.replace(/\D/g, '').slice(-10);
    if (tail.length < 10) return [];
    const patients = await this.prisma.patient.findMany({
      where: { organizationId: org.id, isActive: true, phone: { not: null } },
      select: { id: true, phone: true },
    });
    const patient = patients.find((row) => (row.phone ?? '').replace(/\D/g, '').slice(-10) === tail);
    if (!patient) return [];
    return this.prisma.appointment.findMany({
      where: {
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

  async reschedule(orgSlug: string, data: { appointmentId: string; phone: string; startsAt: string; endsAt: string }) {
    const org = await this.prisma.organization.findUnique({ where: { slug: orgSlug } });
    if (!org) throw new NotFoundException('Клиника не найдена');
    const appointment = await this.prisma.appointment.findFirst({
      where: { id: data.appointmentId, organizationId: org.id, status: { in: ['SCHEDULED', 'CONFIRMED'] } },
      include: { patient: { select: { phone: true } } },
    });
    if (!appointment) throw new NotFoundException('Запись не найдена');
    const tail = data.phone.replace(/\D/g, '').slice(-10);
    const patientTail = (appointment.patient.phone ?? '').replace(/\D/g, '').slice(-10);
    if (!tail || tail !== patientTail) throw new BadRequestException('Телефон не совпадает с записью');
    const startsAt = new Date(data.startsAt);
    const endsAt = new Date(data.endsAt);
    if (!(endsAt > startsAt) || startsAt <= new Date()) throw new BadRequestException('Выберите свободное время');
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
