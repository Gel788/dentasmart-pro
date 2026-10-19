import type { Axis, Readiness, Route, RouteStage, StageInput } from './types';

const rub = (value: number) => `${Math.round(value).toLocaleString('ru-RU').replace(/ /g, ' ')} ₽`;
const dayMonth = (iso: string) => {
  const date = new Date(iso);
  return `${String(date.getUTCDate()).padStart(2, '0')}.${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
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

function labAxis(stage: StageInput): Axis {
  const lab = stage.lab;
  if (!lab) return { state: 'none', reason: 'Не нужна' };
  if (lab.status === 'READY' || lab.status === 'DELIVERED') return { state: 'ready', reason: 'Готово' };
  if (lab.status === 'REJECTED') return { state: 'blocked', reason: 'Работа отклонена' };
  const visit = stage.appointment;
  if (lab.dueAt && visit && Date.parse(lab.dueAt) > Date.parse(visit.startsAt)) return { state: 'blocked', reason: 'Не успевает к визиту' };
  if (lab.status === 'WAITING_IMPRESSION') return { state: 'waiting', reason: 'Ждёт слепок' };
  return { state: 'waiting', reason: lab.dueAt ? `В работе до ${dayMonth(lab.dueAt)}` : 'В работе' };
}

function paymentAxis(stage: StageInput): Axis {
  if (stage.price <= 0) return { state: 'none', reason: 'Без оплаты' };
  const left = stage.price - stage.paid;
  if (left <= 0) return { state: 'ready', reason: 'Оплачено' };
  return { state: 'waiting', reason: `${rub(left)} к визиту` };
}

export function readiness(stage: StageInput): Readiness {
  return { visit: visitAxis(stage), materials: materialsAxis(stage), lab: labAxis(stage), payment: paymentAxis(stage) };
}

export function routeOf(stages: StageInput[]): Route {
  const sorted = [...stages].sort((a, b) => a.sortOrder - b.sortOrder);
  const currentIndex = sorted.findIndex((stage) => stage.appointment?.status !== 'COMPLETED');
  const built: RouteStage[] = sorted.map((stage, index) => ({
    ...stage,
    status: stage.appointment?.status === 'COMPLETED' ? 'done' : index === currentIndex ? 'current' : 'upcoming',
    readiness: readiness(stage),
  }));
  return {
    stages: built,
    currentIndex,
    price: sorted.reduce((sum, stage) => sum + stage.price, 0),
    paid: sorted.reduce((sum, stage) => sum + stage.paid, 0),
  };
}
