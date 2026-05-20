import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthUser } from '@dentasmart/shared';
import { PrismaService } from '../prisma/prisma.service';
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

    const conflict = await this.prisma.appointment.findFirst({
      where: {
        branchId: dto.branchId,
        status: { notIn: ['CANCELLED', 'NO_SHOW'] },
        OR: [
          dto.doctorId
            ? {
                doctorId: dto.doctorId,
                startsAt: { lt: endsAt },
                endsAt: { gt: startsAt },
              }
            : undefined,
          dto.cabinetId
            ? {
                cabinetId: dto.cabinetId,
                startsAt: { lt: endsAt },
                endsAt: { gt: startsAt },
              }
            : undefined,
        ].filter(Boolean) as object[],
      },
    });

    if (conflict) {
      throw new BadRequestException('Слот занят — выберите другое время');
    }

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

    const conflict = await this.prisma.appointment.findFirst({
      where: {
        id: { not: id },
        branchId,
        status: { notIn: ['CANCELLED', 'NO_SHOW'] },
        OR: [
          doctorId
            ? {
                doctorId,
                startsAt: { lt: endsAt },
                endsAt: { gt: startsAt },
              }
            : undefined,
          cabinetId
            ? {
                cabinetId,
                startsAt: { lt: endsAt },
                endsAt: { gt: startsAt },
              }
            : undefined,
        ].filter(Boolean) as object[],
      },
    });
    if (conflict) {
      throw new BadRequestException('Слот занят — выберите другое время');
    }

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
      await this.prisma.stockMovement.create({
        data: {
          organizationId: orgId,
          itemId: norm.itemId,
          branchId,
          type: 'TREATMENT_USE',
          quantity: norm.quantity,
          notes,
        },
      });
      const batch = await this.prisma.stockBatch.findFirst({
        where: { itemId: norm.itemId, branchId },
      });
      if (batch) {
        const next = Math.max(0, Number(batch.quantity) - Number(norm.quantity));
        await this.prisma.stockBatch.update({ where: { id: batch.id }, data: { quantity: next } });
      }
    }
  }

  async getWorkflowContext(orgId: string, appointmentId: string) {
    const appt = await this.prisma.appointment.findFirst({
      where: { id: appointmentId, organizationId: orgId },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true } },
        service: { select: { id: true, name: true, basePrice: true } },
        doctor: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    if (!appt) throw new NotFoundException('Запись не найдена');

    const [invoice, plan] = await Promise.all([
      this.prisma.invoice.findFirst({
        where: { appointmentId, status: { notIn: ['CANCELLED'] } },
      }),
      this.prisma.treatmentPlan.findFirst({
        where: { appointmentId, status: { notIn: ['CANCELLED'] } },
        include: { items: true },
      }),
    ]);

    return { appointment: appt, invoice, plan };
  }

  async updateStatus(orgId: string, id: string, status: string, userId: string) {
    const appt = await this.prisma.appointment.findFirst({ where: { id, organizationId: orgId } });
    if (!appt) throw new NotFoundException();
    const updated = await this.prisma.appointment.update({
      where: { id },
      data: { status: status as never },
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
}
