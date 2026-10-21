/**
 * The staff assistant against a real Postgres with the model stubbed: the model's JSON picks a lookup,
 * the lookup runs under the caller's permissions, and the clinic's records never go to the model.
 */
import assert from 'node:assert/strict';
import { PrismaClient } from '@dentasmart/database';
import { CrmAssistantService, datesIn, parseRoute } from '../src/domains/crm-assistant';
import { WidgetService } from '../src/domains/widget.service';
import { WorkspaceService } from '../src/domains/workspace.service';
import type { PrismaService } from '../src/prisma/prisma.service';

const prisma = new PrismaClient();
const db = prisma as unknown as PrismaService;
const stamp = Date.now().toString(36);
const ALL = ['patient.read', 'schedule.read', 'finance.read'];

async function main() {
  assert.equal(parseRoute('Конечно! {"reply":"Ищу","action":{"type":"patient","query":"Орлова"}}').action.type, 'patient');
  assert.equal(parseRoute('{"reply":"x","action":{"type":"delete_all"}}').action.type, 'none', 'неизвестное действие — просто ответ');
  assert.equal(parseRoute('Часы работы настраиваются в Настройках.').reply, 'Часы работы настраиваются в Настройках.');

  // 2026-10-21 is a Wednesday.
  assert.deepEqual(datesIn('окно в пятницу вечером', '2026-10-21'), { date: '2026-10-23' });
  assert.deepEqual(datesIn('в среду', '2026-10-21'), { date: '2026-10-21' });
  assert.deepEqual(datesIn('в следующий вторник', '2026-10-21'), { date: '2026-10-27' });
  assert.deepEqual(datesIn('в следующую пятницу', '2026-10-21'), { date: '2026-10-30' });
  assert.deepEqual(datesIn('кто записан завтра', '2026-10-21'), { date: '2026-10-22' });
  assert.deepEqual(datesIn('на следующей неделе утром', '2026-10-21'), { date: '2026-10-26', dateTo: '2026-11-01' });
  assert.deepEqual(datesIn('на 5 ноября', '2026-10-21'), { date: '2026-11-05' });
  assert.deepEqual(datesIn('на 3.01', '2026-10-21'), { date: '2027-01-03' });
  assert.equal(datesIn('найди Орлову', '2026-10-21'), null);

  const day = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  const week = Array.from({ length: 7 }, () => ({ opensAt: 15 * 60, closesAt: 17 * 60 }));
  const clinic = await prisma.organization.create({ data: { name: 'Тест помощника', slug: `asst-${stamp}`, weekHours: week } });
  try {
    const branch = await prisma.branch.create({ data: { organizationId: clinic.id, name: 'Главный', timezone: 'Europe/Moscow' } });
    await prisma.cabinet.create({ data: { branchId: branch.id, name: 'Кабинет 1' } });
    await prisma.cabinet.create({ data: { branchId: branch.id, name: 'Кабинет 2' } });
    const patient = await prisma.patient.create({ data: { organizationId: clinic.id, lastName: 'Орлова', firstName: 'Вера', phone: '+79001112233' } });
    const user = await prisma.user.create({ data: { organizationId: clinic.id, email: `adm-${stamp}@t.local`, passwordHash: 'x' } });
    const at = new Date(Date.parse(`${day}T15:30:00Z`) - 3 * 3600000);
    await prisma.appointment.create({ data: { organizationId: clinic.id, branchId: branch.id, patientId: patient.id, startsAt: at, endsAt: new Date(+at + 1800_000), status: 'CONFIRMED' } });

    const assistant = new CrmAssistantService(db, new WidgetService(db), { book: (orgId: string, body: Parameters<WorkspaceService['book']>[1]) => prisma.appointment.create({ data: { organizationId: orgId, branchId: branch.id, patientId: body.patientId, cabinetId: body.cabinetId, startsAt: new Date(body.startsAt), endsAt: new Date(Date.parse(body.startsAt) + (body.durationMin ?? 30) * 60000) } }) } as unknown as WorkspaceService);
    process.env.POLZA_API_KEY = process.env.POLZA_API_KEY || 'test-key';
    let next: unknown = {};
    const sent: string[] = [];
    assistant.http = (async (_url: string | URL | Request, init?: RequestInit) => {
      sent.push(String(init?.body ?? ''));
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(next) } }] }), { status: 200 });
    }) as typeof fetch;
    const ask = (action: unknown, permissions = ALL, text = 'вопрос') => {
      next = { reply: 'Вот:', action };
      return assistant.ask(clinic.id, user.id, permissions, [{ role: 'user', content: text }]);
    };

    const slots = await ask({ type: 'slots', date: day, from: '16:00' });
    const card = slots.cards[0];
    assert.ok(card?.kind === 'slots');
    assert.deepEqual(card.items.map((slot) => new Date(Date.parse(slot.startsAt) + 3 * 3600000).toISOString().slice(11, 16)), ['16:00', '16:30'], 'только после 16:00 и в часы работы');
    assert.ok(!sent.at(-1)!.includes('Орлова'), 'записи клиники не уходят в модель');

    const forPatient = await ask({ type: 'slots', patient: 'Орлову', date: day });
    assert.ok(forPatient.cards[0]?.kind === 'slots' && forPatient.cards[0].patient?.id === patient.id, 'пациент подставится в запись');
    assert.match(forPatient.reply, /Вот:/);
    next = { reply: '', action: { type: 'day', date: day } };
    assert.equal((await assistant.ask(clinic.id, user.id, ALL, [{ role: 'user', content: 'кто' }])).reply, 'Записи на день:', 'пустой ответ модели описан по карточке');

    const found = await ask({ type: 'patient', query: 'орлова вера' });
    assert.ok(found.cards[0]?.kind === 'patients' && found.cards[0].items[0]?.id === patient.id);
    assert.ok(found.cards[0]?.kind === 'patients' && (await ask({ type: 'patient', query: '1112233' })).cards[0]?.kind === 'patients');
    assert.equal((await ask({ type: 'patient', query: 'Орлова' }, ['schedule.read'])).cards.length, 0, 'без права на пациентов — без карточек');

    const list = await ask({ type: 'day', date: day });
    assert.ok(list.cards[0]?.kind === 'day' && list.cards[0].items.length === 1 && list.cards[0].items[0].patient === 'Орлова Вера');

    assert.deepEqual((await ask({ type: 'open', page: '/money' })).cards, [{ kind: 'link', href: '/money', label: 'Деньги: оплаты, долги, касса' }]);
    assert.equal((await ask({ type: 'open', page: '/settings' })).cards.length, 0, 'настройки только тем, кому можно');

    const move = await ask({ type: 'visit', intent: 'move', patient: 'Орлову' }, ALL, 'перенеси Орлову на послезавтра');
    assert.ok(move.cards[0]?.kind === 'visits' && move.cards[0].items[0]?.patientId === patient.id && move.cards[0].slots.length > 0, 'визит найден, новое время предложено');
    const cancel = await ask({ type: 'visit', intent: 'удалить всё', patient: 'Орлова' });
    assert.ok(cancel.cards[0]?.kind === 'visits' && cancel.cards[0].intent === 'confirm', 'незнакомое намерение не становится отменой');
    assert.equal((await ask({ type: 'visit', intent: 'cancel', patient: 'Орлова' }, ['schedule.read'])).cards[0]?.kind === 'visits' ? 'ok' : 'no', 'ok');
    const fresh = await ask({ type: 'new_patient', lastName: 'петрова', firstName: 'анна', phone: '+7 (900) 123-45-67' });
    assert.deepEqual(fresh.cards, [], 'без права на пациентов карточки нет');
    const fresh2 = await assistant.ask(clinic.id, user.id, [...ALL, 'patient.write'], [{ role: 'user', content: 'новый пациент' }]);
    assert.ok(fresh2.cards[0]?.kind === 'newPatient' && fresh2.cards[0].lastName === 'Петрова' && fresh2.cards[0].phone === '+79001234567');

    // Booking from the conversation picks a free chair; when both are taken it says so.
    const slotAt = new Date(Date.parse(`${day}T16:00:00Z`) - 3 * 3600000).toISOString();
    const first = await assistant.book(clinic.id, user.id, { patientId: patient.id, startsAt: slotAt });
    const second = await assistant.book(clinic.id, user.id, { patientId: patient.id, startsAt: slotAt });
    const chairs = await prisma.appointment.findMany({ where: { id: { in: [first.id, second.id] } }, select: { cabinetId: true } });
    assert.equal(new Set(chairs.map((row) => row.cabinetId)).size, 2, 'два разных кресла');
    await assert.rejects(assistant.book(clinic.id, user.id, { patientId: patient.id, startsAt: slotAt }), /кресла/);
    await assert.rejects(assistant.book(clinic.id, user.id, { startsAt: slotAt }), /пациента/);

    await assert.rejects(assistant.ask(clinic.id, user.id, ALL, []), /Напишите/);
    const logs = await prisma.auditLog.findMany({ where: { organizationId: clinic.id, entityType: 'CrmAssistant' } });
    assert.ok(logs.length >= 5 && logs.every((row) => !JSON.stringify(row.changes).includes('вопрос')), 'журнал без текста');
    console.log('crm assistant ok');
  } finally {
    const org = clinic.id;
    await prisma.auditLog.deleteMany({ where: { organizationId: org } });
    await prisma.appointment.deleteMany({ where: { organizationId: org } });
    await prisma.patient.deleteMany({ where: { organizationId: org } });
    await prisma.cabinet.deleteMany({ where: { branch: { organizationId: org } } });
    await prisma.branch.deleteMany({ where: { organizationId: org } });
    await prisma.user.deleteMany({ where: { organizationId: org } });
    await prisma.organization.delete({ where: { id: org } });
  }
}

main().finally(() => prisma.$disconnect());
