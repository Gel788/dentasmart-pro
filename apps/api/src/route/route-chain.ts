import { Prisma } from '@dentasmart/database';
import { labDueAt, reservationsFor } from '@dentasmart/shared';

type Tx = Prisma.TransactionClient;

/** Holds materials for every accepted plan line that has none yet; what the shelf cannot cover is kept as a shortage. */
export async function reserveForPlan(tx: Tx, input: { organizationId: string; branchId: string; planId: string }) {
  const items = await tx.treatmentPlanItem.findMany({
    where: {
      planId: input.planId,
      status: 'ACCEPTED',
      reservations: { none: { status: { in: ['RESERVED', 'SHORT', 'CONSUMED'] } } },
    },
    select: { id: true, serviceId: true, appointmentId: true },
  });
  const serviceIds = [...new Set(items.map((item) => item.serviceId).filter((id): id is string => Boolean(id)))];
  if (!serviceIds.length) return { reserved: 0, short: 0 };
  const norms = await tx.serviceMaterialNorm.findMany({
    where: { organizationId: input.organizationId, serviceId: { in: serviceIds } },
    select: { serviceId: true, itemId: true, quantity: true },
  });
  if (!norms.length) return { reserved: 0, short: 0 };
  const itemIds = [...new Set(norms.map((norm) => norm.itemId))];
  const stock = await tx.stockBatch.groupBy({
    by: ['itemId'],
    where: { itemId: { in: itemIds }, branchId: input.branchId },
    _sum: { quantity: true },
  });
  const held = await tx.materialReservation.groupBy({
    by: ['itemId'],
    where: { itemId: { in: itemIds }, branchId: input.branchId, status: 'RESERVED' },
    _sum: { quantity: true },
  });
  const available = new Map<string, number>();
  for (const row of stock) available.set(row.itemId, Number(row._sum.quantity ?? 0));
  for (const row of held) available.set(row.itemId, (available.get(row.itemId) ?? 0) - Number(row._sum.quantity ?? 0));

  const drafts = reservationsFor(
    items.map((item) => ({ planItemId: item.id, serviceId: item.serviceId })),
    norms.map((norm) => ({ serviceId: norm.serviceId, itemId: norm.itemId, quantity: Number(norm.quantity) })),
    available,
  );
  const appointmentOf = new Map(items.map((item) => [item.id, item.appointmentId]));
  if (drafts.length) {
    await tx.materialReservation.createMany({
      data: drafts.map((draft) => ({
        organizationId: input.organizationId,
        planItemId: draft.planItemId,
        appointmentId: appointmentOf.get(draft.planItemId) ?? null,
        itemId: draft.itemId,
        branchId: input.branchId,
        quantity: draft.quantity,
        status: draft.status,
      })),
    });
  }
  return {
    reserved: drafts.filter((draft) => draft.status === 'RESERVED').length,
    short: drafts.filter((draft) => draft.status === 'SHORT').length,
  };
}

/** Opens a lab order for each booked stage that needs lab work, due two working days before its visit. */
export async function openLabOrders(tx: Tx, input: { organizationId: string; planId: string; patientId: string; doctorId: string | null }) {
  const phases = await tx.planPhase.findMany({
    where: { planId: input.planId, labWork: { not: null }, labOrders: { none: {} } },
    include: {
      items: {
        where: { appointmentId: { not: null } },
        select: { appointment: { select: { id: true, startsAt: true } } },
        take: 1,
      },
    },
  });
  let opened = 0;
  for (const phase of phases) {
    const visit = phase.items[0]?.appointment ?? null;
    if (!visit) continue;
    await tx.labOrder.create({
      data: {
        organizationId: input.organizationId,
        patientId: input.patientId,
        doctorId: input.doctorId,
        title: phase.labWork as string,
        status: 'WAITING_IMPRESSION',
        planPhaseId: phase.id,
        appointmentId: visit.id,
        dueAt: labDueAt(visit.startsAt),
      },
    });
    opened += 1;
  }
  return opened;
}
