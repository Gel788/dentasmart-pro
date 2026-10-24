import {
  labWorkOf,
  reservationsFor,
  routeOf,
  type RoutePayload,
  type StageInput,
  type VisitStatus,
} from '@dentasmart/shared';

type AnyRec = Record<string, any>;

export type DemoReservation = { itemId: string; itemName: string; quantity: number; status: 'RESERVED' | 'SHORT' | 'CONSUMED' | 'RELEASED'; expectedAt: null };

const VISIT: Record<string, VisitStatus> = { ARRIVED: 'WAITING' };

/** Demo plan lines carry a title, not a service id: they match the price list by name. */
export function reserveDemoLines(lines: AnyRec[], services: AnyRec[], stock: AnyRec[], held: DemoReservation[]) {
  const byName = new Map(services.map((service) => [String(service.name).trim().toLowerCase(), service]));
  const serviceOf = (line: AnyRec) => byName.get(String(line.title ?? '').trim().toLowerCase());
  const norms = services.flatMap((service) =>
    ((service.norms ?? []) as AnyRec[]).map((norm) => ({ serviceId: service.id, itemId: norm.itemId, quantity: Number(norm.quantity) || 0 })),
  );
  const available = new Map<string, number>();
  for (const item of stock) {
    available.set(item.id, ((item.batches ?? []) as AnyRec[]).reduce((sum, batch) => sum + (Number(batch.quantity) || 0), 0));
  }
  for (const row of held) {
    if (row.status === 'RESERVED') available.set(row.itemId, (available.get(row.itemId) ?? 0) - row.quantity);
  }
  const names = new Map(stock.map((item) => [item.id, item.name as string]));
  const drafts = reservationsFor(lines.map((line) => ({ planItemId: line.id, serviceId: serviceOf(line)?.id ?? null })), norms, available);
  const result = new Map<string, DemoReservation[]>();
  for (const draft of drafts) {
    const rows = result.get(draft.planItemId) ?? [];
    rows.push({ itemId: draft.itemId, itemName: names.get(draft.itemId) ?? 'Материал', quantity: draft.quantity, status: draft.status, expectedAt: null });
    result.set(draft.planItemId, rows);
  }
  return result;
}

export function demoLabWork(phase: AnyRec) {
  return labWorkOf(phase.labWork, ((phase.items ?? []) as AnyRec[]).map((item) => String(item.title ?? '')));
}

/** Same shape as `GET /route/patients/:id` on the API, built from the browser bag. */
export function demoRoute(plan: AnyRec | null, appointments: AnyRec[], labOrders: AnyRec[]): RoutePayload {
  if (!plan) return { planId: null, title: null, signedAt: null, route: null };
  let paidLeft = Number(plan.paid ?? 0);
  const stages: StageInput[] = ((plan.phases ?? []) as AnyRec[])
    .filter((phase) => (phase.items ?? []).length && phase.appointmentId)
    .map((phase, index) => {
      const items = phase.items as AnyRec[];
      const price = items.reduce((sum, item) => sum + (Number(item.price) || 0), 0);
      const paid = Math.min(price, Math.max(0, paidLeft));
      paidLeft -= paid;
      const visit = appointments.find((row) => row.id === phase.appointmentId) ?? null;
      const lab = labOrders.find((row) => row.planPhaseId === phase.id) ?? null;
      return {
        id: phase.id,
        title: phase.title,
        sortOrder: Number(phase.sortOrder ?? index + 1),
        healingDays: Number(phase.healingDays ?? 0),
        teeth: [...new Set(items.map((item) => item.toothNum).filter((num): num is number => typeof num === 'number'))],
        price,
        paid,
        labWork: demoLabWork(phase),
        appointment: visit ? { id: visit.id, startsAt: visit.startsAt, status: VISIT[visit.status] ?? (visit.status as VisitStatus) } : null,
        reservations: items.flatMap((item) => (item.reservations ?? []) as DemoReservation[]),
        lab: lab ? { id: lab.id, status: lab.status, dueAt: lab.dueAt ?? null } : null,
      };
    });
  return { planId: plan.id, title: plan.title, signedAt: plan.signedAt ?? null, route: routeOf(stages) };
}
