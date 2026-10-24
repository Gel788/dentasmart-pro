import type { Axis, Readiness, Route, RouteStage, StageInput } from './types';

const rub = (value: number) => `${Math.round(value).toLocaleString('ru-RU').replace(/ /g, ' ')} ₽`;
const dayMonth = (iso: string) => {
  const date = new Date(iso);
  return `${String(date.getUTCDate()).padStart(2, '0')}.${String(date.getUTCMonth() + 1).padStart(2, '0')}.${date.getUTCFullYear()}`;
};

function visitAxis(stage: StageInput): Axis {
  const visit = stage.appointment;
  if (!visit || visit.status === 'CANCELLED' || visit.status === 'NO_SHOW') return { state: 'blocked', reason: 'Визит не назначен' };
  if (visit.status === 'COMPLETED') return { state: 'ready', reason: 'Проведён' };
  if (visit.status === 'WAITING' || visit.status === 'IN_PROGRESS') return { state: 'ready', reason: 'Пациент в клинике' };
  if (visit.status === 'CONFIRMED') return { state: 'ready', reason: 'Подтверждён' };
  return { state: 'waiting', reason: 'Не подтверждён' };
}

function materialsAxis(stage: StageInput): Axis {
  const active = stage.reservations.filter((row) => row.status !== 'RELEASED');
  if (!active.length) return { state: 'none', reason: 'Не нужны' };
  if (active.every((row) => row.status === 'CONSUMED')) return { state: 'ready', reason: 'Списаны' };
  const missing = active.find((row) => row.status === 'SHORT' && !row.expectedAt);
  if (missing) return { state: 'blocked', reason: `${missing.itemName}: нет на складе` };
  const coming = active.find((row) => row.status === 'SHORT');
  if (coming) return { state: 'waiting', reason: `${coming.itemName}: в пути до ${dayMonth(coming.expectedAt as string)}` };
  return { state: 'ready', reason: 'В резерве' };
}

// Lab due dates are calendar days; «срок прошёл» only once that day is over in the clinic (Moscow time).
const CLINIC_OFFSET_MS = 3 * 3600_000;
const calendarDay = (at: number) => new Date(at).toISOString().slice(0, 10);
function duePassed(dueAt: string, now: Date) {
  const due = /^\d{4}-\d{2}-\d{2}$/.test(dueAt) || /T00:00:00(\.000)?Z$/.test(dueAt) ? dueAt.slice(0, 10) : calendarDay(Date.parse(dueAt) + CLINIC_OFFSET_MS);
  return due < calendarDay(now.getTime() + CLINIC_OFFSET_MS);
}

function labAxis(stage: StageInput, now: Date): Axis {
  const lab = stage.lab;
  if (!lab) return { state: 'none', reason: 'Не нужна' };
  if (lab.status === 'READY' || lab.status === 'DELIVERED') return { state: 'ready', reason: 'Готово' };
  if (lab.status === 'REJECTED') return { state: 'blocked', reason: 'Работа отклонена' };
  const visit = stage.appointment;
  if (lab.dueAt && visit && Date.parse(lab.dueAt) > Date.parse(visit.startsAt)) return { state: 'blocked', reason: 'Не успевает к визиту' };
  if (lab.dueAt && duePassed(lab.dueAt, now)) return { state: 'blocked', reason: 'Срок сдачи прошёл' };
  if (lab.status === 'WAITING_IMPRESSION') return { state: 'waiting', reason: 'Ждёт слепок' };
  return { state: 'waiting', reason: lab.dueAt ? `В работе до ${dayMonth(lab.dueAt)}` : 'В работе' };
}

function paymentAxis(stage: StageInput): Axis {
  if (stage.price <= 0) return { state: 'none', reason: 'Без оплаты' };
  const left = stage.price - stage.paid;
  if (left <= 0) return { state: 'ready', reason: 'Оплачено' };
  return { state: 'waiting', reason: `${rub(left)} к визиту` };
}

export function readiness(stage: StageInput, now: Date = new Date()): Readiness {
  return { visit: visitAxis(stage), materials: materialsAxis(stage), lab: labAxis(stage, now), payment: paymentAxis(stage) };
}

export function routeOf(stages: StageInput[], now: Date = new Date()): Route {
  const sorted = [...stages].sort((a, b) => a.sortOrder - b.sortOrder);
  const currentIndex = sorted.findIndex((stage) => stage.appointment?.status !== 'COMPLETED');
  const built: RouteStage[] = sorted.map((stage, index) => ({
    ...stage,
    status: stage.appointment?.status === 'COMPLETED' ? 'done' : index === currentIndex ? 'current' : 'upcoming',
    readiness: readiness(stage, now),
  }));
  return {
    stages: built,
    currentIndex,
    price: sorted.reduce((sum, stage) => sum + stage.price, 0),
    paid: sorted.reduce((sum, stage) => sum + stage.paid, 0),
  };
}
