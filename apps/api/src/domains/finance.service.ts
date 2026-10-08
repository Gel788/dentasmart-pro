import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { resolveBranchId } from '../common/resolve-branch';

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

  summary(orgId: string) {
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
          paidAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
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
      const total = lines.reduce((sum, line) => sum + Number(line.price), 0);
      const paid = Number(invoice.paidAmount);
      return tx.invoice.update({
        where: { id: invoice.id },
        data: {
          totalAmount: total,
          status: paid <= 0 ? 'ISSUED' : paid >= total ? 'PAID' : 'PARTIAL',
        },
        include: { items: { orderBy: { title: 'asc' } } },
      });
    });
  }

  createPayment(orgId: string, data: { patientId: string; amount: number; method: string; invoiceId?: string }) {
    return this.prisma.$transaction(async (tx) => {
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
        const left = Number(policy.limitAmount) - Number(spent._sum.amount ?? 0);
        if (data.amount > left + 0.001) {
          throw new BadRequestException(`По полису осталось ${left.toLocaleString('ru-RU')} ₽`);
        }
      }
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

  async setDiscount(orgId: string, invoiceId: string, discountAmount: number) {
    const invoice = await this.prisma.invoice.findFirst({ where: { id: invoiceId, organizationId: orgId } });
    if (!invoice) throw new NotFoundException('Счёт не найден');
    const total = Number(invoice.totalAmount);
    const discount = Math.min(Math.max(0, discountAmount), total);
    const paid = Number(invoice.paidAmount);
    const due = total - discount;
    return this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        discountAmount: discount,
        status: paid <= 0 ? (invoice.status === 'CANCELLED' ? 'CANCELLED' : 'ISSUED') : paid >= due ? 'PAID' : 'PARTIAL',
      },
    });
  }

  async refundPayment(orgId: string, paymentId: string, amount: number) {
    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findFirst({ where: { id: paymentId, organizationId: orgId } });
      if (!payment || Number(payment.amount) <= 0) throw new BadRequestException('Оплата для возврата не найдена');
      const already = await tx.payment.aggregate({
        where: { refundOfId: paymentId },
        _sum: { amount: true },
      });
      const returned = Math.abs(Number(already._sum.amount ?? 0));
      const left = Number(payment.amount) - returned;
      if (amount <= 0 || amount > left + 0.001) {
        throw new BadRequestException(`К возврату доступно ${left.toLocaleString('ru-RU')} ₽`);
      }
      const refund = await tx.payment.create({
        data: {
          organizationId: orgId,
          patientId: payment.patientId,
          invoiceId: payment.invoiceId,
          amount: -amount,
          method: payment.method,
          refundOfId: payment.id,
        },
      });
      if (payment.invoiceId) {
        const inv = await tx.invoice.findUnique({ where: { id: payment.invoiceId } });
        if (inv) {
          const paid = Math.max(0, Number(inv.paidAmount) - amount);
          const due = Number(inv.totalAmount) - Number(inv.discountAmount);
          await tx.invoice.update({
            where: { id: inv.id },
            data: {
              paidAmount: paid,
              status: paid <= 0 ? 'ISSUED' : paid >= due ? 'PAID' : 'PARTIAL',
            },
          });
        }
      }
      return refund;
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
