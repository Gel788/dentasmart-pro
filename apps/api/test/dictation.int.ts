/**
 * Dictation against a real Postgres with Polza stubbed: the model's JSON is read even inside prose,
 * services map to the price list by number, impossible teeth are dropped, an async transcription is
 * polled, and the audit log records who dictated but never what.
 */
import assert from 'node:assert/strict';
import { PrismaClient } from '@dentasmart/database';
import { DictationService, parseDraft } from '../src/domains/dictation.service';
import type { PrismaService } from '../src/prisma/prisma.service';

const prisma = new PrismaClient();
const stamp = Date.now().toString(36);

async function main() {
  const parsed = parseDraft('Вот протокол:\n```json\n{"complaints":"Боль на холодное","diagnosis":"Средний кариес 36","extra":"x","services":[{"index":1,"tooth":36},{"index":"нет"}]}\n```');
  assert.equal(parsed.fields.complaints, 'Боль на холодное');
  assert.equal(parsed.fields.objective, '');
  assert.deepEqual(parsed.services, [{ index: 1, tooth: 36 }]);
  assert.deepEqual(parseDraft('не JSON').services, []);

  const clinic = await prisma.organization.create({ data: { name: 'Тест диктовки', slug: `dict-${stamp}` } });
  try {
    const branch = await prisma.branch.create({ data: { organizationId: clinic.id, name: 'Главный' } });
    const patient = await prisma.patient.create({ data: { organizationId: clinic.id, lastName: 'Орлова', firstName: 'Вера' } });
    const filling = await prisma.service.create({ data: { organizationId: clinic.id, name: 'Лечение кариеса', code: `K-${stamp}`, basePrice: '5500', sortOrder: 1 } });
    await prisma.service.create({ data: { organizationId: clinic.id, name: 'Анестезия', code: `A-${stamp}`, basePrice: '900', sortOrder: 2 } });
    const user = await prisma.user.create({ data: { organizationId: clinic.id, email: `doc-${stamp}@t.local`, passwordHash: 'x' } });
    const at = new Date(Date.now() + 3600_000);
    const visit = await prisma.appointment.create({ data: { organizationId: clinic.id, branchId: branch.id, patientId: patient.id, startsAt: at, endsAt: new Date(+at + 3600_000), status: 'IN_PROGRESS' } });

    const service = new DictationService(prisma as unknown as PrismaService);
    process.env.POLZA_API_KEY = process.env.POLZA_API_KEY || 'test-key';
    const calls: string[] = [];
    let sentToModel = '';
    service.http = (async (url: string | URL | Request, init?: RequestInit) => {
      const target = String(url);
      calls.push(`${init?.method ?? 'GET'} ${target.replace('https://polza.ai/api/v1', '')}`);
      const reply = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
      if (target.endsWith('/audio/transcriptions')) return reply({ id: 'gen_1', status: 'processing' });
      if (target.endsWith('/audio/transcriptions/gen_1')) return reply({ status: 'completed', segments: [{ text: 'Жалобы на боль в тридцать шестом на холодное.' }, { text: 'Поставили пломбу.' }] });
      sentToModel = String(init?.body ?? '');
      return reply({ choices: [{ message: { content: JSON.stringify({ complaints: 'Боль в 36 на холодное', anamnesis: '', objective: 'Глубокая кариозная полость 36', diagnosis: 'Средний кариес 36', treatment: 'Пломба', recommendations: 'Не есть 2 часа', services: [{ index: 1, tooth: 36 }, { index: 2, tooth: 99 }, { index: 7, tooth: 11 }] }) } }] });
    }) as typeof fetch;

    const draft = await service.draft(clinic.id, visit.id, user.id, { audio: { buffer: Buffer.from('fake-audio'), mimetype: 'audio/webm;codecs=opus' } });
    assert.equal(draft.transcript, 'Жалобы на боль в тридцать шестом на холодное. Поставили пломбу.', 'асинхронная расшифровка дождалась результата');
    assert.ok(calls.includes('GET /audio/transcriptions/gen_1'));
    assert.equal(draft.fields.diagnosis, 'Средний кариес 36');
    assert.deepEqual(draft.services.map((row) => [row.serviceId, row.toothNum]), [[filling.id, 36], [draft.services[1].serviceId, null]], 'зуб 99 не существует, услуги вне прайса нет');
    assert.ok(sentToModel.includes('sber/gigachat-2') && sentToModel.includes('1. Лечение кариеса'), 'прайс и российская модель');
    assert.equal(await prisma.visitNote.count({ where: { appointmentId: visit.id } }), 0, 'черновик ничего не сохранил в протокол');
    const log = await prisma.auditLog.findFirstOrThrow({ where: { organizationId: clinic.id, entityType: 'Dictation' } });
    assert.ok(!JSON.stringify(log.changes).includes('холодное'), 'в журнале нет медицинского текста');

    const typed = await service.draft(clinic.id, visit.id, user.id, { text: 'жалобы на боль, пломба' });
    assert.equal(typed.models.stt, null, 'текст не идёт в распознавание');
    await assert.rejects(service.draft(clinic.id, 'чужой', user.id, { text: 'x' }), /не найден/);
    await assert.rejects(service.draft(clinic.id, visit.id, user.id, { text: '   ' }), /Надиктуйте/);
    console.log('dictation ok');
  } finally {
    const org = clinic.id;
    await prisma.auditLog.deleteMany({ where: { organizationId: org } });
    await prisma.appointment.deleteMany({ where: { organizationId: org } });
    await prisma.service.deleteMany({ where: { organizationId: org } });
    await prisma.patient.deleteMany({ where: { organizationId: org } });
    await prisma.branch.deleteMany({ where: { organizationId: org } });
    await prisma.user.deleteMany({ where: { organizationId: org } });
    await prisma.organization.delete({ where: { id: org } });
  }
}

main().finally(() => prisma.$disconnect());
