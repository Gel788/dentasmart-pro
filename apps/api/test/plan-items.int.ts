/**
 * Adding services to a patient's plan against a real Postgres: a patient without a plan gets a draft,
 * the line takes the price list, edits change the total, and another clinic's plan stays out of reach.
 */
import assert from 'node:assert/strict';
import { PrismaClient } from '@dentasmart/database';
import { ClinicalService } from '../src/domains/clinical.service';
import type { PrismaService } from '../src/prisma/prisma.service';

const prisma = new PrismaClient();
const clinical = new ClinicalService(prisma as unknown as PrismaService);
const stamp = Date.now().toString(36);

async function main() {
  const clinic = await prisma.organization.create({ data: { name: 'Тест плана', slug: `plan-${stamp}` } });
  const other = await prisma.organization.create({ data: { name: 'Чужая', slug: `plan-other-${stamp}` } });
  try {
    const patient = await prisma.patient.create({ data: { organizationId: clinic.id, lastName: 'Новикова', firstName: 'Ирина' } });
    const stranger = await prisma.patient.create({ data: { organizationId: other.id, lastName: 'Чужой', firstName: 'Пётр' } });
    const filling = await prisma.service.create({ data: { organizationId: clinic.id, name: 'Пломба светового отверждения', code: `F-${stamp}`, basePrice: '4500', durationMin: 45 } });

    await assert.rejects(clinical.createPlan(clinic.id, { patientId: stranger.id, title: 'x' }), /не найден/, 'план чужому пациенту не создать');
    const plan = await clinical.createPlan(clinic.id, { patientId: patient.id, title: 'План лечения' });
    assert.equal(plan.status, 'DRAFT');

    const line = await clinical.addPlanItem(clinic.id, plan.id, { serviceId: filling.id, toothNum: 16 });
    assert.equal(line.title, 'Пломба светового отверждения');
    assert.equal(Number(line.price), 4500, 'цена из прайса');
    assert.equal(line.durationMin, 45);
    await clinical.addPlanItem(clinic.id, plan.id, { serviceId: filling.id });
    assert.equal(Number((await prisma.treatmentPlan.findUniqueOrThrow({ where: { id: plan.id } })).totalPrice), 9000, 'сумма плана пересчитана');

    await clinical.updatePlanItem(clinic.id, line.id, { price: 4000 });
    assert.equal(Number((await prisma.treatmentPlan.findUniqueOrThrow({ where: { id: plan.id } })).totalPrice), 8500, 'правка строки меняет сумму');

    await assert.rejects(clinical.addPlanItem(other.id, plan.id, { serviceId: filling.id }), /План не найден/, 'в чужой план не добавить');
    await assert.rejects(clinical.updatePlanItem(other.id, line.id, { price: 1 }), /не найдена/, 'чужую строку не изменить');
    await assert.rejects(clinical.addPlanItem(clinic.id, plan.id, { toothNum: 16 }), /Укажите услугу/, 'без услуги строка не создаётся');
    await assert.rejects(clinical.addPlanItem(clinic.id, plan.id, { serviceId: filling.id, toothNum: 99 }), /FDI/);
    console.log('plan items ok');
  } finally {
    for (const org of [clinic.id, other.id]) {
      await prisma.treatmentPlanItem.deleteMany({ where: { plan: { organizationId: org } } });
      await prisma.treatmentPlan.deleteMany({ where: { organizationId: org } });
      await prisma.service.deleteMany({ where: { organizationId: org } });
      await prisma.patient.deleteMany({ where: { organizationId: org } });
      await prisma.organization.delete({ where: { id: org } });
    }
  }
}

main().finally(() => prisma.$disconnect());
