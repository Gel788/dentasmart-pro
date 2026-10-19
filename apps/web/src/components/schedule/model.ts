import type { VisitStatus } from '@dentasmart/shared';

export type BoardVisit = {
  id: string;
  startsAt: string;
  endsAt: string;
  status: VisitStatus;
  cabinetId: string | null;
  doctorId: string | null;
  patientId: string;
  patient: string;
  doctor: string;
  cabinet: string;
  service: string;
  allergies?: string[];
};

export type DayShell = {
  date: string;
  branches: { id: string; name: string; cabinets: { id: string; name: string }[] }[];
  doctors: { id: string; name: string }[];
  appointments: BoardVisit[];
};

export type RangeDay = { date: string; bookedMinutes: number; capacityMinutes: number; ratio: number; visits: number };

export type RangePayload = {
  from: string;
  to: string;
  offsetMinutes: number;
  hours: { opensAt: number; closesAt: number };
  chairs: number;
  days: RangeDay[];
  appointments: BoardVisit[];
};

export type Column = { id: string; label: string; sub?: string; date: string; match: (visit: BoardVisit) => boolean; move: { cabinetId?: string; doctorId?: string } };

/** How each visit status reads on the board: a word and a tone, never colour alone. */
export const STATUS: Record<VisitStatus, { label: string; tone: 'wait' | 'ok' | 'here' | 'live' | 'done' | 'bad' }> = {
  SCHEDULED: { label: 'Не подтверждён', tone: 'wait' },
  CONFIRMED: { label: 'Подтверждён', tone: 'ok' },
  WAITING: { label: 'В клинике', tone: 'here' },
  IN_PROGRESS: { label: 'Идёт приём', tone: 'live' },
  COMPLETED: { label: 'Проведён', tone: 'done' },
  CANCELLED: { label: 'Отменён', tone: 'bad' },
  NO_SHOW: { label: 'Неявка', tone: 'bad' },
};

export const ACTION: Partial<Record<VisitStatus, string>> = {
  CONFIRMED: 'Подтвердить',
  WAITING: 'Пациент пришёл',
  IN_PROGRESS: 'Начать приём',
  COMPLETED: 'Завершить',
  NO_SHOW: 'Не пришёл',
  CANCELLED: 'Отменить визит',
};

/** Minutes since local midnight in the clinic's wall clock. */
export function wallMinutes(iso: string, offset: number) {
  const date = new Date(Date.parse(iso) + offset * 60000);
  return date.getUTCHours() * 60 + date.getUTCMinutes();
}

/** The instant for a clinic-local date and minute of day. */
export function instantAt(date: string, minutes: number, offset: number) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + (minutes - offset) * 60000).toISOString();
}

export function todayIn(offset: number) {
  return new Date(Date.now() + offset * 60000).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
}

/** Monday of the week the date falls in. */
export function weekStart(date: string) {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return addDays(date, -((day + 6) % 7));
}

export function monthBounds(date: string) {
  const [y, m] = date.split('-').map(Number);
  const first = `${y}-${String(m).padStart(2, '0')}-01`;
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return { first, last };
}

export const clock = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

export const dayTitle = (date: string, options: Intl.DateTimeFormatOptions) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString('ru-RU', { timeZone: 'UTC', ...options });
