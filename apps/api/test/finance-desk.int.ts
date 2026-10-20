/**
 * The cash desk against a real Postgres: "today" is the clinic's day, not the server's; what is due
 * accounts for discounts; paid invoices drop out; patients with a visit today come first.
 */
import assert from 'node:assert/strict';
import { PrismaClient } from '@dentasmart/database';
import { tzOffsetMinutes } from '@dentasmart/shared';
import { FinanceService } from '../src/domains/finance.service';
import type { PrismaService } from '../src/prisma/prisma.service';

const prisma = new PrismaClient();
const finance = new FinanceService(prisma as unknown as PrismaService);
const stamp = Date.now().toString(36);

async function main() {
  const clinic = await prisma.organization.create({ data: { name: 'Тест кассы', slug: `desk-${stamp}` } });
  try {
    const branch = await prisma.branch.create({ data: { organizationId: clinic.id, name: 'Главный', timezone: 'Europe/Moscow' } });
    const offset = tzOffsetMinutes('Europe/Moscow', new Date());
    const wall = new Date(Date.now() + offset * 60000);
    const dayStart = new Date(Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate()) - offset * 60000);

    const late = await prisma.patient.create({ data: { organizationId: clinic.id, lastName: 'Поздняя', firstName: 'Ольга' } });
    const today = await prisma.patient.create({ data: { organizationId: clinic.id, lastName: 'Сегодняшний', firstName: 'Иван' } });
    const settled = await prisma.patient.create({ data: { organizationId: clinic.id, lastName: 'Расплатился', firstName: 'Пётр' } });

    const partial = await prisma.invoice.create({ data: { organizationId: clinic.id, patientId: late.id, number: `D1-${stamp}`, status: 'PARTIAL', totalAmount: '10000', discountAmount: '1000', paidAmount: '2000' } });
    await prisma.invoice.create({ data: { organizationId: clinic.id, patientId: today.id, number: `D2-${stamp}`, status: 'ISSUED', totalAmount: '5500' } });
    await prisma.invoice.create({ data: { organizationId: clinic.id, patientId: settled.id, number: `D3-${stamp}`, status: 'PAID', totalAmount: '3000', paidAmount: '3000' } });
    await prisma.appointment.create({ data: { organizationId: clinic.id, branchId: branch.id, patientId: today.id, startsAt: new Date(dayStart.getTime() + 10 * 3600000), endsAt: new Date(dayStart.getTime() + 11 * 3600000), status: 'COMPLETED' } });

    await prisma.payment.create({ data: { organizationId: clinic.id, patientId: late.id, invoiceId: partial.id, amount: '2000', method: 'CARD', paidAt: new Date(dayStart.getTime() + 23 * 3600000) } });
    await prisma.payment.create({ data: { organizationId: clinic.id, patientId: late.id, amount: '700', method: 'CASH', paidAt: new Date(dayStart.getTime() - 60000) } });

    const desk = await finance.desk(clinic.id);
    assert.equal(desk.totals.revenueToday, '2000.00', 'оплата в 23:00 по Москве — сегодня, в 23:59 вчера — нет');
    assert.equal(desk.totals.otherToday, '2000.00');
    assert.equal(desk.totals.cashToday, '0.00');
    assert.deepEqual(desk.due.map((row) => row.patient.name), ['Сегодняшний Иван', 'Поздняя Ольга'], 'сегодняшний визит первым, оплаченный счёт не в списке');
    assert.equal(desk.due[1].due, '7000.00', 'к оплате = сумма − скидка − оплачено');
    assert.equal(desk.totals.receivable, '12500.00');
    assert.equal(desk.totals.dueToday, '5500.00');
    assert.equal(desk.payments.length, 1);
    assert.equal(desk.payments[0].patient.name, 'Поздняя Ольга');
    assert.equal(desk.payments[0].refundable, '2000.00');

    const summary = await finance.summary(clinic.id);
    assert.equal(summary.revenueToday, 2000, 'сводка тоже считает день клиники');
    // Closing the shift: opening float + cash taken since opening is what the drawer should hold.
    const shift = await prisma.cashShift.create({ data: { organizationId: clinic.id, branchId: branch.id, openingCash: '5000', openedAt: new Date(Date.now() - 3600000) } });
    await prisma.payment.create({ data: { organizationId: clinic.id, patientId: today.id, amount: '1500.50', method: 'CASH', paidAt: new Date(Date.now() - 600000) } });
    const closed = await finance.closeShift(clinic.id, shift.id, { closingCash: 6200.5 });
    assert.equal(closed.expectedCash, '6500.50');
    assert.equal(closed.difference, '-300.00', 'недостача видна сразу');
    await assert.rejects(finance.closeShift(clinic.id, shift.id, { closingCash: 1 }), /не найдена|уже закрыли/, 'смену не закрыть дважды');
    console.log('finance desk ok');
  } finally {
    const org = clinic.id;
    await prisma.payment.deleteMany({ where: { organizationId: org } });
    await prisma.cashShift.deleteMany({ where: { organizationId: org } });
    await prisma.invoice.deleteMany({ where: { organizationId: org } });
    await prisma.appointment.deleteMany({ where: { organizationId: org } });
    await prisma.patient.deleteMany({ where: { organizationId: org } });
    await prisma.branch.deleteMany({ where: { organizationId: org } });
    await prisma.organization.delete({ where: { id: org } });
  }
}

main().finally(() => prisma.$disconnect());
