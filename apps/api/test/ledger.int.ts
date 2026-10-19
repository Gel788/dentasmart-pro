/**
 * Money against a real Postgres (DATABASE_URL). Builds its own clinic, runs the cashier's worst days
 * (double clicks, two tills at once, refunds over the limit, someone else's patient) and removes the clinic.
 */
import assert from 'node:assert/strict';
import { PrismaClient } from '@dentasmart/database';
import { kopecks } from '@dentasmart/shared';
import { FinanceService } from '../src/domains/finance.service';
import type { PrismaService } from '../src/prisma/prisma.service';

const prisma = new PrismaClient();
const finance = new FinanceService(prisma as unknown as PrismaService);
const stamp = Date.now().toString(36);

async function rejects(promise: Promise<unknown>, message: RegExp, label: string) {
  await assert.rejects(promise, (error: Error) => message.test(error.message), label);
}

async function main() {
  const clinic = await prisma.organization.create({ data: { name: 'Тест денег', slug: `ledger-${stamp}` } });
  const other = await prisma.organization.create({ data: { name: 'Чужая', slug: `ledger-other-${stamp}` } });
  try {
    const patient = await prisma.patient.create({ data: { organizationId: clinic.id, firstName: 'Ирина', lastName: 'Тестова' } });
    const stranger = await prisma.patient.create({ data: { organizationId: other.id, firstName: 'Пётр', lastName: 'Чужой' } });
    const invoice = await prisma.invoice.create({
      data: { organizationId: clinic.id, patientId: patient.id, number: `T-${stamp}`, status: 'ISSUED', totalAmount: '10000.00' },
    });
    const paidOf = async () => (await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } }));

    // Two tills pay the same invoice at the same moment: both sums must land.
    await Promise.all([
      finance.createPayment(clinic.id, { patientId: patient.id, invoiceId: invoice.id, amount: '0.10', method: 'CASH' }),
      finance.createPayment(clinic.id, { patientId: patient.id, invoiceId: invoice.id, amount: '0.20', method: 'CARD' }),
    ]);
    assert.equal(kopecks((await paidOf()).paidAmount), 30, 'параллельные оплаты не теряют сумму и считаются без плавающей точки');

    // A double click sends the same key twice, also at once: one payment.
    const key = `dbl-${stamp}-click`;
    const [first, second] = await Promise.all([
      finance.createPayment(clinic.id, { patientId: patient.id, invoiceId: invoice.id, amount: '1000', method: 'CASH' }, { idempotencyKey: key }),
      finance.createPayment(clinic.id, { patientId: patient.id, invoiceId: invoice.id, amount: '1000', method: 'CASH' }, { idempotencyKey: key }),
    ]);
    assert.equal(first.id, second.id, 'повтор с тем же ключом возвращает ту же оплату');
    assert.equal(await prisma.payment.count({ where: { idempotencyKey: key } }), 1);
    assert.equal(kopecks((await paidOf()).paidAmount), 100030);
    assert.equal((await paidOf()).status, 'PARTIAL');

    // The discount lowers what is due, so the remaining 8 999,70 ₽ with a 1 000 ₽ discount closes the invoice.
    await finance.setDiscount(clinic.id, invoice.id, '1000');
    await finance.createPayment(clinic.id, { patientId: patient.id, invoiceId: invoice.id, amount: '7999.70', method: 'CARD' });
    assert.equal((await paidOf()).status, 'PAID', 'счёт со скидкой закрывается');

    // Refunds: never more than was paid, also when two are asked at once.
    const big = await prisma.payment.findFirstOrThrow({ where: { invoiceId: invoice.id, amount: '7999.70' } });
    const refunds = await Promise.allSettled([
      finance.refundPayment(clinic.id, big.id, '5000'),
      finance.refundPayment(clinic.id, big.id, '5000'),
    ]);
    assert.equal(refunds.filter((row) => row.status === 'fulfilled').length, 1, 'из двух возвратов по 5 000 ₽ проходит один');
    await rejects(finance.refundPayment(clinic.id, big.id, '3000'), /К возврату доступно 2 999,70 ₽/, 'возврат сверх остатка отклоняется');
    assert.equal((await paidOf()).status, 'PARTIAL', 'после возврата счёт снова частично оплачен');

    // Someone else's patient or invoice.
    await rejects(finance.createPayment(clinic.id, { patientId: stranger.id, amount: '100', method: 'CASH' }), /Пациент не найден/, 'чужой пациент');
    await rejects(finance.createPayment(other.id, { patientId: stranger.id, invoiceId: invoice.id, amount: '100', method: 'CASH' }), /Счёт не найден/, 'чужой счёт');
    await rejects(finance.topUpDeposit(clinic.id, stranger.id, '100'), /Пациент не найден/, 'депозит чужого пациента');
    await rejects(finance.createPayment(clinic.id, { patientId: patient.id, amount: 'abc', method: 'CASH' }), /Сумма указана неверно/, 'кривая сумма — 400, не 500');

    // Deposit: two withdrawals of 700 from 1 000 — one goes through, the balance never goes below zero.
    await finance.topUpDeposit(clinic.id, patient.id, '1000');
    const takes = await Promise.allSettled([
      finance.payFromDeposit(clinic.id, patient.id, '700'),
      finance.payFromDeposit(clinic.id, patient.id, '700'),
    ]);
    assert.equal(takes.filter((row) => row.status === 'fulfilled').length, 1, 'депозит не уходит в минус');
    assert.equal(kopecks((await prisma.patientDeposit.findUniqueOrThrow({ where: { patientId: patient.id } })).balance), 30000);

    // Installments: lines add up exactly, a line cannot be paid twice, payments reach the invoice.
    const planInvoice = await prisma.invoice.create({
      data: { organizationId: clinic.id, patientId: patient.id, number: `T2-${stamp}`, status: 'ISSUED', totalAmount: '1000.00' },
    });
    const plan = await finance.createInstallment(clinic.id, { patientId: patient.id, invoiceId: planInvoice.id, totalAmount: 1000, months: 3 });
    const lines = plan!.schedule;
    assert.deepEqual(lines.map((line) => kopecks(line.amount)), [33333, 33333, 33334], 'строки рассрочки складываются ровно в сумму');
    const twice = await Promise.allSettled([finance.payInstallmentLine(clinic.id, lines[0].id), finance.payInstallmentLine(clinic.id, lines[0].id)]);
    assert.equal(twice.filter((row) => row.status === 'fulfilled').length, 1, 'строку рассрочки нельзя оплатить дважды');
    assert.equal(kopecks((await prisma.invoice.findUniqueOrThrow({ where: { id: planInvoice.id } })).paidAmount), 33333, 'платёж рассрочки уменьшает долг по счёту');

    console.log('ledger ok');
  } finally {
    for (const org of [clinic.id, other.id]) {
      await prisma.payment.deleteMany({ where: { organizationId: org } });
      await prisma.installmentPlan.deleteMany({ where: { organizationId: org } });
      await prisma.invoice.deleteMany({ where: { organizationId: org } });
      await prisma.patientDeposit.deleteMany({ where: { organizationId: org } });
      await prisma.patient.deleteMany({ where: { organizationId: org } });
      await prisma.organization.delete({ where: { id: org } });
    }
  }
}

main().finally(() => prisma.$disconnect());
