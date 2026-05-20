import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

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

  summary(orgId: string) {
    return Promise.all([
      this.prisma.invoice.aggregate({
        where: { organizationId: orgId, status: { in: ['ISSUED', 'PARTIAL'] } },
        _sum: { totalAmount: true, paidAmount: true },
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
          paidAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
        },
        _sum: { amount: true },
      }),
    ]).then(([invoices, payments, todayPayments]) => ({
      openInvoices: invoices._count,
      receivable: Number(invoices._sum.totalAmount ?? 0) - Number(invoices._sum.paidAmount ?? 0),
      totalPayments: Number(payments._sum.amount ?? 0),
      paymentCount: payments._count,
      revenueToday: Number(todayPayments._sum.amount ?? 0),
    }));
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

  async createInvoiceFromPlan(orgId: string, planId: string) {
    const plan = await this.prisma.treatmentPlan.findFirst({
      where: { id: planId, organizationId: orgId },
      include: { items: true },
    });
    if (!plan) throw new NotFoundException('План лечения не найден');

    const existing = await this.prisma.invoice.findFirst({
      where: { treatmentPlanId: planId, status: { notIn: ['CANCELLED'] } },
    });
    if (existing) return existing;

    const completed = plan.items.filter((i) => i.isCompleted);
    const billItems = completed.length > 0 ? completed : plan.items;
    const total = billItems.reduce((s, i) => s + Number(i.price), 0);
    if (total <= 0) {
      throw new BadRequestException('Нет этапов с ценой для выставления счёта');
    }

    return this.createInvoice(orgId, {
      patientId: plan.patientId,
      number: this.nextInvoiceNumber(),
      totalAmount: total,
      treatmentPlanId: planId,
    });
  }

  createPayment(orgId: string, data: { patientId: string; amount: number; method: string; invoiceId?: string }) {
    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          organizationId: orgId,
          patientId: data.patientId,
          amount: data.amount,
          method: data.method as never,
          invoiceId: data.invoiceId,
        },
      });
      if (data.invoiceId) {
        const inv = await tx.invoice.findUnique({ where: { id: data.invoiceId } });
        if (inv) {
          const paid = Number(inv.paidAmount) + data.amount;
          await tx.invoice.update({
            where: { id: data.invoiceId },
            data: {
              paidAmount: paid,
              status: paid >= Number(inv.totalAmount) ? 'PAID' : 'PARTIAL',
            },
          });
        }
      }
      return payment;
    });
  }

  createPromo(orgId: string, data: { code: string; discountPct?: number }) {
    return this.prisma.promoCode.create({
      data: { organizationId: orgId, code: data.code, discountPct: data.discountPct },
    });
  }

  getOpenShift(orgId: string, branchId: string) {
    return this.prisma.cashShift.findFirst({
      where: { organizationId: orgId, branchId, status: 'OPEN' },
    });
  }

  async openShift(orgId: string, data: { branchId: string; openingCash: number; userId?: string }) {
    const existing = await this.getOpenShift(orgId, data.branchId);
    if (existing) throw new BadRequestException('Смена уже открыта');
    return this.prisma.cashShift.create({
      data: {
        organizationId: orgId,
        branchId: data.branchId,
        openingCash: data.openingCash,
        openedById: data.userId,
      },
    });
  }

  async closeShift(orgId: string, shiftId: string, data: { closingCash: number; notes?: string; userId?: string }) {
    const shift = await this.prisma.cashShift.findFirst({ where: { id: shiftId, organizationId: orgId } });
    if (!shift || shift.status !== 'OPEN') throw new BadRequestException('Смена не найдена');

    const since = shift.openedAt;
    const payments = await this.prisma.payment.findMany({
      where: { organizationId: orgId, paidAt: { gte: since } },
    });
    let cashTotal = 0;
    let cardTotal = 0;
    for (const p of payments) {
      const amt = Number(p.amount);
      if (p.method === 'CASH') cashTotal += amt;
      else if (p.method === 'CARD') cardTotal += amt;
    }

    return this.prisma.cashShift.update({
      where: { id: shiftId },
      data: {
        status: 'CLOSED',
        closingCash: data.closingCash,
        cashTotal,
        cardTotal,
        closedAt: new Date(),
        closedById: data.userId,
        notes: data.notes,
      },
    });
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

  async topUpDeposit(orgId: string, patientId: string, amount: number) {
    return this.prisma.patientDeposit.upsert({
      where: { patientId },
      create: { organizationId: orgId, patientId, balance: amount },
      update: { balance: { increment: amount } },
    });
  }

  async payFromDeposit(orgId: string, patientId: string, amount: number, invoiceId?: string) {
    const dep = await this.prisma.patientDeposit.findUnique({ where: { patientId } });
    if (!dep || Number(dep.balance) < amount) throw new BadRequestException('Недостаточно на депозите');
    await this.prisma.patientDeposit.update({
      where: { patientId },
      data: { balance: { decrement: amount } },
    });
    return this.createPayment(orgId, { patientId, amount, method: 'ONLINE', invoiceId });
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
    const monthly = data.totalAmount / data.months;
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
        data: { planId: plan.id, dueDate: due, amount: monthly },
      });
    }
    return this.prisma.installmentPlan.findUnique({
      where: { id: plan.id },
      include: { schedule: true },
    });
  }

  async payInstallmentLine(orgId: string, lineId: string, patientId: string) {
    const line = await this.prisma.installmentSchedule.findUnique({
      where: { id: lineId },
      include: { plan: true },
    });
    if (!line || line.plan.organizationId !== orgId) throw new BadRequestException();
    await this.createPayment(orgId, { patientId, amount: Number(line.amount), method: 'INSTALLMENT' });
    await this.prisma.installmentSchedule.update({
      where: { id: lineId },
      data: { status: 'PAID', paidAt: new Date() },
    });
    const paid = Number(line.plan.paidAmount) + Number(line.amount);
    await this.prisma.installmentPlan.update({
      where: { id: line.planId },
      data: {
        paidAmount: paid,
        status: paid >= Number(line.plan.totalAmount) ? 'COMPLETED' : 'ACTIVE',
      },
    });
    return { ok: true };
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
    return this.prisma.payrollRule.findMany({ where: { organizationId: orgId } });
  }

  createPayrollRule(orgId: string, data: { name: string; ruleType: string; paramsJson: object }) {
    return this.prisma.payrollRule.create({
      data: { organizationId: orgId, name: data.name, ruleType: data.ruleType as never, paramsJson: data.paramsJson },
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
