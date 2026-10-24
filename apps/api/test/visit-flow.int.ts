/**
 * A visit at the chair against a real Postgres: no start without a confirmed medical history, the lines
 * marked done become DONE and land on an invoice, nobody else's lines can be closed, no double close.
 */
import assert from 'node:assert/strict';
import { PrismaClient } from '@dentasmart/database';
import { kopecks } from '@dentasmart/shared';
import { ClinicalService } from '../src/domains/clinical.service';
import { FinanceService } from '../src/domains/finance.service';
import { FlowService } from '../src/domains/flow.service';
import type { ClinicConfigService } from '../src/domains/clinic-config.service';
import { DocumentsService } from '../src/domains/documents';
import type { PrismaService } from '../src/prisma/prisma.service';

const prisma = new PrismaClient();
const db = prisma as unknown as PrismaService;
const documents = new DocumentsService(db);
const signAll = async (orgId: string, visitId: string, userId: string) => {
  for (const doc of (await documents.forVisit(orgId, visitId)).unsigned) await documents.mark(orgId, userId, doc.id, 'signed');
};
const flow = new FlowService(db, {} as ClinicConfigService, new ClinicalService(db), new FinanceService(db), documents);
const stamp = Date.now().toString(36);

async function main() {
  const clinic = await prisma.organization.create({ data: { name: 'Тест приёма', slug: `visit-${stamp}` } });
  const admin = await prisma.user.create({ data: { organizationId: clinic.id, email: `adm-${stamp}@t.local`, passwordHash: 'x' } });
  try {
    const branch = await prisma.branch.create({ data: { organizationId: clinic.id, name: 'Главный' } });
    const patient = await prisma.patient.create({ data: { organizationId: clinic.id, lastName: 'Орлова', firstName: 'Вера' } });
    const other = await prisma.patient.create({ data: { organizationId: clinic.id, lastName: 'Другой', firstName: 'Пациент' } });
    const service = await prisma.service.create({ data: { organizationId: clinic.id, name: 'Лечение кариеса', code: `K-${stamp}`, basePrice: '5500' } });
    const plan = await prisma.treatmentPlan.create({
      data: {
        organizationId: clinic.id, patientId: patient.id, title: 'План', status: 'ACCEPTED',
        items: { create: [
          { title: 'Лечение кариеса', toothNum: 16, price: '5500', serviceId: service.id, status: 'ACCEPTED' },
          { title: 'Лечение кариеса', toothNum: 46, price: '5500', serviceId: service.id, status: 'ACCEPTED' },
        ] },
      },
      include: { items: true },
    });
    const foreign = await prisma.treatmentPlan.create({
      data: { organizationId: clinic.id, patientId: other.id, title: 'Чужой', status: 'ACCEPTED', items: { create: [{ title: 'Коронка', price: '28000', status: 'ACCEPTED' }] } },
      include: { items: true },
    });
    const at = new Date(Date.now() + 3600_000);
    const visit = await prisma.appointment.create({
      data: { organizationId: clinic.id, branchId: branch.id, patientId: patient.id, serviceId: service.id, startsAt: at, endsAt: new Date(+at + 3600_000), status: 'CONFIRMED' },
    });

    const before = await flow.visit(clinic.id, visit.id);
    assert.equal(before.medical.reviewDue, true);
    assert.deepEqual(before.today.map((line) => line.toothNum).sort(), [16, 46], 'на приёме видны строки принятого плана');
    await assert.rejects(flow.start(clinic.id, visit.id), /анамнез/, 'без подтверждённого анамнеза приём не начинается');

    await prisma.patient.update({ where: { id: patient.id }, data: { medicalConfirmedAt: new Date() } });
    await assert.rejects(flow.start(clinic.id, visit.id), /не подписал: Договор/, 'без подписанных документов приём не начинается');
    const papers = await documents.forVisit(clinic.id, visit.id);
    assert.ok(papers.documents.some((doc) => doc.kind === 'IDS_INTERVENTION'), 'согласие на вмешательство по услуге визита');
    await signAll(clinic.id, visit.id, admin.id);
    await flow.start(clinic.id, visit.id);
    await assert.rejects(flow.complete(clinic.id, visit.id, {}), /диагноз/, 'без диагноза визит не закрывается');
    await flow.saveNote(clinic.id, visit.id, 'nobody', { diagnosis: 'K02.1', treatment: 'Пломба 16' });

    await assert.rejects(
      flow.complete(clinic.id, visit.id, { doneItemIds: [plan.items[0].id, foreign.items[0].id] }),
      /не из плана этого пациента/,
      'чужую услугу этим визитом не закрыть',
    );
    assert.equal((await prisma.appointment.findUniqueOrThrow({ where: { id: visit.id } })).status, 'IN_PROGRESS', 'отказ ничего не меняет');

    const tooth16 = plan.items.find((item) => item.toothNum === 16)!;
    const closed = await flow.complete(clinic.id, visit.id, { doneItemIds: [tooth16.id] });
    const act = await prisma.clinicDocument.findFirst({ where: { appointmentId: visit.id, kind: 'ACT' } });
    assert.ok(act && JSON.stringify(act.data).includes('16'), 'после приёма — акт оказанных услуг');
    assert.equal(closed.status, 'COMPLETED');
    const items = await prisma.treatmentPlanItem.findMany({ where: { planId: plan.id }, include: { invoiceItem: true } });
    const done = items.find((item) => item.id === tooth16.id)!;
    assert.equal(done.status, 'DONE');
    assert.equal(done.appointmentId, visit.id);
    assert.ok(done.invoiceItem, 'выполненная услуга попала в счёт');
    assert.equal(items.find((item) => item.toothNum === 46)!.status, 'ACCEPTED', 'неотмеченная осталась в плане');
    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: done.invoiceItem!.invoiceId } });
    assert.equal(kopecks(invoice.totalAmount), 550000);
    assert.equal(invoice.appointmentId, visit.id);
    assert.equal((await flow.visit(clinic.id, visit.id)).debt, 5500, 'долг визита = счёт');

    await assert.rejects(flow.complete(clinic.id, visit.id, { doneItemIds: [] }), /недоступно|уже закрыт/, 'второй раз не закрыть');
    await assert.rejects(flow.addVisitItem(clinic.id, visit.id, { serviceId: service.id }), /во время приёма/, 'в закрытый визит услугу не добавить');

    // A service the plan didn't have, added in the chair to a patient with no plan at all.
    await prisma.patient.update({ where: { id: other.id }, data: { medicalConfirmedAt: new Date() } });
    const at2 = new Date(Date.now() + 5 * 3600_000);
    const walkIn = await prisma.appointment.create({
      data: { organizationId: clinic.id, branchId: branch.id, patientId: other.id, startsAt: at2, endsAt: new Date(+at2 + 1800_000), status: 'WAITING' },
    });
    await prisma.treatmentPlan.deleteMany({ where: { patientId: other.id } });
    await assert.rejects(flow.start(clinic.id, walkIn.id, { skipDocumentsReason: 'коротко' }), /не подписал/);
    await flow.start(clinic.id, walkIn.id, { userId: undefined, skipDocumentsReason: 'Пациент с острой болью, подпишет после' });
    const withLine = await flow.addVisitItem(clinic.id, walkIn.id, { serviceId: service.id, toothNum: 36 });
    const added = withLine.today.find((line) => line.toothNum === 36);
    assert.ok(added && added.booked, 'добавленная на приёме услуга видна и привязана к визиту');
    assert.equal(added!.price, 5500, 'цена из прайса');
    await flow.saveNote(clinic.id, walkIn.id, 'nobody', { diagnosis: 'K02.1', treatment: 'Пломба 36' });
    await flow.complete(clinic.id, walkIn.id, { doneItemIds: [added!.id] });
    const billed = await prisma.treatmentPlanItem.findUniqueOrThrow({ where: { id: added!.id }, include: { invoiceItem: true } });
    assert.equal(billed.status, 'DONE');
    assert.ok(billed.invoiceItem, 'и попала в счёт');
    console.log('visit flow ok');
  } finally {
    const org = clinic.id;
    await prisma.clinicDocument.deleteMany({ where: { organizationId: org } });
    await prisma.auditLog.deleteMany({ where: { organizationId: org } });
    await prisma.payment.deleteMany({ where: { organizationId: org } });
    await prisma.invoiceItem.deleteMany({ where: { invoice: { organizationId: org } } });
    await prisma.invoice.deleteMany({ where: { organizationId: org } });
    await prisma.visitNote.deleteMany({ where: { appointment: { organizationId: org } } });
    await prisma.toothEvent.deleteMany({ where: { patient: { organizationId: org } } }).catch(() => undefined);
    await prisma.toothSurface.deleteMany({ where: { patient: { organizationId: org } } }).catch(() => undefined);
    await prisma.toothRecord.deleteMany({ where: { patient: { organizationId: org } } }).catch(() => undefined);
    await prisma.treatmentPlanItem.deleteMany({ where: { plan: { organizationId: org } } });
    await prisma.treatmentPlan.deleteMany({ where: { organizationId: org } });
    await prisma.receptionQueueItem.deleteMany({ where: { organizationId: org } }).catch(() => undefined);
    await prisma.appointment.deleteMany({ where: { organizationId: org } });
    await prisma.service.deleteMany({ where: { organizationId: org } });
    await prisma.patient.deleteMany({ where: { organizationId: org } });
    await prisma.branch.deleteMany({ where: { organizationId: org } });
    await prisma.organization.delete({ where: { id: org } });
  }
}

main().finally(() => prisma.$disconnect());
