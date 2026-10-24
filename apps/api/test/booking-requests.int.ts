/**
 * Site booking against a real Postgres: slots follow working hours, a request holds its slot, the
 * clinic accepts (a visit appears) or declines (the slot frees); the assistant's loop runs its tools
 * and never sees phones. The model is a stub here: no money spent, no data sent anywhere.
 */
import assert from 'node:assert/strict';
import { PrismaClient } from '@dentasmart/database';
import { BookingAssistantService, redact } from '../src/domains/booking-assistant.service';
import { BookingRequestsService } from '../src/domains/booking-requests';
import { WidgetService } from '../src/domains/widget.service';
import type { PrismaService } from '../src/prisma/prisma.service';

const prisma = new PrismaClient();
const db = prisma as unknown as PrismaService;
const widget = new WidgetService(db);
const requests = new BookingRequestsService(db, widget);
const stamp = Date.now().toString(36);

async function main() {
  const day = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  const weekday = (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7;
  const week = Array.from({ length: 7 }, (_, index) => (index === weekday ? { opensAt: 15 * 60, closesAt: 17 * 60 } : null));
  const clinic = await prisma.organization.create({ data: { name: 'Тест заявок', slug: `req-${stamp}`, weekHours: week } });
  try {
    const branch = await prisma.branch.create({ data: { organizationId: clinic.id, name: 'Главный', timezone: 'Europe/Moscow' } });
    await prisma.cabinet.create({ data: { branchId: branch.id, name: 'Кабинет 1' } });
    const service = await prisma.service.create({ data: { organizationId: clinic.id, name: 'Консультация', code: `C-${stamp}`, basePrice: '1500', durationMin: 30 } });
    const user = await prisma.user.create({ data: { organizationId: clinic.id, email: `adm-${stamp}@t.local`, passwordHash: 'x' } });

    const from = new Date(Date.parse(`${day}T00:00:00Z`) - 3 * 3600000);
    const to = new Date(from.getTime() + 86400000);
    const slots = await widget.freeSlots(clinic.id, branch.id, 30, from, to);
    assert.deepEqual(slots.map((slot) => new Date(Date.parse(slot.startsAt) + 3 * 3600000).toISOString().slice(11, 16)), ['15:00', '15:30', '16:00', '16:30'], 'только рабочие часы этого дня');

    const first = slots[0];
    await assert.rejects(widget.book(clinic.slug, { branchId: branch.id, serviceId: service.id, ...first, firstName: 'Анна', lastName: 'Орлова', phone: '+7 900 111-22-33', consent: false }), /согласие/);
    const request = await widget.book(clinic.slug, { branchId: branch.id, serviceId: service.id, ...first, firstName: 'Анна', lastName: 'Орлова', phone: '+7 900 111-22-33', consent: true });
    assert.equal(request.status, 'PENDING');
    assert.equal(await prisma.appointment.count({ where: { organizationId: clinic.id } }), 0, 'заявка — ещё не визит');
    const held = await widget.freeSlots(clinic.id, branch.id, 30, from, to);
    assert.ok(!held.some((slot) => slot.startsAt === first.startsAt), 'слот заявки занят, пока она ждёт');
    await assert.rejects(widget.book(clinic.slug, { branchId: branch.id, ...first, firstName: 'Пётр', lastName: 'Ким', phone: '+7 900 222-33-44', consent: true }), /занято/);

    const accepted = await requests.accept(clinic.id, user.id, request.id);
    const visit = await prisma.appointment.findUniqueOrThrow({ where: { id: accepted.appointmentId } });
    assert.equal(visit.startsAt.toISOString(), first.startsAt, 'визит на время заявки');
    await assert.rejects(requests.accept(clinic.id, user.id, request.id), /уже обработали/);

    const second = await widget.book(clinic.slug, { branchId: branch.id, ...slots[1], firstName: 'Пётр', lastName: 'Ким', phone: '+7 900 222-33-44', consent: true });
    await requests.decline(clinic.id, user.id, second.id, 'Врач в отпуске');
    assert.ok((await widget.freeSlots(clinic.id, branch.id, 30, from, to)).some((slot) => slot.startsAt === slots[1].startsAt), 'после отказа слот свободен');
    const list = await requests.list(clinic.id);
    assert.deepEqual(list.map((row) => row.status).sort(), ['ACCEPTED', 'DECLINED']);

    // The assistant: phones are masked, tools run, slots come back for the buttons.
    assert.equal(redact('мой номер +7 (900) 123-45-67, почта a@b.ru'), 'мой номер [номер скрыт], почта [почта скрыта]');
    const assistant = new BookingAssistantService(db, widget);
    const seen: string[] = [];
    let call = 0;
    process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'test-key';
    (assistant as unknown as { client: unknown }).client = {
      messages: {
        create: async (params: { messages: { role: string; content: unknown }[] }) => {
          seen.push(JSON.stringify(params.messages));
          call += 1;
          if (call === 1) return { stop_reason: 'tool_use', content: [
            { type: 'tool_use', id: 't1', name: 'note_for_clinic', input: { summary: 'Болит зуб справа', serviceId: service.id, urgent: true } },
            { type: 'tool_use', id: 't2', name: 'find_slots', input: { serviceId: service.id, dateFrom: day, dateTo: day, partOfDay: 'any' } },
          ] };
          return { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Есть время в 16:00. Выберите удобное ниже.' }] };
        },
      },
    };
    await assert.rejects(assistant.chat(clinic.slug, { message: 'болит зуб' }), /согласие/);
    const answer = await assistant.chat(clinic.slug, { message: 'Болит зуб, мой телефон 89001112233', consent: true });
    assert.ok(!seen.join('').includes('89001112233'), 'телефон не уходит в модель');
    assert.equal(answer.urgent, true);
    assert.equal(answer.service?.id, service.id);
    assert.ok(answer.slots.length > 0 && !answer.slots.some((slot) => slot.startsAt === first.startsAt), 'варианты без занятого слота');
    const chat = await prisma.widgetChat.findUniqueOrThrow({ where: { id: answer.chatId } });
    assert.equal(chat.summary, 'Болит зуб справа');
    console.log('booking requests ok');
  } finally {
    const org = clinic.id;
    await prisma.bookingRequest.deleteMany({ where: { organizationId: org } });
    await prisma.widgetChat.deleteMany({ where: { organizationId: org } });
    await prisma.appointment.deleteMany({ where: { organizationId: org } });
    await prisma.patient.deleteMany({ where: { organizationId: org } });
    await prisma.service.deleteMany({ where: { organizationId: org } });
    await prisma.cabinet.deleteMany({ where: { branch: { organizationId: org } } });
    await prisma.branch.deleteMany({ where: { organizationId: org } });
    await prisma.user.deleteMany({ where: { organizationId: org } });
    await prisma.organization.delete({ where: { id: org } });
  }
}

main().finally(() => prisma.$disconnect());
