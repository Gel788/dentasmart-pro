import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async dashboard(orgId: string) {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [patients, appointmentsMonth, paymentsMonth, insights] = await Promise.all([
      this.prisma.patient.count({ where: { organizationId: orgId, isActive: true } }),
      this.prisma.appointment.count({
        where: { organizationId: orgId, startsAt: { gte: monthStart } },
      }),
      this.prisma.payment.aggregate({
        where: { organizationId: orgId, paidAt: { gte: monthStart } },
        _sum: { amount: true },
      }),
      this.prisma.aiInsight.findMany({
        where: { organizationId: orgId },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);

    return {
      patientsTotal: patients,
      appointmentsThisMonth: appointmentsMonth,
      revenueThisMonth: Number(paymentsMonth._sum.amount ?? 0),
      aiInsights: insights,
      funnel: {
        leads: patients,
        scheduled: appointmentsMonth,
        completed: await this.prisma.appointment.count({
          where: { organizationId: orgId, status: 'COMPLETED', startsAt: { gte: monthStart } },
        }),
      },
    };
  }

  async owner(orgId: string) {
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const [payments, openInvoices, branches, labOverdue, material, completed] = await Promise.all([
      this.prisma.payment.findMany({
        where: { organizationId: orgId, paidAt: { gte: monthStart } },
        include: {
          invoice: {
            select: {
              appointment: {
                select: {
                  branchId: true,
                  branch: { select: { name: true } },
                  doctor: { select: { id: true, firstName: true, lastName: true } },
                },
              },
              treatmentPlan: { select: { doctor: { select: { id: true, firstName: true, lastName: true } } } },
            },
          },
        },
      }),
      this.prisma.invoice.findMany({
        where: { organizationId: orgId, status: { in: ['ISSUED', 'PARTIAL'] } },
        select: { totalAmount: true, paidAmount: true, discountAmount: true },
      }),
      this.prisma.branch.findMany({
        where: { organizationId: orgId, isActive: true },
        select: { id: true, name: true },
      }),
      this.prisma.labOrder.count({
        where: {
          organizationId: orgId,
          dueAt: { lt: new Date() },
          status: { notIn: ['DELIVERED', 'REJECTED'] },
        },
      }),
      this.prisma.stockMovement.aggregate({
        where: {
          organizationId: orgId,
          type: { in: ['TREATMENT_USE', 'WRITE_OFF'] },
          createdAt: { gte: monthStart },
        },
        _sum: { costAmount: true },
      }),
      this.prisma.appointment.findMany({
        where: { organizationId: orgId, status: 'COMPLETED' },
        select: { patientId: true, startsAt: true, service: { select: { name: true, code: true } } },
        orderBy: { startsAt: 'desc' },
      }),
    ]);

    const byDoctor = new Map<string, { name: string; amount: number }>();
    const byBranch = new Map<string, { name: string; amount: number }>();
    for (const branch of branches) byBranch.set(branch.id, { name: branch.name, amount: 0 });
    for (const payment of payments) {
      const doctor = payment.invoice?.appointment?.doctor ?? payment.invoice?.treatmentPlan?.doctor;
      const key = doctor?.id ?? 'none';
      const name = doctor ? `${doctor.lastName} ${doctor.firstName}` : 'Без врача';
      const row = byDoctor.get(key) ?? { name, amount: 0 };
      row.amount += Number(payment.amount);
      byDoctor.set(key, row);
      const branch = payment.invoice?.appointment?.branch;
      if (branch) {
        const current = byBranch.get(payment.invoice?.appointment?.branchId ?? '') ?? { name: branch.name, amount: 0 };
        current.amount += Number(payment.amount);
        byBranch.set(payment.invoice?.appointment?.branchId ?? branch.name, current);
      }
    }
    const border = new Date();
    border.setMonth(border.getMonth() - 6);
    const lastHygiene = new Map<string, Date>();
    const seen = new Set<string>();
    let hygieneDue = 0;
    for (const visit of completed) {
      const hygiene = visit.service?.code === 'HYGIENE' || /гигиен/i.test(visit.service?.name ?? '');
      if (hygiene && !lastHygiene.has(visit.patientId)) lastHygiene.set(visit.patientId, visit.startsAt);
      if (!seen.has(visit.patientId)) {
        seen.add(visit.patientId);
      }
    }
    for (const patientId of seen) {
      const cleaned = lastHygiene.get(patientId);
      if (!cleaned || cleaned < border) hygieneDue += 1;
    }
    const receivable = openInvoices.reduce(
      (sum, invoice) => sum + Number(invoice.totalAmount) - Number(invoice.discountAmount) - Number(invoice.paidAmount),
      0,
    );
    return {
      receivable,
      materialCost: Number(material._sum.costAmount ?? 0),
      labOverdue,
      hygieneDue,
      doctors: [...byDoctor.values()].sort((a, b) => b.amount - a.amount),
      branches: [...byBranch.values()].sort((a, b) => b.amount - a.amount),
    };
  }

  async practice(orgId: string) {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const [appointments, invoicesMonth, paymentsMonth, openInvoices, sources] = await Promise.all([
      this.prisma.appointment.findMany({
        where: {
          organizationId: orgId,
          startsAt: { gte: monthStart, lt: nextMonth },
          status: { not: 'CANCELLED' },
        },
        select: { status: true, service: { select: { name: true } } },
      }),
      this.prisma.invoice.findMany({
        where: {
          organizationId: orgId,
          createdAt: { gte: monthStart, lt: nextMonth },
          status: { not: 'CANCELLED' },
        },
        select: { totalAmount: true, discountAmount: true },
      }),
      this.prisma.payment.aggregate({
        where: { organizationId: orgId, paidAt: { gte: monthStart, lt: nextMonth } },
        _sum: { amount: true },
      }),
      this.prisma.invoice.findMany({
        where: { organizationId: orgId, status: { in: ['ISSUED', 'PARTIAL'] } },
        select: { totalAmount: true, paidAmount: true, discountAmount: true, createdAt: true },
      }),
      this.prisma.patient.groupBy({
        by: ['source'],
        where: { organizationId: orgId, isActive: true },
        _count: { _all: true },
      }),
    ]);

    const byService = new Map<string, number>();
    let completed = 0;
    let noShow = 0;
    for (const visit of appointments) {
      if (visit.status === 'COMPLETED') completed += 1;
      if (visit.status === 'NO_SHOW') noShow += 1;
      const name = visit.service?.name ?? 'Без услуги';
      byService.set(name, (byService.get(name) ?? 0) + 1);
    }
    const visits = appointments.length;
    const production = invoicesMonth.reduce(
      (sum, invoice) => sum + Number(invoice.totalAmount) - Number(invoice.discountAmount),
      0,
    );
    const collections = Number(paymentsMonth._sum.amount ?? 0);
    const aged = { d0: 0, d30: 0, d60: 0, d90: 0 };
    for (const invoice of openInvoices) {
      const due = Number(invoice.totalAmount) - Number(invoice.discountAmount) - Number(invoice.paidAmount);
      if (due <= 0) continue;
      const days = Math.floor((now.getTime() - invoice.createdAt.getTime()) / 86_400_000);
      if (days <= 30) aged.d0 += due;
      else if (days <= 60) aged.d30 += due;
      else if (days <= 90) aged.d60 += due;
      else aged.d90 += due;
    }
    return {
      visits,
      completed,
      noShow,
      completedRate: visits ? Math.round((completed / visits) * 100) : 0,
      noShowRate: visits ? Math.round((noShow / visits) * 100) : 0,
      production,
      collections,
      collectionRate: production > 0 ? Math.round((collections / production) * 100) : 0,
      aged,
      treatments: [...byService.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8),
      sources: sources
        .map((row) => ({ source: row.source ?? '', count: row._count._all }))
        .sort((a, b) => b.count - a.count),
    };
  }

  listInsights(orgId: string) {
    return this.prisma.aiInsight.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async generatePredictions(orgId: string) {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const inactive = await this.prisma.patient.count({
      where: {
        organizationId: orgId,
        NOT: { appointments: { some: { startsAt: { gte: sixMonthsAgo } } } },
      },
    });
    const revenue = await this.prisma.payment.aggregate({
      where: { organizationId: orgId, paidAt: { gte: sixMonthsAgo } },
      _sum: { amount: true },
    });
    const churn = await this.prisma.aiInsight.create({
      data: {
        organizationId: orgId,
        type: 'CHURN_RISK',
        payload: { inactivePatients: inactive, riskLevel: inactive > 10 ? 'high' : 'medium' },
        confidence: 0.82,
      },
    });
    const forecast = await this.prisma.aiInsight.create({
      data: {
        organizationId: orgId,
        type: 'REVENUE_FORECAST',
        payload: {
          nextMonthEstimate: Number(revenue._sum.amount ?? 0) * 1.05,
          basedOnMonths: 6,
        },
        confidence: 0.75,
      },
    });
    return { generated: 2, items: [churn, forecast] };
  }

  createVoiceNote(orgId: string, data: { text: string; patientId?: string }) {
    return this.prisma.aiInsight.create({
      data: {
        organizationId: orgId,
        type: 'VOICE_NOTE',
        entityType: data.patientId ? 'Patient' : undefined,
        entityId: data.patientId,
        payload: { transcript: data.text, processedAt: new Date().toISOString() },
        confidence: 0.9,
      },
    });
  }

  reportBuilder(orgId: string, reportType: string) {
    const handlers: Record<string, () => Promise<unknown>> = {
      patients_by_tag: () =>
        this.prisma.patient.groupBy({
          by: ['organizationId'],
          where: { organizationId: orgId },
          _count: true,
        }),
      revenue_by_method: () =>
        this.prisma.payment.groupBy({
          by: ['method'],
          where: { organizationId: orgId },
          _sum: { amount: true },
          _count: true,
        }),
    };
    return handlers[reportType]?.() ?? Promise.resolve({ error: 'unknown_report' });
  }
}
