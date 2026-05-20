import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class QueueService {
  constructor(private readonly prisma: PrismaService) {}

  waitlist(orgId: string) {
    return this.prisma.waitlistEntry.findMany({
      where: { organizationId: orgId, isActive: true },
      include: { patient: { select: { firstName: true, lastName: true, phone: true } } },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    });
  }

  reception(orgId: string, branchId?: string) {
    return this.prisma.receptionQueueItem.findMany({
      where: {
        organizationId: orgId,
        status: { in: ['WAITING', 'CALLED', 'IN_CHAIR'] },
        ...(branchId ? { branchId } : {}),
      },
      include: { patient: { select: { firstName: true, lastName: true } } },
      orderBy: { position: 'asc' },
    });
  }

  async checkIn(orgId: string, data: { patientId: string; branchId: string; appointmentId?: string }) {
    const maxPos = await this.prisma.receptionQueueItem.aggregate({
      where: { organizationId: orgId, branchId: data.branchId, status: { in: ['WAITING', 'CALLED', 'IN_CHAIR'] } },
      _max: { position: true },
    });
    const item = await this.prisma.receptionQueueItem.create({
      data: {
        organizationId: orgId,
        branchId: data.branchId,
        patientId: data.patientId,
        appointmentId: data.appointmentId,
        position: (maxPos._max.position ?? 0) + 1,
      },
      include: { patient: true },
    });
    if (data.appointmentId) {
      await this.prisma.appointment.update({
        where: { id: data.appointmentId },
        data: { status: 'WAITING' },
      });
    }
    return item;
  }

  async receptionDesk(orgId: string, branchId: string) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    const [appointments, queue, waitlistCount, inChair] = await Promise.all([
      this.prisma.appointment.findMany({
        where: {
          organizationId: orgId,
          branchId,
          startsAt: { gte: start, lt: end },
          status: { notIn: ['CANCELLED'] },
        },
        include: {
          patient: { select: { id: true, firstName: true, lastName: true, phone: true } },
          doctor: { select: { id: true, firstName: true, lastName: true } },
          service: { select: { id: true, name: true, durationMin: true } },
        },
        orderBy: { startsAt: 'asc' },
      }),
      this.reception(orgId, branchId),
      this.prisma.waitlistEntry.count({ where: { organizationId: orgId, isActive: true } }),
      this.prisma.receptionQueueItem.count({
        where: { organizationId: orgId, branchId, status: 'IN_CHAIR' },
      }),
    ]);

    const queuePatientIds = new Set(queue.map((q) => q.patientId));
    const notArrived = appointments.filter(
      (a) => !queuePatientIds.has(a.patientId) && ['SCHEDULED', 'CONFIRMED'].includes(a.status),
    ).length;

    return {
      appointments,
      queue,
      waitlistCount,
      stats: {
        todayTotal: appointments.length,
        inClinic: queue.length,
        inChair,
        waitingArrival: notArrived,
      },
    };
  }

  async updateQueueStatus(id: string, status: string) {
    const item = await this.prisma.receptionQueueItem.update({
      where: { id },
      data: { status: status as never },
    });

    if (item.appointmentId) {
      const apptStatus =
        status === 'IN_CHAIR'
          ? 'IN_PROGRESS'
          : status === 'DONE'
            ? 'COMPLETED'
            : status === 'CALLED'
              ? 'WAITING'
              : null;
      if (apptStatus) {
        await this.prisma.appointment.update({
          where: { id: item.appointmentId },
          data: { status: apptStatus as never },
        });
      }
    }

    return item;
  }

  addWaitlist(orgId: string, data: { patientId: string; branchId: string; serviceId?: string }) {
    return this.prisma.waitlistEntry.create({ data: { organizationId: orgId, ...data } });
  }
}
