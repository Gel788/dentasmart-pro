import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class QueueService {
  constructor(private readonly prisma: PrismaService) {}

  waitlist(orgId: string) {
    return this.prisma.waitlistEntry.findMany({
      where: { organizationId: orgId, isActive: true },
      include: { patient: { select: { id: true, firstName: true, lastName: true, phone: true } } },
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
      include: { patient: { select: { id: true, firstName: true, lastName: true } } },
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

  async clinicDay(orgId: string, branchId: string) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const from = new Date(start);
    from.setDate(from.getDate() - 14);

    const [noShows, plans, invoices, today, cabinets, patients, payments] = await Promise.all([
      this.prisma.appointment.findMany({
        where: { organizationId: orgId, branchId, status: 'NO_SHOW', startsAt: { gte: from } },
        include: {
          patient: { select: { id: true, firstName: true, lastName: true, phone: true } },
          service: { select: { name: true } },
        },
        orderBy: { startsAt: 'desc' },
      }),
      this.prisma.treatmentPlan.findMany({
        where: { organizationId: orgId, status: { notIn: ['CANCELLED'] } },
        include: { patient: { select: { id: true, firstName: true, lastName: true } } },
        orderBy: { updatedAt: 'desc' },
        take: 40,
      }),
      this.prisma.invoice.findMany({
        where: { organizationId: orgId, status: { in: ['ISSUED', 'PARTIAL'] } },
        include: {
          patient: { select: { id: true, firstName: true, lastName: true, phone: true } },
          payments: { select: { method: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.appointment.findMany({
        where: {
          organizationId: orgId,
          branchId,
          startsAt: { gte: start, lt: end },
          status: { notIn: ['CANCELLED'] },
        },
        select: {
          startsAt: true,
          endsAt: true,
          status: true,
          cabinet: { select: { name: true } },
          doctor: { select: { lastName: true } },
        },
      }),
      this.prisma.cabinet.count({ where: { branchId, isActive: true } }),
      this.prisma.patient.findMany({
        where: { organizationId: orgId, isActive: true },
        select: { id: true, firstName: true, lastName: true, phone: true, source: true },
      }),
      this.prisma.payment.findMany({
        where: { organizationId: orgId },
        select: { patientId: true, amount: true },
      }),
    ]);

    const debtors = invoices
      .map((inv) => {
        const due = Number(inv.totalAmount) - Number(inv.discountAmount) - Number(inv.paidAmount);
        return {
          id: inv.id,
          number: inv.number,
          status: inv.status,
          due,
          dueDate: inv.dueDate,
          promiseNote: inv.promiseNote,
          payer: inv.payments.some((p) => p.method === 'DMS') ? 'Страховая' : 'Пациент',
          patient: inv.patient,
        };
      })
      .filter((inv) => inv.due > 0);

    const revenue = new Map<string, number>();
    const sourceOf = new Map(patients.map((p) => [p.id, p.source ?? '']));
    for (const pay of payments) {
      const key = sourceOf.get(pay.patientId) ?? '';
      revenue.set(key, (revenue.get(key) ?? 0) + Number(pay.amount));
    }
    const counts = new Map<string, number>();
    for (const p of patients) counts.set(p.source ?? '', (counts.get(p.source ?? '') ?? 0) + 1);
    const sources = [...counts.entries()]
      .map(([source, count]) => ({ source, count, revenue: revenue.get(source) ?? 0 }))
      .sort((a, b) => b.revenue - a.revenue);
    const withoutSource = patients.filter((p) => !p.source).slice(0, 12);

    const planCounts = plans.reduce<Record<string, number>>((acc, plan) => {
      acc[plan.status] = (acc[plan.status] ?? 0) + 1;
      return acc;
    }, {});

    const chairs = chairLoad(today, Math.max(cabinets, 1));
    const lostMinutes = noShows.reduce((sum, a) => sum + minutesBetween(a.startsAt, a.endsAt), 0);
    const [hygiene, stalled] = await Promise.all([this.hygieneRecall(orgId), this.stalledPlans(orgId)]);

    return {
      noShows: noShows.map((a) => ({
        id: a.id,
        startsAt: a.startsAt,
        reason: a.noShowReason,
        minutes: minutesBetween(a.startsAt, a.endsAt),
        service: a.service?.name ?? 'Приём',
        patient: a.patient,
      })),
      lostMinutes,
      plans: plans.map((p) => ({
        id: p.id,
        title: p.title,
        status: p.status,
        totalPrice: p.totalPrice,
        patient: p.patient,
      })),
      planCounts,
      debtors,
      chairs,
      sources,
      withoutSource,
      hygiene,
      stalled,
    };
  }

  private async hygieneRecall(orgId: string) {
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
    return [...lastVisit.values()]
      .filter((visit) => {
        const cleaned = lastHygiene.get(visit.patientId);
        return !cleaned || cleaned < border;
      })
      .slice(0, 12)
      .map((visit) => ({
        patient: visit.patient,
        lastVisit: visit.startsAt,
        lastHygiene: lastHygiene.get(visit.patientId) ?? null,
      }));
  }

  private stalledPlans(orgId: string) {
    const border = new Date();
    border.setDate(border.getDate() - 21);
    return this.prisma.treatmentPlan.findMany({
      where: {
        organizationId: orgId,
        status: { in: ['PROPOSED', 'ACCEPTED'] },
        updatedAt: { lt: border },
        isAlternative: false,
      },
      select: {
        id: true,
        title: true,
        status: true,
        totalPrice: true,
        updatedAt: true,
        patient: { select: { id: true, firstName: true, lastName: true, phone: true } },
      },
      orderBy: { updatedAt: 'asc' },
      take: 12,
    });
  }

  async saveNoShow(orgId: string, id: string, reason: string) {
    const appt = await this.prisma.appointment.findFirst({ where: { id, organizationId: orgId } });
    if (!appt) return null;
    return this.prisma.appointment.update({
      where: { id },
      data: { status: 'NO_SHOW', noShowReason: reason },
    });
  }

  async setSource(orgId: string, patientId: string, source: string) {
    const patient = await this.prisma.patient.findFirst({ where: { id: patientId, organizationId: orgId } });
    if (!patient) return null;
    return this.prisma.patient.update({
      where: { id: patientId },
      data: { source: source || null },
    });
  }

  async setPromise(orgId: string, invoiceId: string, promiseNote: string) {
    const invoice = await this.prisma.invoice.findFirst({ where: { id: invoiceId, organizationId: orgId } });
    if (!invoice) return null;
    return this.prisma.invoice.update({
      where: { id: invoiceId },
      data: { promiseNote },
    });
  }
}

function minutesBetween(start: Date, end: Date) {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
}

function minutesOfDay(date: Date) {
  return date.getHours() * 60 + date.getMinutes();
}

function labelMinutes(total: number) {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function chairLoad(
  today: {
    startsAt: Date;
    endsAt: Date;
    status: string;
    cabinet: { name: string } | null;
    doctor: { lastName: string } | null;
  }[],
  cabinetCount: number,
) {
  const open = 9 * 60;
  const close = 19 * 60;
  const groups = new Map<string, typeof today>();
  for (const appt of today) {
    const key = appt.cabinet?.name ?? (appt.doctor ? `Врач ${appt.doctor.lastName}` : 'Кресло');
    const list = groups.get(key) ?? [];
    list.push(appt);
    groups.set(key, list);
  }
  if (groups.size === 0) {
    groups.set('Кресло', []);
  }

  const chairs = [...groups.entries()].map(([name, items]) => {
    const active = items
      .filter((a) => a.status !== 'NO_SHOW')
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
    let cursor = open;
    const windows: { from: string; to: string; minutes: number }[] = [];
    for (const appt of active) {
      const startMin = Math.max(open, Math.min(close, minutesOfDay(appt.startsAt)));
      const endMin = Math.max(open, Math.min(close, minutesOfDay(appt.endsAt)));
      if (startMin - cursor >= 20) {
        windows.push({ from: labelMinutes(cursor), to: labelMinutes(startMin), minutes: startMin - cursor });
      }
      cursor = Math.max(cursor, endMin);
    }
    if (close - cursor >= 20) {
      windows.push({ from: labelMinutes(cursor), to: labelMinutes(close), minutes: close - cursor });
    }
    const booked = active.reduce((sum, a) => sum + minutesBetween(a.startsAt, a.endsAt), 0);
    const clinical = active
      .filter((a) => a.status === 'COMPLETED' || a.status === 'IN_PROGRESS')
      .reduce((sum, a) => sum + minutesBetween(a.startsAt, a.endsAt), 0);
    return { name, booked, clinical, windows };
  });

  return {
    cabinetCount,
    openMinutes: cabinetCount * (close - open),
    booked: chairs.reduce((sum, c) => sum + c.booked, 0),
    clinical: chairs.reduce((sum, c) => sum + c.clinical, 0),
    empty: chairs.reduce((sum, c) => sum + c.windows.reduce((w, gap) => w + gap.minutes, 0), 0),
    chairs,
  };
}
