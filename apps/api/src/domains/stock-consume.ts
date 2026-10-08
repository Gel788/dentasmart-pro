import { Prisma } from '@dentasmart/database';

type ConsumeDb = Prisma.TransactionClient | {
  stockBatch: Prisma.TransactionClient['stockBatch'];
  stockMovement: Prisma.TransactionClient['stockMovement'];
};

export async function consumeStock(
  db: ConsumeDb,
  data: {
    organizationId: string;
    itemId: string;
    branchId: string;
    quantity: number;
    type: 'WRITE_OFF' | 'TREATMENT_USE';
    notes?: string;
  },
) {
  const batches = await db.stockBatch.findMany({
    where: { itemId: data.itemId, branchId: data.branchId, quantity: { gt: 0 } },
  });
  const dated = batches
    .filter((batch) => batch.expiresAt)
    .sort((a, b) => a.expiresAt!.getTime() - b.expiresAt!.getTime());
  const open = batches.filter((batch) => !batch.expiresAt);
  let left = data.quantity;
  let cost = 0;
  for (const batch of [...dated, ...open]) {
    if (left <= 0) break;
    const available = Number(batch.quantity);
    const take = Math.min(left, available);
    await db.stockBatch.update({
      where: { id: batch.id },
      data: { quantity: available - take },
    });
    cost += take * Number(batch.costPrice ?? 0);
    left -= take;
  }
  const short = Math.round(left * 1000) / 1000;
  const notes = short > 0 ? `${data.notes ?? 'Списание'}. Не хватило ${short}` : data.notes;
  const movement = await db.stockMovement.create({
    data: {
      organizationId: data.organizationId,
      itemId: data.itemId,
      branchId: data.branchId,
      type: data.type,
      quantity: data.quantity,
      costAmount: Math.round(cost * 100) / 100,
      notes,
    },
  });
  return { movement, cost: Math.round(cost * 100) / 100, short };
}
