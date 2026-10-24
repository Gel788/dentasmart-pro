export interface TimedVisit {
  id: string;
  startsAt: string;
  endsAt: string;
  status?: string;
}

/**
 * Side-by-side placement for visits that overlap in one column. A cluster of overlapping visits shares
 * the width it needs; visits outside the cluster keep the full width.
 */
export function layoutLanes(visits: TimedVisit[]): Map<string, { lane: number; lanes: number }> {
  const sorted = [...visits].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt) || Date.parse(b.endsAt) - Date.parse(a.endsAt));
  const result = new Map<string, { lane: number; lanes: number }>();
  let cluster: { id: string; lane: number }[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -Infinity;
  const close = () => {
    for (const item of cluster) result.set(item.id, { lane: item.lane, lanes: laneEnds.length });
    cluster = [];
    laneEnds = [];
  };
  for (const visit of sorted) {
    const start = Date.parse(visit.startsAt);
    const end = Date.parse(visit.endsAt);
    if (start >= clusterEnd) {
      close();
      clusterEnd = -Infinity;
    }
    let lane = laneEnds.findIndex((laneEnd) => laneEnd <= start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(end);
    } else {
      laneEnds[lane] = end;
    }
    cluster.push({ id: visit.id, lane });
    clusterEnd = Math.max(clusterEnd, end);
  }
  close();
  return result;
}

const IDLE = new Set(['CANCELLED', 'NO_SHOW']);

/**
 * How full a day is: booked chair-minutes inside opening hours over what the chairs can hold.
 * `tzOffsetMinutes` turns the stored UTC times into clinic wall time.
 */
export function dayLoad(
  visits: TimedVisit[],
  hours: { chairs: number; opensAt: number; closesAt: number; tzOffsetMinutes: number },
) {
  const capacityMinutes = Math.max(0, hours.chairs) * Math.max(0, hours.closesAt - hours.opensAt);
  let bookedMinutes = 0;
  let count = 0;
  for (const visit of visits) {
    if (visit.status && IDLE.has(visit.status)) continue;
    const wall = (iso: string) => {
      const date = new Date(Date.parse(iso) + hours.tzOffsetMinutes * 60000);
      return date.getUTCHours() * 60 + date.getUTCMinutes();
    };
    const from = Math.max(hours.opensAt, wall(visit.startsAt));
    const to = Math.min(hours.closesAt, wall(visit.endsAt));
    if (to > from) bookedMinutes += to - from;
    count += 1;
  }
  return { bookedMinutes, capacityMinutes, ratio: capacityMinutes ? Math.min(1, bookedMinutes / capacityMinutes) : 0, visits: count };
}

/** Five steps of fullness for the month strip: empty, light, half, busy, full. */
export function loadLevel(ratio: number): 0 | 1 | 2 | 3 | 4 {
  if (ratio <= 0) return 0;
  if (ratio < 0.3) return 1;
  if (ratio < 0.6) return 2;
  if (ratio < 0.85) return 3;
  return 4;
}

const DEFAULT_HOURS = { opensAt: 8 * 60, closesAt: 20 * 60 };

/** Opening hours from the clinic's free-text setting ("Пн–Сб 09:00–21:00", "9:30-18"); 8–20 when unreadable. */
export function parseWorkHours(text: string | null | undefined) {
  const match = (text ?? '').match(/(\d{1,2})(?::(\d{2}))?\s*[–—-]\s*(\d{1,2})(?::(\d{2}))?/);
  if (!match) return { ...DEFAULT_HOURS };
  const opensAt = Number(match[1]) * 60 + Number(match[2] ?? 0);
  const closesAt = Number(match[3]) * 60 + Number(match[4] ?? 0);
  if (!(opensAt < closesAt) || closesAt > 24 * 60) return { ...DEFAULT_HOURS };
  return { opensAt, closesAt };
}

/** One day's opening hours in clinic-local minutes; null when the clinic is closed that day. */
/** A day's hours may carry one break (lunch) inside them. */
export type DayHours = { opensAt: number; closesAt: number; breakFrom?: number; breakTo?: number } | null;
/** Seven days, Monday first. */
export type WeekHours = DayHours[];

export const WEEKDAYS_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

const hhmm = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/** Checks a weekly schedule sent by the settings screen; throws a message the clinic can act on. */
export function normalizeWeekHours(input: unknown): WeekHours {
  if (!Array.isArray(input) || input.length !== 7) throw new Error('Нужны часы на все семь дней недели');
  return input.map((day, index) => {
    if (day === null || day === undefined || day === false) return null;
    const opensAt = Number((day as { opensAt?: unknown }).opensAt);
    const closesAt = Number((day as { closesAt?: unknown }).closesAt);
    const ok = Number.isInteger(opensAt) && Number.isInteger(closesAt) && opensAt >= 0 && closesAt <= 24 * 60 && opensAt < closesAt;
    if (!ok) throw new Error(`${WEEKDAYS_SHORT[index]}: время закрытия должно быть позже открытия`);
    const rawFrom = (day as { breakFrom?: unknown }).breakFrom;
    const rawTo = (day as { breakTo?: unknown }).breakTo;
    if (rawFrom === undefined || rawFrom === null || rawTo === undefined || rawTo === null) return { opensAt, closesAt };
    const breakFrom = Number(rawFrom);
    const breakTo = Number(rawTo);
    if (!(Number.isInteger(breakFrom) && Number.isInteger(breakTo) && opensAt < breakFrom && breakFrom < breakTo && breakTo < closesAt)) {
      throw new Error(`${WEEKDAYS_SHORT[index]}: перерыв должен быть внутри рабочего времени`);
    }
    return { opensAt, closesAt, breakFrom, breakTo };
  });
}

/** The stored weekly schedule, or the old one-line setting applied to every day. */
export function weekHoursOf(stored: unknown, text?: string | null): WeekHours {
  try {
    return normalizeWeekHours(stored);
  } catch {
    const day = parseWorkHours(text);
    return Array.from({ length: 7 }, () => ({ ...day }));
  }
}

/** Hours for a clinic-local date (YYYY-MM-DD). */
export function hoursOn(week: WeekHours, date: string): DayHours {
  const weekday = (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;
  return week[weekday] ?? null;
}

/** The weekly schedule as one readable line: «Пн–Пт 15:00–22:00, Вс 08:00–15:00». */
export function weekHoursText(week: WeekHours) {
  const parts: string[] = [];
  let index = 0;
  while (index < 7) {
    const day = week[index];
    let end = index;
    while (end + 1 < 7 && sameHours(week[end + 1], day)) end += 1;
    if (day) {
      const days = end > index ? `${WEEKDAYS_SHORT[index]}–${WEEKDAYS_SHORT[end]}` : WEEKDAYS_SHORT[index];
      parts.push(`${days} ${hhmm(day.opensAt)}–${hhmm(day.closesAt)}${day.breakFrom !== undefined && day.breakTo !== undefined ? ` (перерыв ${hhmm(day.breakFrom)}–${hhmm(day.breakTo)})` : ''}`);
    }
    index = end + 1;
  }
  return parts.length ? parts.join(', ') : 'Выходные все дни';
}

function sameHours(a: DayHours, b: DayHours) {
  return a === b || (!!a && !!b && a.opensAt === b.opensAt && a.closesAt === b.closesAt && a.breakFrom === b.breakFrom && a.breakTo === b.breakTo);
}

/**
 * A dated change to the usual week: a holiday or vacation (closed) or different hours, for the whole
 * clinic (employeeId null) or one employee. Dates are clinic-local YYYY-MM-DD, both ends included.
 */
export type ScheduleException = { id?: string; employeeId: string | null; dateFrom: string; dateTo: string; opensAt: number | null; closesAt: number | null; note?: string | null };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Checks an exception sent by the settings screen. */
export function normalizeException(input: Partial<ScheduleException>): ScheduleException {
  const dateFrom = String(input.dateFrom ?? '');
  const dateTo = String(input.dateTo || dateFrom);
  if (!DATE.test(dateFrom) || !DATE.test(dateTo) || Number.isNaN(Date.parse(dateFrom)) || Number.isNaN(Date.parse(dateTo))) throw new Error('Укажите даты');
  if (dateTo < dateFrom) throw new Error('Дата окончания раньше начала');
  if ((Date.parse(dateTo) - Date.parse(dateFrom)) / 86400000 > 366) throw new Error('Не больше года за раз');
  const closed = input.opensAt === null || input.opensAt === undefined;
  if (closed) return { employeeId: input.employeeId ?? null, dateFrom, dateTo, opensAt: null, closesAt: null, note: input.note?.trim() || null };
  const opensAt = Number(input.opensAt);
  const closesAt = Number(input.closesAt);
  if (!(Number.isInteger(opensAt) && Number.isInteger(closesAt) && opensAt >= 0 && closesAt <= 24 * 60 && opensAt < closesAt)) throw new Error('Время окончания должно быть позже начала');
  return { employeeId: input.employeeId ?? null, dateFrom, dateTo, opensAt, closesAt, note: input.note?.trim() || null };
}

/**
 * Hours for a date after exceptions: the week's hours, then the clinic's exceptions, then the
 * employee's own (a vacation beats the clinic's day; different hours replace the day, breaks drop).
 */
export function effectiveHours(week: WeekHours, date: string, exceptions: ScheduleException[] = [], employeeId?: string | null): DayHours {
  let day = hoursOn(week, date);
  const hits = exceptions.filter((row) => row.dateFrom <= date && date <= row.dateTo && (row.employeeId === null || (!!employeeId && row.employeeId === employeeId)));
  hits.sort((a, b) => (a.employeeId === null ? 0 : 1) - (b.employeeId === null ? 0 : 1));
  for (const row of hits) day = row.opensAt === null || row.closesAt === null ? null : { opensAt: row.opensAt, closesAt: row.closesAt };
  return day;
}

/** The exception that shaped a date, for a label in the calendar: employee's own first, then the clinic's. */
export function exceptionOn(date: string, exceptions: ScheduleException[] = [], employeeId?: string | null) {
  const hits = exceptions.filter((row) => row.dateFrom <= date && date <= row.dateTo);
  return hits.find((row) => employeeId && row.employeeId === employeeId) ?? hits.find((row) => row.employeeId === null) ?? null;
}

export type ScheduleRow = { dayOfWeek: number; startsAt: string; endsAt: string; breakStart?: string | null; breakEnd?: string | null };

const minutesOf = (text: string) => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
  return match ? Number(match[1]) * 60 + Number(match[2]) : NaN;
};

/**
 * An employee's week from their schedule rows (day 1 = Monday … 7 = Sunday, 0 also read as Sunday).
 * No rows means the employee follows the clinic's hours: null.
 */
export function employeeWeek(rows: ScheduleRow[]): WeekHours | null {
  if (!rows.length) return null;
  const week: WeekHours = Array.from({ length: 7 }, () => null);
  for (const row of rows) {
    const index = row.dayOfWeek === 0 ? 6 : row.dayOfWeek - 1;
    const opensAt = minutesOf(row.startsAt);
    const closesAt = row.endsAt === '24:00' ? 24 * 60 : minutesOf(row.endsAt);
    if (index < 0 || index > 6 || !(opensAt < closesAt)) continue;
    const breakFrom = row.breakStart ? minutesOf(row.breakStart) : NaN;
    const breakTo = row.breakEnd ? minutesOf(row.breakEnd) : NaN;
    week[index] = opensAt < breakFrom && breakFrom < breakTo && breakTo < closesAt ? { opensAt, closesAt, breakFrom, breakTo } : { opensAt, closesAt };
  }
  return week;
}

/** Schedule rows for a week, one per working day. */
export function scheduleRows(week: WeekHours): ScheduleRow[] {
  return week.flatMap((day, index) => (day ? [{
    dayOfWeek: index + 1,
    startsAt: hhmm(day.opensAt),
    endsAt: day.closesAt === 24 * 60 ? '24:00' : hhmm(day.closesAt),
    breakStart: day.breakFrom !== undefined ? hhmm(day.breakFrom) : null,
    breakEnd: day.breakTo !== undefined ? hhmm(day.breakTo) : null,
  }] : []));
}

/**
 * The span a calendar shows: the opening hours of the visible days, widened to every visit so nothing
 * booked outside hours is ever hidden. Days that are all closed with no visits fall back to 08–20.
 */
export function visibleHours(days: DayHours[], visitMinutes: { start: number; end: number }[] = []) {
  const open = days.filter((day): day is NonNullable<DayHours> => !!day);
  let opensAt = open.length ? Math.min(...open.map((day) => day.opensAt)) : Infinity;
  let closesAt = open.length ? Math.max(...open.map((day) => day.closesAt)) : -Infinity;
  for (const visit of visitMinutes) {
    opensAt = Math.min(opensAt, visit.start);
    closesAt = Math.max(closesAt, visit.end);
  }
  if (!Number.isFinite(opensAt) || !Number.isFinite(closesAt)) return { ...DEFAULT_HOURS };
  return { opensAt: Math.floor(opensAt / 60) * 60, closesAt: Math.min(24 * 60, Math.ceil(closesAt / 60) * 60) };
}

/** Minutes the clinic's wall clock is ahead of UTC on that date; Moscow when the zone is unknown. */
export function tzOffsetMinutes(timeZone: string, at: Date) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }).formatToParts(at);
    const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
    const wall = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
    return Math.round((wall - Math.floor(at.getTime() / 60000) * 60000) / 60000);
  } catch {
    return 180;
  }
}

/** The clinic-local calendar date (YYYY-MM-DD) of a stored instant. */
export function wallDate(iso: string, offsetMinutes: number) {
  return new Date(Date.parse(iso) + offsetMinutes * 60000).toISOString().slice(0, 10);
}
