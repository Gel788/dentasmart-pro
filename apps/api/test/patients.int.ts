/**
 * The patient registry against a real Postgres: full-name and phone search, segment counters that follow
 * the search, segment filter and sorting. Builds its own clinic and removes it.
 */
import assert from 'node:assert/strict';
import { PrismaClient } from '@dentasmart/database';
import { PatientsService } from '../src/patients/patients.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { AuditService } from '../src/common/audit.service';

const prisma = new PrismaClient();
const patients = new PatientsService(prisma as unknown as PrismaService, {} as AuditService);
const stamp = Date.now().toString(36);
const day = 86400000;

async function main() {
  const clinic = await prisma.organization.create({ data: { name: 'Тест реестра', slug: `registry-${stamp}` } });
  const other = await prisma.organization.create({ data: { name: 'Чужая', slug: `registry-other-${stamp}` } });
  try {
    const branch = await prisma.branch.create({ data: { organizationId: clinic.id, name: 'Главный' } });
    const make = (lastName: string, firstName: string, extra: Record<string, unknown> = {}) =>
      prisma.patient.create({ data: { organizationId: clinic.id, lastName, firstName, ...extra } });
    const fyodorova = await make('Фёдорова', 'Алёна', { middleName: 'Игоревна', phone: '+7 916 123-45-67' });
    const ivanov = await make('Иванов', 'Пётр', { phone: '+79990000001' });
    const smirnov = await make('Смирнов', 'Олег');
    await make('Отказова', 'Мария', { phone: '+79990000002', clientType: 'Отказавшиеся' });
    await prisma.patient.create({ data: { organizationId: other.id, lastName: 'Фёдорова', firstName: 'Чужая' } });

    const visit = (patientId: string, at: number, status: 'COMPLETED' | 'SCHEDULED' | 'CANCELLED') =>
      prisma.appointment.create({
        data: { organizationId: clinic.id, branchId: branch.id, patientId, status, startsAt: new Date(at), endsAt: new Date(at + 1800000) },
      });
    await visit(fyodorova.id, Date.now() - 20 * day, 'COMPLETED');
    await visit(fyodorova.id, Date.now() + 3 * day, 'SCHEDULED');
    await visit(ivanov.id, Date.now() - 400 * day, 'COMPLETED');
    await visit(ivanov.id, Date.now() + 5 * day, 'CANCELLED');
    await prisma.invoice.create({
      data: { organizationId: clinic.id, patientId: smirnov.id, number: `R-${stamp}`, status: 'PARTIAL', totalAmount: '5000', discountAmount: '500', paidAmount: '1000' },
    });

    const all = await patients.findAll(clinic.id, {});
    assert.equal(all.total, 4, 'чужая клиника не видна');
    assert.deepEqual(all.segments, { all: 4, phone: 2, debt: 1, upcoming: 1, dormant: 2, declined: 1 });
    assert.deepEqual(all.items.map((p) => p.lastName), ['Иванов', 'Отказова', 'Смирнов', 'Фёдорова'], 'по алфавиту');

    const full = await patients.findAll(clinic.id, { search: 'федорова алена' });
    assert.deepEqual(full.items.map((p) => p.id), [fyodorova.id], 'полное имя, без учёта ё и регистра');
    assert.equal(full.segments.upcoming, 1, 'счётчики считают только найденных');
    assert.equal(full.segments.all, 1);
    assert.equal(full.items[0].nextVisit !== null && full.items[0].lastVisit !== null, true);

    const phone = await patients.findAll(clinic.id, { search: '8 916 123 45 67' });
    assert.deepEqual(phone.items.map((p) => p.id), [fyodorova.id], 'телефон с восьмёркой и пробелами');
    const partial = await patients.findAll(clinic.id, { search: '8 916 12' });
    assert.deepEqual(partial.items.map((p) => p.id), [fyodorova.id], 'начало номера с восьмёркой');

    const debt = await patients.findAll(clinic.id, { segment: 'debt' });
    assert.deepEqual(debt.items.map((p) => [p.id, p.debt]), [[smirnov.id, '3500.00']], 'долг = сумма − скидка − оплачено');
    assert.equal(debt.total, 1);

    const dormant = await patients.findAll(clinic.id, { segment: 'dormant', sort: 'lastVisit' });
    assert.deepEqual(dormant.items.map((p) => p.id), [ivanov.id, smirnov.id], 'отменённый визит не считается записью; без визитов — в конце');
    assert.deepEqual(dormant.items[0].segments, ['phone', 'dormant']);

    const declined = await patients.findAll(clinic.id, { segment: 'declined' });
    assert.deepEqual(declined.items[0].segments, ['declined'], 'отказавшиеся не попадают в другие сегменты');

    const paged = await patients.findAll(clinic.id, { pageSize: 3, page: 2 });
    assert.equal(paged.items.length, 1);
    assert.equal((await patients.findAll(clinic.id, { segment: 'nonsense', sort: 'drop table' })).total, 4, 'неизвестные параметры игнорируются');
    console.log('patients ok');
  } finally {
    for (const org of [clinic.id, other.id]) {
      await prisma.invoice.deleteMany({ where: { organizationId: org } });
      await prisma.appointment.deleteMany({ where: { organizationId: org } });
      await prisma.patient.deleteMany({ where: { organizationId: org } });
      await prisma.branch.deleteMany({ where: { organizationId: org } });
      await prisma.organization.delete({ where: { id: org } });
    }
  }
}

main().finally(() => prisma.$disconnect());
