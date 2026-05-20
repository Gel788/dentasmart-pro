import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RemindersService {
  constructor(private readonly prisma: PrismaService) {}

  list(orgId: string, status?: string) {
    return this.prisma.reminder.findMany({
      where: {
        organizationId: orgId,
        ...(status ? { status: status as never } : {}),
      },
      orderBy: { scheduledAt: 'asc' },
      take: 100,
    });
  }

  async queueForTomorrow(orgId: string) {
    const start = new Date();
    start.setDate(start.getDate() + 1);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setHours(23, 59, 59, 999);

    const appointments = await this.prisma.appointment.findMany({
      where: {
        organizationId: orgId,
        startsAt: { gte: start, lte: end },
        status: { in: ['SCHEDULED', 'CONFIRMED'] },
      },
      include: { patient: true },
    });

    const created: Awaited<ReturnType<PrismaService['reminder']['create']>>[] = [];
    for (const a of appointments) {
      if (!a.patient.phone) continue;
      const exists = await this.prisma.reminder.findFirst({
        where: { appointmentId: a.id, status: 'PENDING' },
      });
      if (exists) continue;
      const r = await this.prisma.reminder.create({
        data: {
          organizationId: orgId,
          patientId: a.patientId,
          appointmentId: a.id,
          channel: 'SMS',
          message: `Напоминание: завтра в ${a.startsAt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })} ждём вас в клинике.`,
          scheduledAt: new Date(),
        },
      });
      created.push(r);
    }
    return { queued: created.length, items: created };
  }

  async sendPending(orgId: string) {
    const pending = await this.prisma.reminder.findMany({
      where: { organizationId: orgId, status: 'PENDING', scheduledAt: { lte: new Date() } },
    });
    for (const r of pending) {
      await this.prisma.reminder.update({
        where: { id: r.id },
        data: { status: 'SENT', sentAt: new Date() },
      });
    }
    return { sent: pending.length };
  }

  listTemplates(orgId: string) {
    return this.prisma.reminderTemplate.findMany({ where: { organizationId: orgId } });
  }

  createTemplate(orgId: string, data: { name: string; channel: string; body: string }) {
    return this.prisma.reminderTemplate.create({
      data: { organizationId: orgId, name: data.name, channel: data.channel as never, body: data.body },
    });
  }
}
