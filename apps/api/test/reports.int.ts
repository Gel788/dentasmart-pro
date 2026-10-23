/** Reports on a real Postgres: visits by status, no-show rate, new patients, money in minus refunds, bonuses left out. */
import assert from 'node:assert/strict';
import { PrismaClient } from '@dentasmart/database';
import { ReportsService } from '../src/domains/reports';
import type { PrismaService } from '../src/prisma/prisma.service';

const prisma = new PrismaClient();
const reports = new ReportsService(prisma as unknown as PrismaService);
const stamp = Date.now().toString(36);

async function main() {
  const clinic = await prisma.organization.create({ data: { name: 'Тест отчётов', slug: `rep-${stamp}` } });
  try {
    const branch = await prisma.branch.create({ data: { organizationId: clinic.id, name: 'Главный', timezone: 'Europe/Moscow' } });
    const [anna, boris] = await Promise.all(['Анна', 'Борис'].map((firstName) => prisma.patient.create({ data: { organizationId: clinic.id, lastName: 'Тест', firstName } })));
    const day = '2026-03-10';
    const at = (hour: number) => new Date(Date.parse(`${day}T${String(hour).padStart(2, '0')}:00:00Z`) - 3 * 3600_000);
    const visit = (patientId: string, hour: number, status: 'COMPLETED' | 'NO_SHOW' | 'CANCELLED' | 'SCHEDULED') => prisma.appointment.create({ data: { organizationId: clinic.id, branchId: branch.id, patientId, startsAt: at(hour), endsAt: new Date(+at(hour) + 3600_000), status } });
    await prisma.appointment.create({ data: { organizationId: clinic.id, branchId: branch.id, patientId: boris.id, startsAt: new Date('2026-02-01T09:00:00Z'), endsAt: new Date('2026-02-01T10:00:00Z'), status: 'COMPLETED' } });
    const done = await visit(anna.id, 10, 'COMPLETED');
    await visit(boris.id, 12, 'NO_SHOW');
    await visit(anna.id, 14, 'CANCELLED');
    await visit(boris.id, 15, 'SCHEDULED');
    const invoice = await prisma.invoice.create({ data: { organizationId: clinic.id, patientId: anna.id, appointmentId: done.id, number: `R-${stamp}`, status: 'PARTIAL', totalAmount: '5000', discountAmount: '500', paidAmount: '3000', createdAt: at(11) } });
    const paid = await prisma.payment.create({ data: { organizationId: clinic.id, patientId: anna.id, invoiceId: invoice.id, amount: '3000', method: 'CARD', paidAt: at(11) } });
    await prisma.payment.create({ data: { organizationId: clinic.id, patientId: anna.id, amount: '-1000', method: 'CARD', refundOfId: paid.id, paidAt: at(13) } });
    await prisma.payment.create({ data: { organizationId: clinic.id, patientId: anna.id, amount: '700', method: 'BONUS', paidAt: at(13) } });

    const full = await reports.report(clinic.id, ['finance.read'], { from: day, to: day });
    assert.deepEqual(full.visits, { total: 4, held: 3, completed: 1, cancelled: 1, noShows: 1, noShowRate: 33.3 });
    assert.deepEqual(full.patients, { seen: 2, new: 1, returning: 1 }, 'Борис был в феврале');
    assert.equal(full.finance?.moneyIn, 3000);
    assert.equal(full.finance?.refunds, 1000);
    assert.equal(full.finance?.net, 2000, 'бонусы — не деньги');
    assert.equal(full.finance?.billed, 4500, 'счёт после скидки');
    assert.equal(full.finance?.debtNow, 1500);
    assert.equal(full.series.length, 1);
    assert.equal(full.byDoctor.find((row) => row.id === null)?.billed, 4500, 'счета визитов без врача тоже считаются');
    const blind = await reports.report(clinic.id, ['schedule.read'], { from: day, to: day });
    assert.equal(blind.finance, null, 'без права на финансы денег не видно');
    assert.equal(blind.byDoctor[0]?.billed ?? null, null);
    await assert.rejects(reports.report(clinic.id, [], { from: '2026-03-10', to: '2026-03-01' }), /раньше/);
    console.log('reports ok');
  } finally {
    const org = clinic.id;
    await prisma.payment.deleteMany({ where: { organizationId: org, refundOfId: { not: null } } });
    await prisma.payment.deleteMany({ where: { organizationId: org } });
    await prisma.invoice.deleteMany({ where: { organizationId: org } });
    await prisma.appointment.deleteMany({ where: { organizationId: org } });
    await prisma.patient.deleteMany({ where: { organizationId: org } });
    await prisma.branch.deleteMany({ where: { organizationId: org } });
    await prisma.organization.delete({ where: { id: org } });
  }
}

main().finally(() => prisma.$disconnect());
