import type { MaterialNorm, PlanItemNeed, ReservationDraft } from './types';

const round3 = (value: number) => Math.round(value * 1000) / 1000;

/** Splits each plan line's material norm into what the shelf covers now and what is short. */
export function reservationsFor(items: PlanItemNeed[], norms: MaterialNorm[], available: Map<string, number>): ReservationDraft[] {
  const left = new Map(available);
  const rows: ReservationDraft[] = [];
  for (const item of items) {
    if (!item.serviceId) continue;
    for (const norm of norms.filter((row) => row.serviceId === item.serviceId)) {
      const onShelf = Math.max(0, left.get(norm.itemId) ?? 0);
      const covered = round3(Math.min(onShelf, norm.quantity));
      const short = round3(norm.quantity - covered);
      if (covered > 0) rows.push({ planItemId: item.planItemId, itemId: norm.itemId, quantity: covered, status: 'RESERVED' });
      if (short > 0) rows.push({ planItemId: item.planItemId, itemId: norm.itemId, quantity: short, status: 'SHORT' });
      left.set(norm.itemId, round3(onShelf - covered));
    }
  }
  return rows;
}
