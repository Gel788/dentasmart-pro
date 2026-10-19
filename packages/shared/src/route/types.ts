export type AxisState = 'ready' | 'waiting' | 'blocked' | 'none';

export interface Axis {
  state: AxisState;
  reason: string;
}

export interface Readiness {
  visit: Axis;
  materials: Axis;
  lab: Axis;
  payment: Axis;
}

export type VisitStatus = 'SCHEDULED' | 'CONFIRMED' | 'WAITING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';
export type ReservationStatus = 'RESERVED' | 'SHORT' | 'CONSUMED' | 'RELEASED';
export type LabStatus = 'WAITING_IMPRESSION' | 'RECEIVED' | 'IN_PROGRESS' | 'READY' | 'DELIVERED' | 'REJECTED';

export interface StageInput {
  id: string;
  title: string;
  sortOrder: number;
  healingDays: number;
  teeth: number[];
  price: number;
  paid: number;
  labWork: string | null;
  appointment: { id: string; startsAt: string; status: VisitStatus } | null;
  reservations: { itemName: string; quantity: number; status: ReservationStatus; expectedAt: string | null }[];
  lab: { id: string; status: LabStatus; dueAt: string | null } | null;
}

export type StageStatus = 'done' | 'current' | 'upcoming';

export interface RouteStage extends StageInput {
  status: StageStatus;
  readiness: Readiness;
}

export interface Route {
  stages: RouteStage[];
  currentIndex: number;
  price: number;
  paid: number;
}

export interface PlanItemNeed {
  planItemId: string;
  serviceId: string | null;
}

export interface MaterialNorm {
  serviceId: string;
  itemId: string;
  quantity: number;
}

export interface ReservationDraft {
  planItemId: string;
  itemId: string;
  quantity: number;
  status: 'RESERVED' | 'SHORT';
}

/** What `GET /route/patients/:id` returns; `route` is null until the patient signs a plan. */
export interface RoutePayload {
  planId: string | null;
  title: string | null;
  signedAt: string | null;
  route: Route | null;
}
