import { BadRequestException, Controller, Get, Injectable, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, kopecks, tzOffsetMinutes } from '@dentasmart/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { CurrentUser } from '../common/current-user.decorator';
import { OrgId } from '../common/org.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { clinicianWhere } from './clinicians';

/**
 * Clinic reports for a period, every figure with one definition:
 * visits are appointments that start in the period; no-shows are counted against visits that were not
 * cancelled; money in is payments received minus refunds (bonus points are not money); billed is the
 * invoices issued in the period after discount; the average bill is billed ÷ invoices; debt is what is
 * owed on open invoices right now. Money is shown only to those allowed to see finance.
 */
const DAY = 86400000;
const r2 = (kop: number) => Math.round(kop) / 100;

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async report(orgId: string, permissions: string[], query: { from?: string; to?: string; doctorId?: string }) {
    const iso = /^\d{4}-\d{2}-\d{2}$/;
    if (!query.from || !query.to || !iso.test(query.from) || !iso.test(query.to)) throw new BadRequestException('Укажите период: from и to в формате ГГГГ-ММ-ДД');
    if (query.to < query.from) throw new BadRequestException('Конец периода раньше начала');
    const days = (Date.parse(query.to) - Date.parse(query.from)) / DAY + 1;
    if (days > 400) throw new BadRequestException('Период не длиннее 400 дней');

    const branch = await this.prisma.branch.findFirst({ where: { organizationId: orgId, isActive: true }, orderBy: { name: 'asc' }, select: { timezone: true } });
    const offset = tzOffsetMinutes(branch?.timezone || 'Europe/Moscow', new Date(`${query.from}T12:00:00Z`));
    const from = new Date(Date.parse(`${query.from}T00:00:00Z`) - offset * 60000);
    const to = new Date(Date.parse(`${query.to}T00:00:00Z`) + DAY - offset * 60000);
    const localDay = (at: Date) => new Date(at.getTime() + offset * 60000).toISOString().slice(0, 10);
    const money = permissions.includes('finance.read');
    const doctorId = query.doctorId || undefined;

    const [visits, doctors] = await Promise.all([
      this.prisma.appointment.findMany({
        where: { organizationId: orgId, startsAt: { gte: from, lt: to }, ...(doctorId ? { doctorId } : {}) },
        select: { id: true, patientId: true, doctorId: true, status: true, startsAt: true, endsAt: true },
      }),
      this.prisma.employee.findMany({ where: clinicianWhere(orgId), select: { id: true, firstName: true, lastName: true }, orderBy: { lastName: 'asc' } }),
    ]);
    const held = visits.filter((row) => row.status !== 'CANCELLED');
    const completed = visits.filter((row) => row.status === 'COMPLETED');
    const noShows = visits.filter((row) => row.status === 'NO_SHOW');
    const cancelled = visits.length - held.length;

    // New patients: their first visit that was not cancelled falls in the period.
    const patientIds = [...new Set(held.map((row) => row.patientId))];
    const earlier = patientIds.length
      ? await this.prisma.appointment.groupBy({ by: ['patientId'], where: { organizationId: orgId, patientId: { in: patientIds }, status: { not: 'CANCELLED' }, startsAt: { lt: from } }, _count: { _all: true } })
      : [];
    const returning = new Set(earlier.map((row) => row.patientId));
    const newPatients = patientIds.filter((id) => !returning.has(id)).length;

    const planDone = await this.prisma.treatmentPlanItem.count({ where: { completedAt: { gte: from, lt: to }, plan: { organizationId: orgId }, ...(doctorId ? { appointment: { doctorId } } : {}) } });

    let finance: null | {
      moneyIn: number; refunds: number; net: number; billed: number; invoices: number; averageBill: number; debtNow: number;
      byMethod: { method: string; amount: number }[];
    } = null;
    const moneyByDay = new Map<string, number>();
    const billedByDoctor = new Map<string, number>();
    if (money) {
      const [payments, invoices, open] = await Promise.all([
        this.prisma.payment.findMany({ where: { organizationId: orgId, paidAt: { gte: from, lt: to }, method: { not: 'BONUS' }, ...(doctorId ? { invoice: { appointment: { doctorId } } } : {}) }, select: { amount: true, method: true, paidAt: true, refundOfId: true } }),
        this.prisma.invoice.findMany({ where: { organizationId: orgId, createdAt: { gte: from, lt: to }, status: { notIn: ['CANCELLED', 'DRAFT'] }, ...(doctorId ? { appointment: { doctorId } } : {}) }, select: { totalAmount: true, discountAmount: true, appointment: { select: { doctorId: true } } } }),
        this.prisma.invoice.findMany({ where: { organizationId: orgId, status: { in: ['ISSUED', 'PARTIAL'] }, ...(doctorId ? { appointment: { doctorId } } : {}) }, select: { totalAmount: true, discountAmount: true, paidAmount: true } }),
      ]);
      let moneyIn = 0;
      let refunds = 0;
      const byMethod = new Map<string, number>();
      for (const payment of payments) {
        const value = kopecks(payment.amount);
        if (payment.refundOfId || value < 0) refunds += Math.abs(value);
        else moneyIn += value;
        byMethod.set(payment.method, (byMethod.get(payment.method) ?? 0) + value);
        const key = localDay(payment.paidAt);
        moneyByDay.set(key, (moneyByDay.get(key) ?? 0) + value);
      }
      let billed = 0;
      for (const invoice of invoices) {
        const value = kopecks(invoice.totalAmount) - kopecks(invoice.discountAmount);
        billed += value;
        if (invoice.appointment) {
          const doc = invoice.appointment.doctorId ?? '';
          billedByDoctor.set(doc, (billedByDoctor.get(doc) ?? 0) + value);
        }
      }
      const debtNow = open.reduce((sum, invoice) => sum + Math.max(0, kopecks(invoice.totalAmount) - kopecks(invoice.discountAmount) - kopecks(invoice.paidAmount)), 0);
      finance = {
        moneyIn: r2(moneyIn), refunds: r2(refunds), net: r2(moneyIn - refunds), billed: r2(billed), invoices: invoices.length,
        averageBill: invoices.length ? r2(billed / invoices.length) : 0, debtNow: r2(debtNow),
        byMethod: [...byMethod].map(([method, amount]) => ({ method, amount: r2(amount) })).sort((a, b) => b.amount - a.amount),
      };
    }

    const series: { date: string; visits: number; completed: number; money: number | null }[] = [];
    if (days <= 92) {
      for (let at = Date.parse(`${query.from}T00:00:00Z`); at <= Date.parse(`${query.to}T00:00:00Z`); at += DAY) {
        const date = new Date(at).toISOString().slice(0, 10);
        const day = held.filter((row) => localDay(row.startsAt) === date);
        series.push({ date, visits: day.length, completed: day.filter((row) => row.status === 'COMPLETED').length, money: money ? r2(moneyByDay.get(date) ?? 0) : null });
      }
    }

    const byDoctor = [...doctors, { id: '', firstName: '', lastName: 'Без врача' }]
      .map((doctor) => {
        const mine = held.filter((row) => (row.doctorId ?? '') === doctor.id);
        const done = mine.filter((row) => row.status === 'COMPLETED');
        return {
          id: doctor.id || null,
          name: `${doctor.lastName} ${doctor.firstName}`.trim(),
          visits: mine.length,
          completed: done.length,
          noShows: mine.filter((row) => row.status === 'NO_SHOW').length,
          chairHours: Math.round(done.reduce((sum, row) => sum + (+row.endsAt - +row.startsAt), 0) / 36e5 * 10) / 10,
          billed: money ? r2(billedByDoctor.get(doctor.id) ?? 0) : null,
        };
      })
      .filter((row) => row.visits > 0 || (row.id && !doctorId));

    return {
      period: { from: query.from, to: query.to, days },
      visits: { total: visits.length, held: held.length, completed: completed.length, cancelled, noShows: noShows.length, noShowRate: held.length ? Math.round((noShows.length / held.length) * 1000) / 10 : 0 },
      patients: { seen: patientIds.length, new: newPatients, returning: patientIds.length - newPatients },
      plans: { itemsDone: planDone },
      finance,
      series,
      byDoctor,
      doctors: doctors.map((row) => ({ id: row.id, name: `${row.lastName} ${row.firstName}` })),
    };
  }
}

@ApiTags('reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get()
  @RequirePermissions('schedule.read')
  report(@OrgId() orgId: string, @CurrentUser() user: AuthUser, @Query() query: { from?: string; to?: string; doctorId?: string }) {
    return this.reports.report(orgId, user.permissions, query);
  }
}
