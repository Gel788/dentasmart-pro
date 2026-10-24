/**
 * The "Today" screen against a real Postgres: next step per visit, what needs attention, money only
 * for those who may see it, and a doctor sees only their own patients.
 */
import assert from 'node:assert/strict';
import { PrismaClient } from '@dentasmart/database';
import { tzOffsetMinutes } from '@dentasmart/shared';
import { WorkspaceService } from '../src/domains/workspace.service';
import type { ClinicConfigService } from '../src/domains/clinic-config.service';
import type { PrismaService } from '../src/prisma/prisma.service';

const prisma = new PrismaClient();
const workspace = new WorkspaceService(prisma as unknown as PrismaService, {} as ClinicConfigService);
const stamp = Date.now().toString(36);

async function main() {
  const clinic = await prisma.organization.create({ data: { name: 'Тест дня', slug: `today-${stamp}` } });
  try {
    const branch = await prisma.branch.create({ data: { organizationId: clinic.id, name: 'Главный', timezone: 'Europe/Moscow' } });
    const user = await prisma.user.create({ data: { organizationId: clinic.id, email: `doc-${stamp}@t.local`, passwordHash: 'x' } });
    const doctor = await prisma.employee.create({ data: { userId: user.id, firstName: 'Завен', lastName: 'Седракович' } });
    const offset = tzOffsetMinutes('Europe/Moscow', new Date());
    const wall = new Date(Date.now() + offset * 60000);
    const dayStart = new Date(Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate()) - offset * 60000);
    const at = (hours: number) => new Date(dayStart.getTime() + hours * 3600000);

    const waiting = await prisma.patient.create({ data: { organizationId: clinic.id, lastName: 'Ждёт', firstName: 'Анна', allergies: ['Лидокаин'] } });
    const paid = await prisma.patient.create({ data: { organizationId: clinic.id, lastName: 'Должник', firstName: 'Олег', medicalConfirmedAt: new Date() } });
    const other = await prisma.patient.create({ data: { organizationId: clinic.id, lastName: 'Чужой', firstName: 'Врач', medicalConfirmedAt: new Date() } });
    const tomorrow = await prisma.patient.create({ data: { organizationId: clinic.id, lastName: 'Завтрашний', firstName: 'Пётр', phone: '+79990001122' } });
    const base = { organizationId: clinic.id, branchId: branch.id };
    await prisma.appointment.create({ data: { ...base, patientId: waiting.id, doctorId: doctor.id, startsAt: at(14), endsAt: at(15), status: 'WAITING' } });
    await prisma.appointment.create({ data: { ...base, patientId: paid.id, doctorId: doctor.id, startsAt: at(10), endsAt: at(11), status: 'COMPLETED' } });
    await prisma.appointment.create({ data: { ...base, patientId: other.id, startsAt: at(12), endsAt: at(13), status: 'CONFIRMED' } });
    await prisma.appointment.create({ data: { ...base, patientId: tomorrow.id, doctorId: doctor.id, startsAt: at(34), endsAt: at(35), status: 'SCHEDULED' } });
    await prisma.invoice.create({ data: { organizationId: clinic.id, patientId: paid.id, number: `T-${stamp}`, status: 'ISSUED', totalAmount: '5500', discountAmount: '500' } });

    const owner = await workspace.today(clinic.id, ['analytics.read', 'finance.read', 'patient.read']);
    assert.deepEqual(owner.visits.map((visit) => visit.patient), ['Должник Олег', 'Чужой Врач', 'Ждёт Анна'], 'по времени');
    assert.deepEqual(owner.visits.map((visit) => visit.next), ['pay', 'check-in', 'start']);
    assert.equal(owner.visits[0].debt, 5000, 'долг со скидкой');
    assert.deepEqual(owner.visits[2].alerts, ['Аллергия: Лидокаин']);
    assert.equal(owner.visits[2].reviewDue, true);
    assert.deepEqual(owner.attention.map((item) => item.kind).sort(), ['confirm', 'pay', 'review']);
    assert.equal(owner.money?.dueToday, 5000);
    assert.equal(owner.counts.done, 1);

    const desk = await workspace.today(clinic.id, ['patient.read', 'schedule.read']);
    assert.equal(desk.money, null, 'без права на финансы денег не видно');
    assert.equal(desk.visits[0].debt, null);
    assert.ok(!desk.attention.some((item) => item.kind === 'pay'));

    const mine = await workspace.today(clinic.id, ['patient.read', 'medical.write'], doctor.id);
    assert.deepEqual(mine.visits.map((visit) => visit.patient), ['Должник Олег', 'Ждёт Анна'], 'врач видит своих');
    // Recall: long gone and not booked — call; long gone but booked — don't; one line per plan family.
    const gone = await prisma.patient.create({ data: { organizationId: clinic.id, lastName: 'Пропавший', firstName: 'Иван' } });
    const back = await prisma.patient.create({ data: { organizationId: clinic.id, lastName: 'Вернувшийся', firstName: 'Олег' } });
    const old = new Date(Date.now() - 200 * 86400000);
    for (const id of [gone.id, back.id]) {
      await prisma.appointment.create({ data: { ...base, patientId: id, startsAt: old, endsAt: new Date(old.getTime() + 3600000), status: 'COMPLETED' } });
    }
    await prisma.appointment.create({ data: { ...base, patientId: back.id, startsAt: at(60), endsAt: at(61), status: 'SCHEDULED' } });
    for (const tier of ['ECONOM', 'OPTIMUM', 'PREMIUM'] as const) {
      await prisma.treatmentPlan.create({ data: { organizationId: clinic.id, patientId: gone.id, title: `План · ${tier}`, status: 'PROPOSED', tier, familyKey: `fam-${stamp}`, totalPrice: tier === 'OPTIMUM' ? '36200' : '1000' } });
    }
    const recall = await workspace.recall(clinic.id);
    assert.deepEqual(recall.checkups.map((row) => row.patient), ['Пропавший Иван'], 'записанного не обзваниваем');
    assert.equal(recall.checkups[0].days >= 199, true);
    assert.equal(recall.plans.length, 0, 'пациент из обзвона не повторяется строкой плана');
    assert.equal(recall.checkups[0].plan?.total, 36200, 'план семьи — одной строкой, рекомендуемый вариант, на строке обзвона');
    assert.equal(recall.checkups[0].plan?.title, 'Оптимум');
    console.log('today ok');
  } finally {
    const org = clinic.id;
    await prisma.invoice.deleteMany({ where: { organizationId: org } });
    await prisma.treatmentPlan.deleteMany({ where: { organizationId: org } });
    await prisma.appointment.deleteMany({ where: { organizationId: org } });
    await prisma.patient.deleteMany({ where: { organizationId: org } });
    await prisma.employee.deleteMany({ where: { user: { organizationId: org } } });
    await prisma.user.deleteMany({ where: { organizationId: org } });
    await prisma.branch.deleteMany({ where: { organizationId: org } });
    await prisma.organization.delete({ where: { id: org } });
  }
}

main().finally(() => prisma.$disconnect());
