/**
 * Patient documents against a real Postgres: the first visit brings the contract and consents, each
 * kind of intervention its own consent, nothing is issued twice, a voided paper is reissued, numbers
 * run in order, the act follows the visit and the tax certificate sums the year's payments.
 */
import assert from 'node:assert/strict';
import { PrismaClient } from '@dentasmart/database';
import { DocumentsService } from '../src/domains/documents';
import type { PrismaService } from '../src/prisma/prisma.service';

const prisma = new PrismaClient();
const docs = new DocumentsService(prisma as unknown as PrismaService);
const stamp = Date.now().toString(36);

async function main() {
  const clinic = await prisma.organization.create({ data: { name: 'Тест документов', slug: `docs-${stamp}`, legalName: 'ООО «Тест»', inn: '7700000000' } });
  try {
    const user = await prisma.user.create({ data: { organizationId: clinic.id, email: `adm-${stamp}@t.local`, passwordHash: 'x' } });
    const branch = await prisma.branch.create({ data: { organizationId: clinic.id, name: 'Главный' } });
    const patient = await prisma.patient.create({ data: { organizationId: clinic.id, lastName: 'Орлова', firstName: 'Вера', birthDate: new Date('1990-05-01') } });
    const extraction = await prisma.service.create({ data: { organizationId: clinic.id, name: 'Удаление зуба простое', code: `S-${stamp}`, basePrice: '3000' } });
    const filling = await prisma.service.create({ data: { organizationId: clinic.id, name: 'Пломба светоотверждаемая', code: `T-${stamp}`, basePrice: '5500' } });
    const xray = await prisma.service.create({ data: { organizationId: clinic.id, name: 'Прицельный снимок', code: `X-${stamp}`, basePrice: '700' } });
    const visitAt = (hours: number, serviceId: string) => prisma.appointment.create({ data: { organizationId: clinic.id, branchId: branch.id, patientId: patient.id, serviceId, startsAt: new Date(Date.now() + hours * 3600_000), endsAt: new Date(Date.now() + (hours + 1) * 3600_000) } });

    const first = await visitAt(2, extraction.id);
    // Two screens open the visit at the same moment.
    const [pack] = await Promise.all([docs.forVisit(clinic.id, first.id, user.id), docs.forVisit(clinic.id, first.id, user.id)]);
    assert.equal(await prisma.clinicDocument.count({ where: { organizationId: clinic.id } }), 5, 'одновременные запросы не дублируют документы');
    assert.deepEqual(pack.documents.map((doc) => doc.kind).sort(), ['CONTRACT', 'HEALTH_FORM', 'IDS_GENERAL', 'IDS_INTERVENTION', 'PD_CONSENT']);
    assert.equal(pack.documents.find((doc) => doc.kind === 'IDS_INTERVENTION')?.topic, 'surgery');
    assert.equal(pack.unsigned.length, 4, 'анкета не блокирует приём');
    assert.ok(pack.requisitesMissing.includes('номер лицензии'));
    assert.equal((await docs.forVisit(clinic.id, first.id)).documents.length, 5, 'повторный вызов ничего не дублирует');
    const numbers = pack.documents.map((doc) => doc.number).sort();
    assert.match(numbers[0], /^\d{4}-000001$/);
    assert.equal(new Set(numbers).size, 5);

    // An unprinted paper follows corrected data; a printed one keeps what was printed.
    await prisma.patient.update({ where: { id: patient.id }, data: { lastName: 'Орлова-Смирнова' } });
    const contractId = pack.documents.find((doc) => doc.kind === 'CONTRACT')!.id;
    assert.match(JSON.stringify((await docs.get(clinic.id, contractId)).data), /Орлова-Смирнова/, 'не напечатанный документ обновился');
    await docs.mark(clinic.id, user.id, contractId, 'printed');
    await prisma.patient.update({ where: { id: patient.id }, data: { lastName: 'Орлова' } });
    assert.match(JSON.stringify((await docs.get(clinic.id, contractId)).data), /Орлова-Смирнова/, 'напечатанный документ не меняется');

    for (const doc of pack.unsigned) await docs.mark(clinic.id, user.id, doc.id, 'signed');
    assert.equal((await docs.blockers(clinic.id, first.id)).length, 0);

    const second = await visitAt(26, filling.id);
    await prisma.treatmentPlan.create({ data: { organizationId: clinic.id, patientId: patient.id, title: 'План', items: { create: [{ title: 'Прицельный снимок', serviceId: xray.id, price: '700', appointmentId: second.id }] } } });
    const next = await docs.forVisit(clinic.id, second.id, user.id);
    const fresh = next.documents.filter((doc) => doc.appointmentId === second.id);
    assert.deepEqual(fresh.map((doc) => `${doc.kind}:${doc.topic}`).sort(), ['IDS_INTERVENTION:therapy', 'XRAY_CONSENT:xray'], 'на второй визит — только новые согласия');
    assert.equal(next.unsigned.length, 2, 'договор и согласия первого визита действуют');

    const contract = next.documents.find((doc) => doc.kind === 'CONTRACT')!;
    await assert.rejects(docs.void(clinic.id, user.id, contract.id, 'нет'), /причину/);
    await docs.void(clinic.id, user.id, contract.id, 'Ошибка в данных пациента');
    const reissued = await docs.forVisit(clinic.id, second.id, user.id);
    const newContract = reissued.documents.find((doc) => doc.kind === 'CONTRACT')!;
    assert.ok(newContract.id !== contract.id && newContract.status === 'CREATED', 'аннулированный договор выдаётся заново');
    await assert.rejects(docs.mark(clinic.id, user.id, contract.id, 'signed'), /аннулирован/);

    await docs.afterVisit(clinic.id, first.id, user.id);
    await docs.afterVisit(clinic.id, first.id, user.id);
    const acts = await prisma.clinicDocument.findMany({ where: { appointmentId: first.id, kind: 'ACT' } });
    assert.equal(acts.length, 1, 'акт один');
    assert.ok(JSON.stringify(acts[0].data).includes('Удаление зуба'));

    const year = new Date().getFullYear();
    await prisma.payment.create({ data: { organizationId: clinic.id, patientId: patient.id, amount: '3000', method: 'CARD' } });
    await prisma.payment.create({ data: { organizationId: clinic.id, patientId: patient.id, amount: '500', method: 'BONUS' } });
    const tax = await docs.taxCertificate(clinic.id, user.id, patient.id, { year });
    const taxDoc = await docs.get(clinic.id, tax.id);
    assert.equal((taxDoc.data as { total: number }).total, 3000, 'бонусы в справку не входят');
    await assert.rejects(docs.taxCertificate(clinic.id, user.id, patient.id, { year: year - 5 }), /оплат нет/);

    const waiting = await docs.list(clinic.id, { status: 'waiting' });
    assert.ok(waiting.every((row) => row.status === 'CREATED' || row.status === 'PRINTED'));
    console.log('documents ok');
  } finally {
    const org = clinic.id;
    await prisma.clinicDocument.deleteMany({ where: { organizationId: org } });
    await prisma.auditLog.deleteMany({ where: { organizationId: org } });
    await prisma.payment.deleteMany({ where: { organizationId: org } });
    await prisma.treatmentPlanItem.deleteMany({ where: { plan: { organizationId: org } } });
    await prisma.treatmentPlan.deleteMany({ where: { organizationId: org } });
    await prisma.appointment.deleteMany({ where: { organizationId: org } });
    await prisma.service.deleteMany({ where: { organizationId: org } });
    await prisma.patient.deleteMany({ where: { organizationId: org } });
    await prisma.branch.deleteMany({ where: { organizationId: org } });
    await prisma.user.deleteMany({ where: { organizationId: org } });
    await prisma.organization.delete({ where: { id: org } });
  }
}

main().finally(() => prisma.$disconnect());
