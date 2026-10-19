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

import { parseWorkHours, tzOffsetMinutes, wallDate } from './schedule';

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
