import { describe, expect, it } from 'vitest';
import { dayLoad, layoutLanes, loadLevel } from './schedule';

const at = (h: number, m = 0) => new Date(Date.UTC(2026, 9, 20, h, m)).toISOString();

describe('layoutLanes', () => {
  it('непересекающиеся визиты занимают всю ширину', () => {
    const lanes = layoutLanes([{ id: 'a', startsAt: at(9), endsAt: at(10) }, { id: 'b', startsAt: at(10), endsAt: at(11) }]);
    expect(lanes.get('a')).toEqual({ lane: 0, lanes: 1 });
    expect(lanes.get('b')).toEqual({ lane: 0, lanes: 1 });
  });

  it('пересекающиеся делят ширину, а соседний кластер не сужается', () => {
    const lanes = layoutLanes([
      { id: 'a', startsAt: at(9), endsAt: at(10, 30) },
      { id: 'b', startsAt: at(9, 30), endsAt: at(10) },
      { id: 'c', startsAt: at(10), endsAt: at(11) },
      { id: 'd', startsAt: at(12), endsAt: at(13) },
    ]);
    expect(lanes.get('a')).toEqual({ lane: 0, lanes: 2 });
    expect(lanes.get('b')).toEqual({ lane: 1, lanes: 2 });
    expect(lanes.get('c')).toEqual({ lane: 1, lanes: 2 });
    expect(lanes.get('d')).toEqual({ lane: 0, lanes: 1 });
  });
});

describe('dayLoad', () => {
  it('считает занятые минуты по креслам в рабочем окне, без отменённых и неявок', () => {
    const load = dayLoad(
      [
        { id: 'a', startsAt: at(9), endsAt: at(10), status: 'CONFIRMED' },
        { id: 'b', startsAt: at(7), endsAt: at(8, 30), status: 'SCHEDULED' },
        { id: 'c', startsAt: at(11), endsAt: at(12), status: 'CANCELLED' },
        { id: 'd', startsAt: at(11), endsAt: at(12), status: 'NO_SHOW' },
      ],
      { chairs: 2, opensAt: 8 * 60, closesAt: 20 * 60, tzOffsetMinutes: 0 },
    );
    expect(load).toEqual({ bookedMinutes: 90, capacityMinutes: 1440, ratio: 90 / 1440, visits: 2 });
  });

  it('без кресел загрузка нулевая, а не деление на ноль', () => {
    expect(dayLoad([], { chairs: 0, opensAt: 480, closesAt: 1200, tzOffsetMinutes: 0 }).ratio).toBe(0);
  });
});

describe('loadLevel', () => {
  it('пять ступеней заполненности', () => {
    expect([0, 0.1, 0.4, 0.7, 0.95].map(loadLevel)).toEqual([0, 1, 2, 3, 4]);
  });
});

import { effectiveHours, employeeWeek, exceptionOn, hoursOn, normalizeException, normalizeWeekHours, scheduleRows, parseWorkHours, tzOffsetMinutes, visibleHours, wallDate, weekHoursOf, weekHoursText } from './schedule';

describe('часы работы и часовой пояс', () => {
  it('читает часы в разных записях и падает на 8–20', () => {
    expect(parseWorkHours('Пн–Сб 09:00–21:00')).toEqual({ opensAt: 540, closesAt: 1260 });
    expect(parseWorkHours('9:30-18')).toEqual({ opensAt: 570, closesAt: 1080 });
    expect(parseWorkHours('круглосуточно')).toEqual({ opensAt: 480, closesAt: 1200 });
    expect(parseWorkHours(null)).toEqual({ opensAt: 480, closesAt: 1200 });
  });

  it('смещение Москвы +3 ч и дата визита по местному времени', () => {
    expect(tzOffsetMinutes('Europe/Moscow', new Date('2026-10-20T12:00:00Z'))).toBe(180);
    expect(wallDate('2026-10-19T22:30:00.000Z', 180)).toBe('2026-10-20');
    expect(tzOffsetMinutes('Not/AZone', new Date())).toBe(180);
  });
});

describe('weekly hours', () => {
  const evening = { opensAt: 15 * 60, closesAt: 22 * 60 };
  const morning = { opensAt: 8 * 60, closesAt: 15 * 60 };
  const week = [evening, evening, evening, evening, evening, null, morning];

  it('keeps a valid week and refuses a broken day', () => {
    expect(normalizeWeekHours(week)).toEqual(week);
    expect(() => normalizeWeekHours([evening])).toThrow(/семь дней/);
    expect(() => normalizeWeekHours([{ opensAt: 900, closesAt: 600 }, null, null, null, null, null, null])).toThrow(/Пн/);
  });

  it('falls back to the old one-line setting for every day', () => {
    expect(weekHoursOf(null, '09:00–20:00')).toEqual(Array.from({ length: 7 }, () => ({ opensAt: 540, closesAt: 1200 })));
    expect(weekHoursOf(week, '09:00–20:00')).toEqual(week);
  });

  it('finds the hours of a date by weekday', () => {
    expect(hoursOn(week, '2026-10-19')).toEqual(evening);
    expect(hoursOn(week, '2026-10-24')).toBeNull();
    expect(hoursOn(week, '2026-10-25')).toEqual(morning);
  });

  it('reads as one line', () => {
    expect(weekHoursText(week)).toBe('Пн–Пт 15:00–22:00, Вс 08:00–15:00');
    expect(weekHoursText([null, null, null, null, null, null, null])).toBe('Выходные все дни');
  });

  it('shows working hours but never hides a visit outside them', () => {
    expect(visibleHours([evening])).toEqual(evening);
    expect(visibleHours([evening], [{ start: 13 * 60 + 30, end: 14 * 60 + 15 }])).toEqual({ opensAt: 13 * 60, closesAt: 22 * 60 });
    expect(visibleHours([null])).toEqual({ opensAt: 480, closesAt: 1200 });
    expect(visibleHours([evening, morning])).toEqual({ opensAt: 480, closesAt: 1320 });
  });
});

describe('employee week', () => {
  it('reads schedule rows Monday first and round-trips', () => {
    const rows = [{ dayOfWeek: 1, startsAt: '15:00', endsAt: '22:00' }, { dayOfWeek: 7, startsAt: '08:00', endsAt: '15:00' }];
    const week = employeeWeek(rows)!;
    expect(week[0]).toEqual({ opensAt: 900, closesAt: 1320 });
    expect(week[1]).toBeNull();
    expect(week[6]).toEqual({ opensAt: 480, closesAt: 900 });
    expect(scheduleRows(week)).toEqual(rows.map((row) => ({ ...row, breakStart: null, breakEnd: null })));
    expect(employeeWeek([{ dayOfWeek: 0, startsAt: '10:00', endsAt: '12:00' }])![6]).toEqual({ opensAt: 600, closesAt: 720 });
  });

  it('no rows means the clinic hours', () => {
    expect(employeeWeek([])).toBeNull();
  });
});

describe('breaks and exceptions', () => {
  const day = { opensAt: 540, closesAt: 1080 };
  const week = [day, day, day, day, day, null, null];

  it('keeps a break inside the day and refuses one outside', () => {
    const lunch = { ...day, breakFrom: 780, breakTo: 840 };
    expect(normalizeWeekHours([lunch, day, day, day, day, null, null])[0]).toEqual(lunch);
    expect(() => normalizeWeekHours([{ ...day, breakFrom: 500, breakTo: 600 }, day, day, day, day, null, null])).toThrow(/перерыв/);
    expect(weekHoursText([lunch, lunch, null, null, null, null, null])).toBe('Пн–Вт 09:00–18:00 (перерыв 13:00–14:00)');
    expect(employeeWeek([{ dayOfWeek: 1, startsAt: '09:00', endsAt: '18:00', breakStart: '13:00', breakEnd: '14:00' }])![0]).toEqual(lunch);
  });

  it('applies a clinic holiday, then the employee', () => {
    const holiday = normalizeException({ employeeId: null, dateFrom: '2026-11-04', dateTo: '2026-11-04', opensAt: null });
    const vacation = normalizeException({ employeeId: 'doc', dateFrom: '2026-11-02', dateTo: '2026-11-06' });
    const short = normalizeException({ employeeId: null, dateFrom: '2026-11-03', opensAt: 600, closesAt: 900 });
    const all = [holiday, vacation, short];
    expect(effectiveHours(week, '2026-11-04', all)).toBeNull();
    expect(effectiveHours(week, '2026-11-03', all)).toEqual({ opensAt: 600, closesAt: 900 });
    expect(effectiveHours(week, '2026-11-03', all, 'doc')).toBeNull();
    expect(effectiveHours(week, '2026-11-09', all, 'doc')).toEqual(day);
    expect(exceptionOn('2026-11-03', all, 'doc')).toBe(vacation);
    expect(() => normalizeException({ dateFrom: '2026-11-05', dateTo: '2026-11-01' })).toThrow(/раньше/);
  });
});
