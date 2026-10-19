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
