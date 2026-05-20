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
