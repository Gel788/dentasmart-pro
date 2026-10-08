import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthUser } from '@dentasmart/shared';
import { PrismaService } from '../prisma/prisma.service';
import { consumeStock } from '../domains/stock-consume';
import { AuditService } from '../common/audit.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findByRange(
    orgId: string,
    from: string,
    to: string,
    branchId?: string,
    doctorId?: string,
    cabinetId?: string,
  ) {
    return this.prisma.appointment.findMany({
      where: {
        organizationId: orgId,
        startsAt: { gte: new Date(from), lte: new Date(to) },
        ...(branchId ? { branchId } : {}),
        ...(doctorId ? { doctorId } : {}),
        ...(cabinetId ? { cabinetId } : {}),
      },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true, phone: true } },
        doctor: { select: { id: true, firstName: true, lastName: true } },
        service: { select: { id: true, name: true, durationMin: true } },
        cabinet: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true } },
      },
      orderBy: { startsAt: 'asc' },
    });
  }

  async create(user: AuthUser, dto: CreateAppointmentDto): Promise<unknown> {
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);

    if (endsAt <= startsAt) {
      throw new BadRequestException('Время окончания должно быть позже начала');
    }

    const patient = await this.prisma.patient.findFirst({
      where: { id: dto.patientId, organizationId: user.organizationId },
    });
    if (!patient) throw new NotFoundException('Пациент не найден');

    const branch = await this.prisma.branch.findFirst({
      where: { id: dto.branchId, organizationId: user.organizationId },
    });
    if (!branch) throw new NotFoundException('Филиал не найден');

    await this.assertSlot({
      branchId: dto.branchId,
      startsAt,
      endsAt,
      doctorId: dto.doctorId,
      cabinetId: dto.cabinetId,
    });

    const appointment = await this.prisma.appointment.create({
      data: {
        organizationId: user.organizationId,
        branchId: dto.branchId,
        patientId: dto.patientId,
        startsAt,
        endsAt,
        cabinetId: dto.cabinetId,
        doctorId: dto.doctorId,
        serviceId: dto.serviceId,
        notes: dto.notes,
      },
      include: {
        patient: true,
        doctor: true,
        service: true,
      },
    });

    await this.audit.log({
      organizationId: user.organizationId,
      userId: user.id,
      entityType: 'Appointment',
      entityId: appointment.id,
      action: 'CREATE',
      changes: { ...dto } as object,
    });

    return appointment;
  }

  async update(orgId: string, id: string, dto: UpdateAppointmentDto, userId: string) {
    const appt = await this.prisma.appointment.findFirst({ where: { id, organizationId: orgId } });
    if (!appt) throw new NotFoundException();

    const startsAt = dto.startsAt ? new Date(dto.startsAt) : appt.startsAt;
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : appt.endsAt;
    if (endsAt <= startsAt) {
      throw new BadRequestException('Время окончания должно быть позже начала');
    }

    const branchId = dto.branchId ?? appt.branchId;
    const doctorId =
      dto.doctorId !== undefined ? (dto.doctorId ? dto.doctorId : null) : appt.doctorId;
    const cabinetId = dto.cabinetId !== undefined ? dto.cabinetId : appt.cabinetId;

    await this.assertSlot({
      branchId,
      startsAt,
      endsAt,
      doctorId,
      cabinetId,
      ignoreId: id,
    });

    const updated = await this.prisma.appointment.update({
      where: { id },
      data: {
        startsAt,
        endsAt,
        branchId,
        doctorId,
        cabinetId,
        serviceId: dto.serviceId !== undefined ? dto.serviceId : appt.serviceId,
        notes: dto.notes !== undefined ? dto.notes : appt.notes,
        noShowReason: dto.noShowReason !== undefined ? dto.noShowReason : appt.noShowReason,
      },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true, phone: true } },
        doctor: { select: { id: true, firstName: true, lastName: true } },
        service: { select: { id: true, name: true, durationMin: true } },
        cabinet: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true } },
      },
    });

    await this.audit.log({
      organizationId: orgId,
      userId,
      entityType: 'Appointment',
      entityId: id,
      action: 'UPDATE',
      changes: { ...dto } as object,
    });
    return updated;
  }

  private async deductServiceMaterials(
    orgId: string,
    serviceId: string,
    branchId: string,
    notes: string,
  ) {
    const norms = await this.prisma.serviceMaterialNorm.findMany({
      where: { organizationId: orgId, serviceId },
    });
    for (const norm of norms) {
      await consumeStock(this.prisma, {
        organizationId: orgId,
        itemId: norm.itemId,
        branchId,
        quantity: Number(norm.quantity),
        type: 'TREATMENT_USE',
        notes,
      });
    }
  }

  async getWorkflowContext(orgId: string, appointmentId: string) {
    const appt = await this.prisma.appointment.findFirst({
      where: { id: appointmentId, organizationId: orgId },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true } },
        service: { select: { id: true, name: true, basePrice: true } },
        doctor: { select: { id: true, firstName: true, lastName: true } },
        visitNote: true,
      },
    });
    if (!appt) throw new NotFoundException('Запись не найдена');

    const [invoice, plan] = await Promise.all([
      this.prisma.invoice.findFirst({
        where: {
          status: { notIn: ['CANCELLED'] },
          OR: [{ appointmentId }, { treatmentPlan: { appointmentId } }],
        },
        include: { items: { orderBy: { title: 'asc' } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.treatmentPlan.findFirst({
        where: { appointmentId, status: { notIn: ['CANCELLED', 'REJECTED'] } },
        include: {
          items: {
            orderBy: { sortOrder: 'asc' },
            include: { invoiceItem: { select: { id: true } } },
          },
        },
        orderBy: { updatedAt: 'desc' },
      }),
    ]);

    return { appointment: appt, invoice, plan, visitNote: appt.visitNote };
  }

  async saveVisitNote(
    orgId: string,
    appointmentId: string,
    data: {
      complaints?: string;
      anamnesis?: string;
      objective?: string;
      diagnosis?: string;
      treatment?: string;
      recommendations?: string;
    },
  ) {
    const appt = await this.prisma.appointment.findFirst({
      where: { id: appointmentId, organizationId: orgId },
    });
    if (!appt) throw new NotFoundException('Запись не найдена');
    return this.prisma.visitNote.upsert({
      where: { appointmentId },
      create: { appointmentId, ...data },
      update: data,
    });
  }

  async updateStatus(orgId: string, id: string, status: string, userId: string, noShowReason?: string) {
    const appt = await this.prisma.appointment.findFirst({ where: { id, organizationId: orgId } });
    if (!appt) throw new NotFoundException();
    const updated = await this.prisma.appointment.update({
      where: { id },
      data: {
        status: status as never,
        ...(noShowReason !== undefined ? { noShowReason } : {}),
      },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true, phone: true } },
        doctor: true,
        service: true,
      },
    });

    if (status === 'COMPLETED' && appt.serviceId) {
      await this.deductServiceMaterials(
        orgId,
        appt.serviceId,
        appt.branchId,
        `Списание по завершённому приёму`,
      );
    }

    await this.audit.log({
      organizationId: orgId,
      userId,
      entityType: 'Appointment',
      entityId: id,
      action: 'UPDATE',
      changes: { status },
    });
    return updated;
  }

  async suggestSlots(orgId: string, branchId: string, durationMin: number, from: string, to: string) {
    const start = new Date(from);
    const end = new Date(to);
    const booked = await this.prisma.appointment.findMany({
      where: {
        organizationId: orgId,
        branchId,
        startsAt: { gte: start, lte: end },
        status: { notIn: ['CANCELLED', 'NO_SHOW'] },
      },
      select: { startsAt: true, endsAt: true },
    });

    const slots: { startsAt: string; endsAt: string }[] = [];
    const day = new Date(start);
    while (day <= end) {
      for (let h = 9; h < 20; h++) {
        for (let m = 0; m < 60; m += 30) {
          const slotStart = new Date(day);
          slotStart.setHours(h, m, 0, 0);
          const slotEnd = new Date(slotStart);
          slotEnd.setMinutes(slotEnd.getMinutes() + durationMin);
          const conflict = booked.some(
            (b) => slotStart < b.endsAt && slotEnd > b.startsAt,
          );
          if (!conflict && slotStart > new Date()) {
            slots.push({ startsAt: slotStart.toISOString(), endsAt: slotEnd.toISOString() });
          }
        }
      }
      day.setDate(day.getDate() + 1);
    }
    return slots.slice(0, 40);
  }

  private async assertSlot(opts: {
    branchId: string;
    startsAt: Date;
    endsAt: Date;
    doctorId?: string | null;
    cabinetId?: string | null;
    ignoreId?: string;
  }) {
    if (opts.doctorId || opts.cabinetId) {
      const conflict = await this.prisma.appointment.findFirst({
        where: {
          ...(opts.ignoreId ? { id: { not: opts.ignoreId } } : {}),
          branchId: opts.branchId,
          status: { notIn: ['CANCELLED', 'NO_SHOW'] },
          OR: [
            opts.doctorId
              ? { doctorId: opts.doctorId, startsAt: { lt: opts.endsAt }, endsAt: { gt: opts.startsAt } }
              : undefined,
            opts.cabinetId
              ? { cabinetId: opts.cabinetId, startsAt: { lt: opts.endsAt }, endsAt: { gt: opts.startsAt } }
              : undefined,
          ].filter(Boolean) as object[],
        },
      });
      if (conflict) throw new BadRequestException('Слот занят — выберите другое время');
    }
    if (opts.cabinetId) {
      const block = await this.prisma.cabinetBlock.findFirst({
        where: {
          cabinetId: opts.cabinetId,
          startsAt: { lt: opts.endsAt },
          endsAt: { gt: opts.startsAt },
        },
      });
      if (block) throw new BadRequestException(`Кресло закрыто: ${block.reason}`);
    }
  }

  async dayBoard(orgId: string, branchId: string, date: string) {
    const start = new Date(`${date}T00:00:00`);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const [cabinets, appointments, blocks] = await Promise.all([
      this.prisma.cabinet.findMany({
        where: { branchId, branch: { organizationId: orgId }, isActive: true },
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
      }),
      this.prisma.appointment.findMany({
        where: {
          organizationId: orgId,
          branchId,
          startsAt: { lt: end },
          endsAt: { gt: start },
        },
        include: {
          patient: { select: { id: true, firstName: true, lastName: true } },
          doctor: { select: { id: true, firstName: true, lastName: true } },
          service: { select: { id: true, name: true, durationMin: true } },
          cabinet: { select: { id: true, name: true } },
        },
        orderBy: { startsAt: 'asc' },
      }),
      this.prisma.cabinetBlock.findMany({
        where: { organizationId: orgId, branchId, startsAt: { lt: end }, endsAt: { gt: start } },
        orderBy: { startsAt: 'asc' },
      }),
    ]);
    return { cabinets, appointments, blocks };
  }

  async createBlock(
    orgId: string,
    data: { branchId: string; cabinetId: string; startsAt: string; endsAt: string; reason: string },
  ) {
    const startsAt = new Date(data.startsAt);
    const endsAt = new Date(data.endsAt);
    if (endsAt <= startsAt) throw new BadRequestException('Время окончания должно быть позже начала');
    const cabinet = await this.prisma.cabinet.findFirst({
      where: { id: data.cabinetId, branchId: data.branchId, branch: { organizationId: orgId } },
    });
    if (!cabinet) throw new NotFoundException('Кресло не найдено');
    const visit = await this.prisma.appointment.findFirst({
      where: {
        cabinetId: data.cabinetId,
        status: { notIn: ['CANCELLED', 'NO_SHOW'] },
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
      },
    });
    if (visit) throw new BadRequestException('На это время уже есть запись');
    return this.prisma.cabinetBlock.create({
      data: {
        organizationId: orgId,
        branchId: data.branchId,
        cabinetId: data.cabinetId,
        startsAt,
        endsAt,
        reason: data.reason.trim(),
      },
    });
  }

  async deleteBlock(orgId: string, id: string) {
    const block = await this.prisma.cabinetBlock.findFirst({ where: { id, organizationId: orgId } });
    if (!block) throw new NotFoundException('Блок не найден');
    await this.prisma.cabinetBlock.delete({ where: { id } });
    return { ok: true };
  }

  async listToMake(orgId: string, branchId: string) {
    const open = await this.prisma.appointmentToMake.findMany({
      where: { organizationId: orgId, branchId, status: 'OPEN' },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true, phone: true } },
        service: { select: { id: true, name: true, durationMin: true } },
      },
      orderBy: { dueAfter: 'asc' },
    });
    const covered = new Set(open.map((row) => row.patientId));
    const future = await this.prisma.appointment.findMany({
      where: {
        organizationId: orgId,
        startsAt: { gte: new Date() },
        status: { notIn: ['CANCELLED', 'NO_SHOW'] },
      },
      select: { patientId: true },
    });
    for (const row of future) covered.add(row.patientId);
    const border = new Date();
    border.setMonth(border.getMonth() - 6);
    const visits = await this.prisma.appointment.findMany({
      where: { organizationId: orgId, status: 'COMPLETED' },
      select: {
        patientId: true,
        startsAt: true,
        patient: { select: { id: true, firstName: true, lastName: true, phone: true } },
        service: { select: { name: true, code: true } },
      },
      orderBy: { startsAt: 'desc' },
    });
    const lastVisit = new Map<string, (typeof visits)[number]>();
    const lastHygiene = new Map<string, Date>();
    for (const visit of visits) {
      if (!lastVisit.has(visit.patientId)) lastVisit.set(visit.patientId, visit);
      const hygiene = visit.service?.code === 'HYGIENE' || /гигиен/i.test(visit.service?.name ?? '');
      if (hygiene && !lastHygiene.has(visit.patientId)) lastHygiene.set(visit.patientId, visit.startsAt);
    }
    const hygieneService = await this.prisma.service.findFirst({
      where: { organizationId: orgId, isActive: true, OR: [{ code: 'HYGIENE' }, { name: { contains: 'гигиен', mode: 'insensitive' } }] },
      select: { id: true, name: true, durationMin: true },
    });
    const suggested = [...lastVisit.values()]
      .filter((visit) => {
        if (covered.has(visit.patientId)) return false;
        const cleaned = lastHygiene.get(visit.patientId);
        return !cleaned || cleaned < border;
      })
      .slice(0, 12)
      .map((visit) => ({
        id: `hygiene:${visit.patientId}`,
        source: 'SYSTEM' as const,
        dueAfter: null,
        notes: 'Гигиены не было больше полугода',
        patient: visit.patient,
        service: hygieneService,
        virtual: true,
      }));
    return {
      items: [
        ...open.map((row) => ({ ...row, virtual: false })),
        ...suggested,
      ],
    };
  }

  async createToMake(
    orgId: string,
    data: { branchId: string; patientId: string; source: 'RECEPTION' | 'PATIENT' | 'SYSTEM'; serviceId?: string; dueAfter?: string; notes?: string },
  ) {
    const patient = await this.prisma.patient.findFirst({ where: { id: data.patientId, organizationId: orgId } });
    if (!patient) throw new NotFoundException('Пациент не найден');
    return this.prisma.appointmentToMake.create({
      data: {
        organizationId: orgId,
        branchId: data.branchId,
        patientId: data.patientId,
        source: data.source,
        serviceId: data.serviceId || null,
        dueAfter: data.dueAfter ? new Date(data.dueAfter) : null,
        notes: data.notes?.trim() || null,
      },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true, phone: true } },
        service: { select: { id: true, name: true, durationMin: true } },
      },
    });
  }

  async scheduleToMake(orgId: string, id: string) {
    const row = await this.prisma.appointmentToMake.findFirst({ where: { id, organizationId: orgId } });
    if (!row) throw new NotFoundException('Задачи на запись нет');
    return this.prisma.appointmentToMake.update({ where: { id }, data: { status: 'SCHEDULED' } });
  }

  async deleteToMake(orgId: string, id: string) {
    const row = await this.prisma.appointmentToMake.findFirst({ where: { id, organizationId: orgId } });
    if (!row) throw new NotFoundException('Задачи на запись нет');
    await this.prisma.appointmentToMake.delete({ where: { id } });
    return { ok: true };
  }
}
