/**
 * Opening hours per weekday against a real Postgres: the settings save a week, the calendar range gets
 * each day's hours, a closed day has no capacity, and a broken week is refused with a reason.
 */
import assert from 'node:assert/strict';
import { PrismaClient } from '@dentasmart/database';
import { ClinicConfigService } from '../src/domains/clinic-config.service';
import { WorkspaceService } from '../src/domains/workspace.service';
import type { PrismaService } from '../src/prisma/prisma.service';

const prisma = new PrismaClient();
const db = prisma as unknown as PrismaService;
const config = new ClinicConfigService(db);
const workspace = new WorkspaceService(db, config);
const stamp = Date.now().toString(36);

async function main() {
  const clinic = await prisma.organization.create({ data: { name: 'Тест часов', slug: `hours-${stamp}`, workHours: '09:00–20:00' } });
  try {
    const branch = await prisma.branch.create({ data: { organizationId: clinic.id, name: 'Главный', timezone: 'Europe/Moscow' } });
    await prisma.cabinet.create({ data: { branchId: branch.id, name: 'Кабинет 1' } });
    const user = await prisma.user.create({ data: { organizationId: clinic.id, email: `hours-${stamp}@t.local`, passwordHash: 'x' } });

    const before = await workspace.scheduleRange(clinic.id, '2026-10-19', '2026-10-25');
    assert.deepEqual(before.days[0].hours, { opensAt: 540, closesAt: 1200 }, 'без графика — старая строка на каждый день');

    const evening = { opensAt: 15 * 60, closesAt: 22 * 60 };
    const morning = { opensAt: 8 * 60, closesAt: 15 * 60 };
    await config.saveBrand(clinic.id, user.id, { weekHours: [evening, evening, evening, evening, evening, null, morning] });
    const saved = await prisma.organization.findUniqueOrThrow({ where: { id: clinic.id } });
    assert.equal(saved.workHours, 'Пн–Пт 15:00–22:00, Вс 08:00–15:00', 'строка часов — сводка графика');

    const range = await workspace.scheduleRange(clinic.id, '2026-10-19', '2026-10-25');
    assert.deepEqual(range.days[0].hours, evening, 'понедельник вечером');
    assert.equal(range.days[5].hours, null, 'суббота выходной');
    assert.equal(range.days[5].capacityMinutes, 0, 'у выходного нет ёмкости');
    assert.deepEqual(range.days[6].hours, morning, 'воскресенье утром');
    assert.deepEqual(range.hours, { opensAt: 480, closesAt: 1320 }, 'неделя показывает от самого раннего до самого позднего');

    await assert.rejects(config.saveBrand(clinic.id, user.id, { weekHours: [{ opensAt: 900, closesAt: 600 }, null, null, null, null, null, null] }), /Пн/);
    await assert.rejects(config.saveBrand(clinic.id, user.id, { weekHours: [evening] }), /семь дней/);
    // An employee's own week, shown on their doctor column; null again follows the clinic.
    const role = await prisma.role.create({ data: { organizationId: clinic.id, code: 'doctor', name: 'Врач' } });
    const doc = await prisma.user.create({ data: { organizationId: clinic.id, email: `doc-${stamp}@t.local`, passwordHash: 'x', userRoles: { create: { roleId: role.id } } } });
    const employee = await prisma.employee.create({ data: { userId: doc.id, firstName: 'Завен', lastName: 'Седракович' } });
    await config.saveEmployee(clinic.id, user.id, { id: employee.id, firstName: 'Завен', lastName: 'Седракович', weekHours: [morning, morning, null, null, null, null, evening] });
    const rows = await prisma.employeeSchedule.findMany({ where: { employeeId: employee.id }, orderBy: { dayOfWeek: 'asc' } });
    assert.deepEqual(rows.map((row) => [row.dayOfWeek, row.startsAt, row.endsAt]), [[1, '08:00', '15:00'], [2, '08:00', '15:00'], [7, '15:00', '22:00']]);
    const bundle = await config.bundle(clinic.id);
    assert.deepEqual(bundle.employees.find((row) => row.id === employee.id)?.weekHours?.[6], evening, 'график виден в карточке');
    await assert.rejects(config.saveEmployee(clinic.id, user.id, { id: employee.id, firstName: 'Завен', lastName: 'Седракович', weekHours: [evening] }), /семь дней/);
    await config.saveEmployee(clinic.id, user.id, { id: employee.id, firstName: 'Завен', lastName: 'Седракович', weekHours: null });
    assert.equal(await prisma.employeeSchedule.count({ where: { employeeId: employee.id } }), 0, 'без своего графика — по часам клиники');
    console.log('work hours ok');
  } finally {
    const org = clinic.id;
    await prisma.auditLog.deleteMany({ where: { organizationId: org } }).catch(() => undefined);
    await prisma.employeeSchedule.deleteMany({ where: { organizationId: org } });
    await prisma.employee.deleteMany({ where: { user: { organizationId: org } } });
    await prisma.userRole.deleteMany({ where: { user: { organizationId: org } } });
    await prisma.role.deleteMany({ where: { organizationId: org } }).catch(() => undefined);
    await prisma.cabinet.deleteMany({ where: { branch: { organizationId: org } } });
    await prisma.branch.deleteMany({ where: { organizationId: org } });
    await prisma.user.deleteMany({ where: { organizationId: org } });
    await prisma.organization.delete({ where: { id: org } });
  }
}

main().finally(() => prisma.$disconnect());
