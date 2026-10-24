import type { VisitStatus } from '../route/types';

/** Where a visit may go from each status. The API checks every status change against this. */
const MOVES: Record<VisitStatus, VisitStatus[]> = {
  SCHEDULED: ['CONFIRMED', 'WAITING', 'IN_PROGRESS', 'CANCELLED', 'NO_SHOW'],
  CONFIRMED: ['WAITING', 'IN_PROGRESS', 'CANCELLED', 'NO_SHOW'],
  WAITING: ['IN_PROGRESS', 'CANCELLED', 'NO_SHOW'],
  IN_PROGRESS: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

const LABEL: Record<VisitStatus, string> = {
  SCHEDULED: 'запланирован',
  CONFIRMED: 'подтверждён',
  WAITING: 'пациент ждёт',
  IN_PROGRESS: 'идёт приём',
  COMPLETED: 'проведён',
  CANCELLED: 'отменён',
  NO_SHOW: 'неявка',
};

export function canMoveVisit(from: VisitStatus, to: VisitStatus) {
  return from === to || MOVES[from].includes(to);
}

/** A closed visit is history: it is not moved in time or reopened, it is corrected through an audited action. */
export function isVisitClosed(status: VisitStatus) {
  return status === 'COMPLETED' || status === 'CANCELLED' || status === 'NO_SHOW';
}

export function visitMoveError(from: VisitStatus, to: VisitStatus) {
  if (from === 'COMPLETED') return 'Визит уже проведён. Изменить его статус нельзя';
  if (from === 'CANCELLED') return 'Визит отменён. Создайте новую запись';
  if (from === 'NO_SHOW') return 'Пациент не пришёл. Создайте новую запись';
  return `Из статуса «${LABEL[from]}» нельзя перейти в «${LABEL[to]}»`;
}

export function isVisitStatus(value: string): value is VisitStatus {
  return value in MOVES;
}
