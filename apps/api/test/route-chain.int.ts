/**
 * Runs against a seeded database (DATABASE_URL). Everything it writes happens inside
 * a transaction that is rolled back at the end, so the seed stays as it was.
 */
import assert from 'node:assert/strict';
import { PrismaClient } from '@dentasmart/database';
import { consumeForVisit, moveLabDeadlines, openLabOrders, reserveForPlan } from '../src/route/route-chain';

const prisma = new PrismaClient();
class Rollback extends Error {}

async function main() {
  const plan = await prisma.treatmentPlan.findFirstOrThrow({
    where: { items: { some: { serviceId: { not: null } } }, phases: { some: {} } },
    include: { items: true, phases: { orderBy: { sortOrder: 'asc' } } },
  });
  const branch = await prisma.branch.findFirstOrThrow({ where: { organizationId: plan.organizationId } });
  const line = plan.items.find((item) => item.serviceId)!;
  const material = await prisma.inventoryItem.findFirstOrThrow({ where: { organizationId: plan.organizationId } });
  const otherOrg = await prisma.organization.create({ data: { name: 'Чужая клиника', slug: `other-${Date.now()}` } });

  try {
    await prisma.$transaction(async (tx) => {
      await tx.serviceMaterialNorm.upsert({
        where: { serviceId_itemId: { serviceId: line.serviceId!, itemId: material.id } },
        create: { organizationId: plan.organizationId, serviceId: line.serviceId!, itemId: material.id, quantity: 2 },
        update: { quantity: 2 },
      });
      await tx.stockBatch.deleteMany({ where: { itemId: material.id, branchId: branch.id } });
      await tx.stockBatch.create({ data: { itemId: material.id, branchId: branch.id, quantity: 1 } });
      await tx.treatmentPlanItem.updateMany({ where: { planId: plan.id }, data: { status: 'ACCEPTED' } });
      const visit = await tx.appointment.create({
        data: {
          organizationId: plan.organizationId,
          branchId: branch.id,
          patientId: plan.patientId,
          startsAt: new Date('2030-01-09T07:00:00Z'),
          endsAt: new Date('2030-01-09T08:00:00Z'),
          status: 'SCHEDULED',
        },
      });
      await tx.treatmentPlanItem.update({ where: { id: line.id }, data: { appointmentId: visit.id, phaseId: plan.phases[0].id } });
      await tx.planPhase.update({ where: { id: plan.phases[0].id }, data: { labWork: 'Коронка цирконий' } });

      const first = await reserveForPlan(tx, { organizationId: plan.organizationId, branchId: branch.id, planId: plan.id });
      const lines = plan.items.filter((item) => item.serviceId === line.serviceId).length;
      const rows = await tx.materialReservation.findMany({ where: { planItem: { planId: plan.id }, itemId: material.id } });
      const sum = (status: string) => rows.filter((row) => row.status === status).reduce((total, row) => total + Number(row.quantity), 0);
      assert.equal(sum('RESERVED'), 1, 'в резерв ушла единственная единица со склада');
      assert.equal(sum('SHORT'), 2 * lines - 1, 'остальное по норме 2 на строку стало дефицитом');
      const own = rows.filter((row) => row.planItemId === line.id);
      assert.ok(own.length > 0 && own.every((row) => row.appointmentId === visit.id), 'резерв привязан к визиту строки');
      assert.ok(first.reserved >= 1 && first.short >= 1);

      const again = await reserveForPlan(tx, { organizationId: plan.organizationId, branchId: branch.id, planId: plan.id });
      assert.deepEqual(again, { reserved: 0, short: 0 }, 'повторная подпись не задваивает резерв');

      const labs = await openLabOrders(tx, { organizationId: plan.organizationId, planId: plan.id, patientId: plan.patientId, doctorId: plan.doctorId });
      assert.equal(labs, 1, 'заказ-наряд открыт для этапа с работой лаборатории');
      const lab = await tx.labOrder.findFirstOrThrow({ where: { planPhaseId: plan.phases[0].id } });
      assert.equal(lab.status, 'WAITING_IMPRESSION');
      assert.equal(lab.dueAt?.toISOString(), '2030-01-07T07:00:00.000Z', 'срок за 2 рабочих дня до визита');
      assert.equal(await openLabOrders(tx, { organizationId: plan.organizationId, planId: plan.id, patientId: plan.patientId, doctorId: plan.doctorId }), 0, 'второй раз не открывается');

      const foreign = await reserveForPlan(tx, { organizationId: otherOrg.id, branchId: branch.id, planId: plan.id });
      assert.deepEqual(foreign, { reserved: 0, short: 0 }, 'нормы чужой клиники не применяются');

      await moveLabDeadlines(tx, plan.organizationId, visit.id, new Date('2030-01-14T07:00:00Z'));
      const moved = await tx.labOrder.findFirstOrThrow({ where: { id: lab.id } });
      assert.equal(moved.dueAt?.toISOString(), '2030-01-10T07:00:00.000Z', 'перенос визита на понедельник сдвигает срок на четверг');

      await consumeForVisit(tx, plan.organizationId, visit.id);
      const used = await tx.materialReservation.findMany({ where: { appointmentId: visit.id } });
      assert.ok(used.length > 0 && used.every((row) => row.status === 'CONSUMED'), 'закрытый визит отмечает резерв использованным');

      console.log('route-chain ok', { first, labs });
      throw new Rollback();
    });
  } catch (error) {
    if (!(error instanceof Rollback)) throw error;
  } finally {
    await prisma.organization.delete({ where: { id: otherOrg.id } });
  }
}

main().finally(() => prisma.$disconnect());
