import { Prisma } from '@dentasmart/database';
import { labDueAt, labWorkOf, reservationsFor } from '@dentasmart/shared';

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

/** Opens a lab order for each booked stage that needs lab work (see labWorkOf), due two working days before its visit. */
export async function openLabOrders(tx: Tx, input: { organizationId: string; planId: string; patientId: string; doctorId: string | null }) {
  const phases = await tx.planPhase.findMany({
    where: { planId: input.planId, labOrders: { none: {} } },
    include: {
      items: {
        where: { status: 'ACCEPTED' },
        select: { title: true, appointment: { select: { id: true, startsAt: true } } },
      },
    },
  });
  let opened = 0;
  for (const phase of phases) {
    const work = labWorkOf(phase.labWork, phase.items.map((item) => item.title));
    const visit = phase.items.find((item) => item.appointment)?.appointment ?? null;
    if (!work || !visit) continue;
    await tx.labOrder.create({
      data: {
        organizationId: input.organizationId,
        patientId: input.patientId,
        doctorId: input.doctorId,
        title: work,
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

/** Stock leaves the shelf through the visit's materials (kits, service norms); the reservation only records that it was used. */
export async function consumeForVisit(db: Tx, organizationId: string, appointmentId: string) {
  await db.materialReservation.updateMany({
    where: { organizationId, appointmentId, status: { in: ['RESERVED', 'SHORT'] } },
    data: { status: 'CONSUMED' },
  });
}

/** A moved visit drags its open lab orders' deadlines with it. */
export async function moveLabDeadlines(db: Tx, organizationId: string, appointmentId: string, startsAt: Date) {
  await db.labOrder.updateMany({
    where: { organizationId, appointmentId, status: { in: ['WAITING_IMPRESSION', 'RECEIVED', 'IN_PROGRESS'] } },
    data: { dueAt: labDueAt(startsAt) },
  });
}
