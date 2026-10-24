import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { formatRub, fromKopecks, kopecks, tzOffsetMinutes } from '@dentasmart/shared';
import { inputKopecks, isUniqueViolation, paymentByKey, recordPayment, refreshInvoice, splitKopecks } from './invoice-ledger';
import { resolveBranchId } from '../common/resolve-branch';
import { clinicianWhere } from './clinicians';

function localDay(iso: string, end: boolean) {
  const [year, month, day] = iso.slice(0, 10).split('-').map(Number);
  return end
    ? new Date(year, month - 1, day, 23, 59, 59, 999)
    : new Date(year, month - 1, day, 0, 0, 0, 0);
}

@Injectable()
export class FinanceService {
  constructor(private readonly prisma: PrismaService) {}

  private nextInvoiceNumber() {
    return `СЧ-${Date.now().toString(36).toUpperCase()}`;
  }

  private async resolveServicePrice(orgId: string, serviceId: string) {
    const plItem = await this.prisma.priceListItem.findFirst({
      where: {
        serviceId,
        priceList: { organizationId: orgId, isActive: true, isDefault: true },
      },
    });
    if (plItem) return Number(plItem.price);
    const svc = await this.prisma.service.findFirst({ where: { id: serviceId, organizationId: orgId } });
    return svc ? Number(svc.basePrice) : 0;
  }

  /** Start and end of today in the clinic's time zone. */
  private async clinicDay(orgId: string, branchId?: string) {
    const branch = await this.prisma.branch.findFirst({
      where: { organizationId: orgId, ...(branchId ? { id: branchId } : {}), isActive: true },
      orderBy: { createdAt: 'asc' },
    });
    const now = new Date();
    const offset = tzOffsetMinutes(branch?.timezone ?? 'Europe/Moscow', now);
    const wall = new Date(now.getTime() + offset * 60000);
    const start = new Date(Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate()) - offset * 60000);
    return { branch, offset, start, end: new Date(start.getTime() + 86400000) };
  }

  /**
   * The money page in one call: what came in today, this week and this month (each against the period
   * before), thirty days for the sparkline, who owes, the instalments that fall due, and each doctor's take.
   * Refunds count against the day they were made; bonus points are not money.
   */
  async overview(orgId: string) {
    const { offset, start: today } = await this.clinicDay(orgId);
    const DAY = 86400000;
    const rub = (value: number) => Math.round(value) / 100;
    const wall = new Date(today.getTime() + offset * 60000);
    const weekday = (wall.getUTCDay() + 6) % 7;
    const week = new Date(today.getTime() - weekday * DAY);
    const month = new Date(Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), 1) - offset * 60000);
    const prevMonth = new Date(Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth() - 1, 1) - offset * 60000);
    const since = new Date(Math.min(prevMonth.getTime(), today.getTime() - 34 * DAY));
    const payments = await this.prisma.payment.findMany({
      where: { organizationId: orgId, paidAt: { gte: since }, method: { not: 'BONUS' } },
      select: { amount: true, paidAt: true, refundOfId: true, invoice: { select: { appointment: { select: { doctorId: true } } } } },
    });
    const signed = (row: (typeof payments)[number]) => (row.refundOfId ? -Math.abs(kopecks(row.amount)) : kopecks(row.amount));
    const sum = (from: Date, to: Date) => payments.filter((row) => row.paidAt >= from && row.paidAt < to).reduce((total, row) => total + signed(row), 0);
    const now = new Date();
    const elapsed = now.getTime() - today.getTime();
    const series = Array.from({ length: 30 }, (_, index) => {
      const from = new Date(today.getTime() - (29 - index) * DAY);
      return { date: new Date(from.getTime() + offset * 60000).toISOString().slice(0, 10), amount: rub(sum(from, new Date(from.getTime() + DAY))) };
    });
    const doctors = await this.prisma.employee.findMany({ where: clinicianWhere(orgId), select: { id: true, firstName: true, lastName: true } });
    const byDoctor = new Map<string, number>();
    for (const row of payments.filter((item) => item.paidAt >= month)) {
      const id = row.invoice?.appointment?.doctorId ?? '';
      byDoctor.set(id, (byDoctor.get(id) ?? 0) + signed(row));
    }
    const open = await this.prisma.invoice.findMany({
      where: { organizationId: orgId, status: { in: ['ISSUED', 'PARTIAL'] } },
      select: { patientId: true, totalAmount: true, paidAmount: true, discountAmount: true, createdAt: true, patient: { select: { firstName: true, lastName: true, phone: true } } },
    });
    const debts = new Map<string, { patientId: string; name: string; phone: string | null; amount: number; since: Date }>();
    for (const row of open) {
      const left = kopecks(row.totalAmount) - kopecks(row.discountAmount) - kopecks(row.paidAmount);
      if (left <= 0) continue;
      const entry = debts.get(row.patientId) ?? { patientId: row.patientId, name: `${row.patient.lastName} ${row.patient.firstName}`, phone: row.patient.phone, amount: 0, since: row.createdAt };
      entry.amount += left;
      if (row.createdAt < entry.since) entry.since = row.createdAt;
      debts.set(row.patientId, entry);
    }
    const debtors = [...debts.values()].sort((a, b) => b.amount - a.amount);
    const lines = await this.prisma.installmentSchedule.findMany({
      where: { status: { in: ['PENDING', 'OVERDUE'] }, dueDate: { lt: new Date(today.getTime() + 31 * DAY) }, plan: { organizationId: orgId, status: 'ACTIVE' } },
      orderBy: { dueDate: 'asc' },
      take: 20,
      select: { id: true, dueDate: true, amount: true, plan: { select: { months: true, patientId: true, patient: { select: { firstName: true, lastName: true } } } } },
    });
    const period = (from: Date, to: Date, prevFrom: Date, prevTo: Date) => ({ amount: rub(sum(from, to)), previous: rub(sum(prevFrom, prevTo)) });
    return {
      today: period(today, new Date(today.getTime() + DAY), new Date(today.getTime() - DAY), new Date(today.getTime() - DAY + elapsed)),
      week: period(week, new Date(today.getTime() + DAY), new Date(week.getTime() - 7 * DAY), new Date(week.getTime() - 7 * DAY + (now.getTime() - week.getTime()))),
      month: period(month, new Date(today.getTime() + DAY), prevMonth, new Date(prevMonth.getTime() + (now.getTime() - month.getTime()))),
      series,
      debt: { total: rub(debtors.reduce((total, row) => total + row.amount, 0)), patients: debtors.length, top: debtors.slice(0, 8).map((row) => ({ ...row, amount: rub(row.amount), since: row.since.toISOString() })) },
      installments: lines.map((row) => ({ id: row.id, dueDate: row.dueDate.toISOString(), amount: Number(row.amount), overdue: row.dueDate < today, patientId: row.plan.patientId, patient: `${row.plan.patient.lastName} ${row.plan.patient.firstName}`, months: row.plan.months })),
      doctors: [...byDoctor.entries()]
        .map(([id, amount]) => {
          const doctor = doctors.find((row) => row.id === id);
          return { id: id || null, name: doctor ? `${doctor.lastName} ${doctor.firstName}` : 'Без врача', amount: rub(amount) };
        })
        .filter((row) => row.amount !== 0)
        .sort((a, b) => b.amount - a.amount),
    };
  }

  async summary(orgId: string) {
    const { start, end } = await this.clinicDay(orgId);
    return Promise.all([
      this.prisma.invoice.aggregate({
        where: { organizationId: orgId, status: { in: ['ISSUED', 'PARTIAL'] } },
        _sum: { totalAmount: true, paidAmount: true, discountAmount: true },
        _count: true,
      }),
      this.prisma.payment.aggregate({
        where: { organizationId: orgId },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.payment.aggregate({
        where: {
          organizationId: orgId,
          paidAt: { gte: start, lt: end },
        },
        _sum: { amount: true },
      }),
    ]).then(([invoices, payments, todayPayments]) => ({
      openInvoices: invoices._count,
      receivable:
        Number(invoices._sum.totalAmount ?? 0) -
        Number(invoices._sum.paidAmount ?? 0) -
        Number(invoices._sum.discountAmount ?? 0),
      totalPayments: Number(payments._sum.amount ?? 0),
      paymentCount: payments._count,
      revenueToday: Number(todayPayments._sum.amount ?? 0),
    }));
  }

  /**
   * The cash desk: today's money in the clinic's own day (branch time zone, not the server's),
   * every invoice that still has something to pay with today's visits first, and today's payments.
   */
  async desk(orgId: string, branchId?: string) {
    const { branch, offset, start: dayStart, end: dayEnd } = await this.clinicDay(orgId, branchId);

    const [open, payments, visits] = await Promise.all([
      this.prisma.invoice.findMany({
        where: { organizationId: orgId, status: { in: ['ISSUED', 'PARTIAL'] } },
        include: { patient: { select: { id: true, firstName: true, lastName: true, phone: true } }, appointment: { select: { startsAt: true } } },
        orderBy: { createdAt: 'desc' },
        take: 500,
      }),
      this.prisma.payment.findMany({
        where: { organizationId: orgId, paidAt: { gte: dayStart, lt: dayEnd } },
        include: { invoice: { select: { number: true } }, refunds: { select: { amount: true } } },
        orderBy: { paidAt: 'desc' },
      }),
      this.prisma.appointment.findMany({
        where: { organizationId: orgId, startsAt: { gte: dayStart, lt: dayEnd }, status: { notIn: ['CANCELLED', 'NO_SHOW'] } },
        select: { patientId: true, startsAt: true, status: true },
      }),
    ]);
    const todayByPatient = new Map(visits.map((visit) => [visit.patientId, visit]));
    const payers = await this.prisma.patient.findMany({
      where: { organizationId: orgId, id: { in: [...new Set(payments.map((payment) => payment.patientId))] } },
      select: { id: true, firstName: true, lastName: true },
    });
    const payerName = new Map(payers.map((row) => [row.id, `${row.lastName} ${row.firstName}`.trim()]));
    const due = open
      .map((invoice) => {
        const total = kopecks(invoice.totalAmount);
        const discount = kopecks(invoice.discountAmount);
        const paid = kopecks(invoice.paidAmount);
        const left = Math.max(0, total - discount - paid);
        const today = todayByPatient.get(invoice.patientId);
        return {
          invoiceId: invoice.id,
          number: invoice.number,
          createdAt: invoice.createdAt,
          dueDate: invoice.dueDate,
          promiseNote: invoice.promiseNote,
          patient: { id: invoice.patient.id, name: `${invoice.patient.lastName} ${invoice.patient.firstName}`.trim(), phone: invoice.patient.phone },
          total: fromKopecks(total),
          discount: fromKopecks(discount),
          paid: fromKopecks(paid),
          due: fromKopecks(left),
          dueKopecks: left,
          visitToday: today ? { startsAt: today.startsAt, status: today.status } : null,
        };
      })
      .filter((row) => row.dueKopecks > 0)
      .sort((a, b) => Number(!!b.visitToday) - Number(!!a.visitToday) || +new Date(b.createdAt) - +new Date(a.createdAt));

    const sum = (rows: { amount: unknown }[]) => rows.reduce((acc, row) => acc + kopecks(row.amount as string), 0);
    const cash = payments.filter((payment) => payment.method === 'CASH');
    const card = payments.filter((payment) => payment.method !== 'CASH');
    return {
      day: new Date(dayStart.getTime() + offset * 60000).toISOString().slice(0, 10),
      timezone: branch?.timezone ?? 'Europe/Moscow',
      branchId: branch?.id ?? null,
      totals: {
        revenueToday: fromKopecks(sum(payments)),
        cashToday: fromKopecks(sum(cash)),
        otherToday: fromKopecks(sum(card)),
        receivable: fromKopecks(due.reduce((acc, row) => acc + row.dueKopecks, 0)),
        openInvoices: due.length,
        dueToday: fromKopecks(due.filter((row) => row.visitToday).reduce((acc, row) => acc + row.dueKopecks, 0)),
      },
      due: due.map(({ dueKopecks: _drop, ...row }) => row),
      payments: payments.map((payment) => {
        const amount = kopecks(payment.amount);
        const refunded = Math.abs(sum(payment.refunds));
        return {
          id: payment.id,
          paidAt: payment.paidAt,
          amount: fromKopecks(amount),
          method: payment.method,
          isRefund: amount < 0,
          refundable: amount > 0 ? fromKopecks(Math.max(0, amount - refunded)) : '0.00',
          patient: { id: payment.patientId, name: payerName.get(payment.patientId) ?? 'Пациент' },
          invoiceNumber: payment.invoice?.number ?? null,
        };
      }),
    };
  }

  listInvoices(orgId: string, patientId?: string) {
    return this.prisma.invoice.findMany({
      where: { organizationId: orgId, ...(patientId ? { patientId } : {}) },
      include: { patient: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { createdAt: 'desc' },
      take: patientId ? 100 : 50,
    });
  }

  listPayments(orgId: string, patientId?: string) {
    return this.prisma.payment.findMany({
      where: { organizationId: orgId, ...(patientId ? { patientId } : {}) },
      orderBy: { paidAt: 'desc' },
      take: patientId ? 100 : 50,
    });
  }

  listPromos(orgId: string) {
    return this.prisma.promoCode.findMany({ where: { organizationId: orgId } });
  }

  listPriceLists(orgId: string) {
    return this.prisma.priceList.findMany({
      where: { organizationId: orgId },
      include: { items: { include: { service: true } } },
    });
  }

  createInvoice(
    orgId: string,
    data: {
      patientId: string;
      number: string;
      totalAmount: number;
      appointmentId?: string;
      treatmentPlanId?: string;
    },
  ) {
    return this.prisma.invoice.create({
      data: {
        organizationId: orgId,
        patientId: data.patientId,
        number: data.number,
        totalAmount: data.totalAmount,
        status: 'ISSUED',
        appointmentId: data.appointmentId,
        treatmentPlanId: data.treatmentPlanId,
      },
      include: { patient: { select: { id: true, firstName: true, lastName: true } } },
    });
  }

  async getInvoice(orgId: string, id: string) {
    const inv = await this.prisma.invoice.findFirst({
      where: { id, organizationId: orgId },
      include: {
        patient: true,
        organization: { select: { name: true } },
        payments: { orderBy: { paidAt: 'desc' } },
        items: { orderBy: { title: 'asc' } },
      },
    });
    if (!inv) throw new NotFoundException('Счёт не найден');
    return inv;
  }

  async createInvoiceFromAppointment(orgId: string, appointmentId: string) {
    const appt = await this.prisma.appointment.findFirst({
      where: { id: appointmentId, organizationId: orgId },
      include: { service: true },
    });
    if (!appt) throw new NotFoundException('Запись не найдена');

    const existing = await this.prisma.invoice.findFirst({
      where: { appointmentId, status: { notIn: ['CANCELLED'] } },
    });
    if (existing) return existing;

    let amount = 0;
    if (appt.serviceId) {
      amount = await this.resolveServicePrice(orgId, appt.serviceId);
    }
    if (amount <= 0) {
      throw new BadRequestException('У записи нет услуги с ценой — укажите услугу в расписании');
    }

    return this.createInvoice(orgId, {
      patientId: appt.patientId,
      number: this.nextInvoiceNumber(),
      totalAmount: amount,
      appointmentId,
    });
  }

  async createInvoiceFromPlan(
    orgId: string,
    planId: string,
    body: { itemIds?: string[]; appointmentId?: string } = {},
  ) {
    const plan = await this.prisma.treatmentPlan.findFirst({
      where: { id: planId, organizationId: orgId },
      include: { items: { include: { invoiceItem: true } } },
    });
    if (!plan) throw new NotFoundException('План лечения не найден');

    const pool = body.itemIds?.length
      ? plan.items.filter((item) => body.itemIds!.includes(item.id))
      : plan.items.filter((item) => item.status === 'ACCEPTED' || item.status === 'DONE');
    const fresh = pool.filter((item) => item.status !== 'REJECTED' && !item.invoiceItem);
    if (!fresh.length) {
      throw new BadRequestException('Нет согласованных строк, которые ещё не в наряде');
    }

    const appointmentId = body.appointmentId || plan.appointmentId || null;

    return this.prisma.$transaction(async (tx) => {
      let invoice = await tx.invoice.findFirst({
        where: {
          organizationId: orgId,
          treatmentPlanId: planId,
          status: { in: ['DRAFT', 'ISSUED', 'PARTIAL'] },
          items: { some: {} },
        },
        orderBy: { createdAt: 'desc' },
      });
      if (!invoice) {
        invoice = await tx.invoice.create({
          data: {
            organizationId: orgId,
            patientId: plan.patientId,
            treatmentPlanId: planId,
            appointmentId,
            number: this.nextInvoiceNumber(),
            status: 'ISSUED',
            totalAmount: 0,
          },
        });
      }
      await tx.invoiceItem.createMany({
        data: fresh.map((item) => ({
          invoiceId: invoice!.id,
          planItemId: item.id,
          serviceId: item.serviceId,
          toothNum: item.toothNum,
          title: item.title,
          price: item.price,
        })),
      });
      const lines = await tx.invoiceItem.findMany({ where: { invoiceId: invoice.id } });
      const total = lines.reduce((sum, line) => sum + kopecks(line.price), 0);
      await tx.invoice.update({ where: { id: invoice.id }, data: { totalAmount: fromKopecks(total) } });
      await refreshInvoice(tx, orgId, invoice.id);
      return tx.invoice.findUniqueOrThrow({ where: { id: invoice.id }, include: { items: { orderBy: { title: 'asc' } } } });
    });
  }

  async createPayment(
    orgId: string,
    data: { patientId: string; amount: number | string; method: string; invoiceId?: string },
    actor: { userId?: string; idempotencyKey?: string } = {},
  ) {
    const amount = inputKopecks(data.amount);
    if (amount <= 0) throw new BadRequestException('Укажите сумму больше нуля');
    const repeated = await paymentByKey(this.prisma, orgId, actor.idempotencyKey);
    if (repeated) return repeated;
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (data.method === 'DMS') {
          const policy = await tx.insurancePolicy.findFirst({
            where: {
              organizationId: orgId,
              patientId: data.patientId,
              OR: [{ validTo: null }, { validTo: { gte: new Date() } }],
            },
            orderBy: { createdAt: 'desc' },
          });
          if (!policy) throw new BadRequestException('У пациента нет действующего полиса ДМС');
          const spent = await tx.payment.aggregate({
            where: { organizationId: orgId, patientId: data.patientId, method: 'DMS' },
            _sum: { amount: true },
          });
          const left = kopecks(policy.limitAmount) - kopecks(spent._sum.amount);
          if (amount > left) throw new BadRequestException(`По полису осталось ${formatRub(left)}`);
        }
        return recordPayment(tx, {
          organizationId: orgId,
          patientId: data.patientId,
          invoiceId: data.invoiceId,
          amountKopecks: amount,
          method: data.method as never,
          createdById: actor.userId,
          idempotencyKey: actor.idempotencyKey,
        });
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        const first = await paymentByKey(this.prisma, orgId, actor.idempotencyKey);
        if (first) return first;
      }
      throw error;
    }
  }

  async setDiscount(orgId: string, invoiceId: string, discountAmount: number | string) {
    return this.prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findFirst({ where: { id: invoiceId, organizationId: orgId } });
      if (!invoice) throw new NotFoundException('Счёт не найден');
      const discount = Math.min(Math.max(0, inputKopecks(discountAmount)), kopecks(invoice.totalAmount));
      await tx.invoice.update({ where: { id: invoiceId }, data: { discountAmount: fromKopecks(discount) } });
      return refreshInvoice(tx, orgId, invoiceId);
    });
  }

  async refundPayment(orgId: string, paymentId: string, amountRub: number | string, actor: { userId?: string; idempotencyKey?: string } = {}) {
    const amount = inputKopecks(amountRub);
    const repeated = await paymentByKey(this.prisma, orgId, actor.idempotencyKey);
    if (repeated) return repeated;
    return this.prisma.$transaction(async (tx) => {
      // Lock the original payment so two refunds of it cannot both pass the limit check.
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM payments WHERE id = ${paymentId} AND "organizationId" = ${orgId} FOR UPDATE`;
      const payment = locked.length ? await tx.payment.findUnique({ where: { id: paymentId } }) : null;
      if (!payment || kopecks(payment.amount) <= 0) throw new BadRequestException('Оплата для возврата не найдена');
      const already = await tx.payment.aggregate({ where: { refundOfId: paymentId }, _sum: { amount: true } });
      const left = kopecks(payment.amount) - Math.abs(kopecks(already._sum.amount));
      if (amount <= 0 || amount > left) throw new BadRequestException(`К возврату доступно ${formatRub(left)}`);
      return recordPayment(tx, {
        organizationId: orgId,
        patientId: payment.patientId,
        invoiceId: payment.invoiceId,
        amountKopecks: -amount,
        method: payment.method,
        refundOfId: payment.id,
        createdById: actor.userId,
        idempotencyKey: actor.idempotencyKey,
      });
    });
  }

  createPromo(orgId: string, data: { code: string; discountPct?: number }) {
    return this.prisma.promoCode.create({
      data: { organizationId: orgId, code: data.code, discountPct: data.discountPct },
    });
  }

  async getOpenShift(orgId: string, branchId?: string) {
    const id = await resolveBranchId(this.prisma, orgId, branchId);
    return this.prisma.cashShift.findFirst({
      where: { organizationId: orgId, branchId: id, status: 'OPEN' },
    });
  }

  async openShift(orgId: string, data: { branchId: string; openingCash: number; userId?: string }) {
    const branchId = await resolveBranchId(this.prisma, orgId, data.branchId);
    const existing = await this.getOpenShift(orgId, branchId);
    if (existing) throw new BadRequestException('Смена уже открыта');
    return this.prisma.cashShift.create({
      data: {
        organizationId: orgId,
        branchId,
        openingCash: data.openingCash,
        openedById: data.userId,
      },
    });
  }

  async closeShift(orgId: string, shiftId: string, data: { closingCash: number; notes?: string; userId?: string }) {
    const shift = await this.prisma.cashShift.findFirst({ where: { id: shiftId, organizationId: orgId } });
    if (!shift || shift.status !== 'OPEN') throw new BadRequestException('Смена не найдена');

    const closingCash = inputKopecks(data.closingCash);
    if (closingCash < 0) throw new BadRequestException('Укажите, сколько наличных в кассе');
    const payments = await this.prisma.payment.findMany({
      where: { organizationId: orgId, paidAt: { gte: shift.openedAt } },
    });
    let cash = 0;
    let card = 0;
    for (const payment of payments) {
      if (payment.method === 'CASH') cash += kopecks(payment.amount);
      else if (payment.method === 'CARD') card += kopecks(payment.amount);
    }
    const expected = kopecks(shift.openingCash) + cash;
    const closed = await this.prisma.cashShift.updateMany({
      where: { id: shiftId, organizationId: orgId, status: 'OPEN' },
      data: {
        status: 'CLOSED',
        closingCash: fromKopecks(closingCash),
        cashTotal: fromKopecks(cash),
        cardTotal: fromKopecks(card),
        closedAt: new Date(),
        closedById: data.userId,
        notes: data.notes,
      },
    });
    if (!closed.count) throw new BadRequestException('Смену уже закрыли');
    const row = await this.prisma.cashShift.findUniqueOrThrow({ where: { id: shiftId } });
    // What the drawer should hold and how far the count is from it; the cashier sees it before leaving.
    return { ...row, expectedCash: fromKopecks(expected), difference: fromKopecks(closingCash - expected) };
  }

  listShifts(orgId: string) {
    return this.prisma.cashShift.findMany({
      where: { organizationId: orgId },
      orderBy: { openedAt: 'desc' },
      take: 20,
    });
  }

  listDeposits(orgId: string) {
    return this.prisma.patientDeposit.findMany({
      where: { organizationId: orgId },
      include: { patient: { select: { id: true, firstName: true, lastName: true } } },
    });
  }

  async topUpDeposit(orgId: string, patientId: string, amountRub: number | string) {
    const amount = inputKopecks(amountRub);
    if (amount <= 0) throw new BadRequestException('Укажите сумму больше нуля');
    const patient = await this.prisma.patient.findFirst({ where: { id: patientId, organizationId: orgId }, select: { id: true } });
    if (!patient) throw new NotFoundException('Пациент не найден');
    return this.prisma.patientDeposit.upsert({
      where: { patientId },
      create: { organizationId: orgId, patientId, balance: fromKopecks(amount) },
      update: { balance: { increment: fromKopecks(amount) } },
    });
  }

  async payFromDeposit(orgId: string, patientId: string, amountRub: number | string, invoiceId?: string, actor: { userId?: string; idempotencyKey?: string } = {}) {
    const amount = inputKopecks(amountRub);
    if (amount <= 0) throw new BadRequestException('Укажите сумму больше нуля');
    const repeated = await paymentByKey(this.prisma, orgId, actor.idempotencyKey);
    if (repeated) return repeated;
    return this.prisma.$transaction(async (tx) => {
      // The balance check and the decrement are one statement, so the deposit cannot go below zero.
      const taken = await tx.patientDeposit.updateMany({
        where: { patientId, organizationId: orgId, balance: { gte: fromKopecks(amount) } },
        data: { balance: { decrement: fromKopecks(amount) } },
      });
      if (!taken.count) throw new BadRequestException('Недостаточно на депозите');
      return recordPayment(tx, {
        organizationId: orgId,
        patientId,
        invoiceId,
        amountKopecks: amount,
        method: 'ONLINE',
        createdById: actor.userId,
        idempotencyKey: actor.idempotencyKey,
      });
    });
  }

  listInstallments(orgId: string) {
    return this.prisma.installmentPlan.findMany({
      where: { organizationId: orgId },
      include: { schedule: true, patient: { select: { firstName: true, lastName: true } } },
    });
  }

  async createInstallment(
    orgId: string,
    data: { patientId: string; invoiceId?: string; totalAmount: number; months: number },
  ) {
    if (!Number.isInteger(data.months) || data.months < 1 || data.months > 36) throw new BadRequestException('Рассрочка от 1 до 36 месяцев');
    const parts = splitKopecks(inputKopecks(data.totalAmount), data.months);
    const plan = await this.prisma.installmentPlan.create({
      data: {
        organizationId: orgId,
        patientId: data.patientId,
        invoiceId: data.invoiceId,
        totalAmount: data.totalAmount,
        months: data.months,
      },
    });
    const now = new Date();
    for (let i = 0; i < data.months; i++) {
      const due = new Date(now);
      due.setMonth(due.getMonth() + i + 1);
      await this.prisma.installmentSchedule.create({
        data: { planId: plan.id, dueDate: due, amount: fromKopecks(parts[i]) },
      });
    }
    return this.prisma.installmentPlan.findUnique({
      where: { id: plan.id },
      include: { schedule: true },
    });
  }

  async payInstallmentLine(orgId: string, lineId: string, _patientId?: string, actor: { userId?: string } = {}) {
    return this.prisma.$transaction(async (tx) => {
      const line = await tx.installmentSchedule.findUnique({ where: { id: lineId }, include: { plan: true } });
      if (!line || line.plan.organizationId !== orgId) throw new NotFoundException('Платёж рассрочки не найден');
      // Claim the line first: a second click finds it already paid and stops here.
      const claimed = await tx.installmentSchedule.updateMany({
        where: { id: lineId, status: { not: 'PAID' } },
        data: { status: 'PAID', paidAt: new Date() },
      });
      if (!claimed.count) throw new BadRequestException('Этот платёж уже внесён');
      await recordPayment(tx, {
        organizationId: orgId,
        patientId: line.plan.patientId,
        invoiceId: line.plan.invoiceId,
        amountKopecks: kopecks(line.amount),
        method: 'INSTALLMENT',
        createdById: actor.userId,
      });
      const plan = await tx.installmentPlan.update({
        where: { id: line.planId },
        data: { paidAmount: { increment: fromKopecks(kopecks(line.amount)) } },
      });
      if (kopecks(plan.paidAmount) >= kopecks(plan.totalAmount)) {
        await tx.installmentPlan.update({ where: { id: plan.id }, data: { status: 'COMPLETED' } });
      }
      return { ok: true };
    });
  }

  listFamilyGroups(orgId: string) {
    return this.prisma.familyGroup.findMany({
      where: { organizationId: orgId },
      include: {
        members: {
          include: {
            patient: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
    });
  }

  createFamilyGroup(orgId: string, data: { name: string; patientIds: string[] }) {
    return this.prisma.familyGroup.create({
      data: {
        organizationId: orgId,
        name: data.name,
        members: {
          create: data.patientIds.map((patientId, i) => ({
            patientId,
            role: i === 0 ? 'HEAD' : 'MEMBER',
          })),
        },
      },
      include: { members: { include: { patient: true } } },
    });
  }

  listPayrollRules(orgId: string) {
    return this.prisma.payrollRule.findMany({
      where: { organizationId: orgId },
      include: { employee: { select: { firstName: true, lastName: true } } },
    });
  }

  createPayrollRule(
    orgId: string,
    data: { name: string; ruleType?: string; paramsJson?: object; employeeId?: string; percent?: number },
  ) {
    const percent = data.percent ?? Number((data.paramsJson as { percent?: number } | undefined)?.percent ?? 0);
    return this.prisma.payrollRule.create({
      data: {
        organizationId: orgId,
        name: data.name,
        employeeId: data.employeeId,
        ruleType: (data.ruleType ?? 'PERCENT_REVENUE') as never,
        paramsJson: { ...(data.paramsJson ?? {}), percent },
      },
      include: { employee: { select: { firstName: true, lastName: true } } },
    });
  }

  async accruePayroll(orgId: string, periodFrom: string, periodTo: string) {
    const from = localDay(periodFrom, false);
    const to = localDay(periodTo, true);
    const rules = await this.prisma.payrollRule.findMany({
      where: { organizationId: orgId, isActive: true, ruleType: 'PERCENT_REVENUE', employeeId: { not: null } },
    });
    const entries: { id: string; amount: unknown; employee?: { firstName: string; lastName: string } }[] = [];
    for (const rule of rules) {
      const percent = Number((rule.paramsJson as { percent?: number }).percent ?? 0);
      if (!rule.employeeId || percent <= 0) continue;
      const payments = await this.prisma.payment.findMany({
        where: {
          organizationId: orgId,
          paidAt: { gte: from, lte: to },
          OR: [
            { invoice: { appointment: { doctorId: rule.employeeId } } },
            {
              invoice: {
                treatmentPlan: { doctorId: rule.employeeId },
                OR: [{ appointmentId: null }, { appointment: { doctorId: null } }],
              },
            },
          ],
        },
        include: { invoice: { select: { id: true, discountAmount: true } } },
      });
      const gross = payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
      const seen = new Set<string>();
      let discount = 0;
      for (const payment of payments) {
        if (!payment.invoice || seen.has(payment.invoice.id)) continue;
        seen.add(payment.invoice.id);
        const onInvoice = payments
          .filter((row) => row.invoice?.id === payment.invoice?.id)
          .reduce((sum, row) => sum + Number(row.amount), 0);
        discount += Math.min(Number(payment.invoice.discountAmount), Math.max(0, onInvoice));
      }
      const lab = await this.prisma.labOrder.aggregate({
        where: {
          organizationId: orgId,
          doctorId: rule.employeeId,
          status: { not: 'REJECTED' },
          createdAt: { gte: from, lte: to },
        },
        _sum: { costAmount: true },
      });
      const labCost = Number(lab._sum.costAmount ?? 0);
      const base = Math.max(0, Math.round((gross - discount - labCost) * 100) / 100);
      const amount = Math.round(base * percent) / 100;
      const existing = await this.prisma.payrollEntry.findFirst({
        where: { employeeId: rule.employeeId, periodFrom: from, periodTo: to },
      });
      const detailsJson = { payments: Math.round(gross * 100) / 100, discount, lab: labCost, base, percent, paymentCount: payments.length };
      const entry = existing
        ? await this.prisma.payrollEntry.update({
            where: { id: existing.id },
            data: { amount, detailsJson },
            include: { employee: { select: { firstName: true, lastName: true } } },
          })
        : await this.prisma.payrollEntry.create({
            data: { employeeId: rule.employeeId, periodFrom: from, periodTo: to, amount, detailsJson },
            include: { employee: { select: { firstName: true, lastName: true } } },
          });
      entries.push(entry);
    }
    return { count: entries.length, entries };
  }

  listPolicies(orgId: string) {
    return this.prisma.insurancePolicy.findMany({
      where: { organizationId: orgId },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true } },
        insurer: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createPolicy(
    orgId: string,
    data: { patientId: string; insurerName: string; number: string; limitAmount: number; validTo?: string; letterNumber?: string },
  ) {
    const patient = await this.prisma.patient.findFirst({ where: { id: data.patientId, organizationId: orgId } });
    if (!patient) throw new NotFoundException('Пациент не найден');
    const insurer = await this.prisma.insurer.upsert({
      where: { organizationId_name: { organizationId: orgId, name: data.insurerName.trim() } },
      create: { organizationId: orgId, name: data.insurerName.trim() },
      update: {},
    });
    return this.prisma.insurancePolicy.create({
      data: {
        organizationId: orgId,
        patientId: data.patientId,
        insurerId: insurer.id,
        number: data.number.trim(),
        letterNumber: data.letterNumber?.trim() || null,
        limitAmount: data.limitAmount,
        validTo: data.validTo ? new Date(data.validTo) : null,
      },
      include: {
        patient: { select: { firstName: true, lastName: true } },
        insurer: { select: { name: true } },
      },
    });
  }

  async dmsRegistry(orgId: string, from: string, to: string) {
    const payments = await this.prisma.payment.findMany({
      where: {
        organizationId: orgId,
        method: 'DMS',
        amount: { gt: 0 },
        paidAt: { gte: localDay(from, false), lte: localDay(to, true) },
      },
      include: { invoice: { select: { number: true } } },
      orderBy: { paidAt: 'asc' },
    });
    const [policies, patients] = await Promise.all([
      this.prisma.insurancePolicy.findMany({
        where: { organizationId: orgId, patientId: { in: payments.map((payment) => payment.patientId) } },
        include: { insurer: { select: { name: true } } },
      }),
      this.prisma.patient.findMany({
        where: { id: { in: payments.map((payment) => payment.patientId) } },
        select: { id: true, firstName: true, lastName: true },
      }),
    ]);
    return payments.map((payment) => {
      const policy = policies.find((row) => row.patientId === payment.patientId);
      const patient = patients.find((row) => row.id === payment.patientId);
      return {
        id: payment.id,
        paidAt: payment.paidAt,
        amount: payment.amount,
        patient: patient ?? { id: payment.patientId, firstName: '', lastName: 'Пациент' },
        invoiceNumber: payment.invoice?.number ?? null,
        insurer: policy?.insurer.name ?? null,
        policyNumber: policy?.number ?? null,
        letterNumber: policy?.letterNumber ?? null,
      };
    });
  }

  listPayrollEntries(orgId: string) {
    return this.prisma.payrollEntry.findMany({
      where: { employee: { user: { organizationId: orgId } } },
      include: { employee: { select: { firstName: true, lastName: true } } },
      orderBy: { periodTo: 'desc' },
      take: 50,
    });
  }

  listLoyalty(orgId: string) {
    return this.prisma.loyaltyProgram.findMany({
      where: { organizationId: orgId },
      include: { accounts: { include: { patient: { select: { firstName: true, lastName: true } } } } },
    });
  }
}
