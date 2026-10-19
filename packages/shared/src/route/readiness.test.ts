import { describe, expect, it } from 'vitest';
import { readiness, routeOf } from './readiness';
import type { StageInput } from './types';

function stage(over: Partial<StageInput> = {}): StageInput {
  return {
    id: 's1',
    title: 'Имплантация',
    sortOrder: 1,
    healingDays: 0,
    teeth: [36],
    price: 58000,
    paid: 0,
    labWork: null,
    appointment: { id: 'a1', startsAt: '2026-10-22T07:00:00.000Z', status: 'SCHEDULED' },
    reservations: [],
    lab: null,
    ...over,
  };
}

describe('readiness', () => {
  it('без визита этап заблокирован', () => {
    expect(readiness(stage({ appointment: null })).visit).toEqual({ state: 'blocked', reason: 'Визит не назначен' });
  });

  it('неподтверждённый визит ждёт', () => {
    expect(readiness(stage()).visit.state).toBe('waiting');
  });

  it('подтверждённый и проведённый визит готов', () => {
    expect(readiness(stage({ appointment: { id: 'a1', startsAt: '2026-10-22T07:00:00.000Z', status: 'CONFIRMED' } })).visit.state).toBe('ready');
    expect(readiness(stage({ appointment: { id: 'a1', startsAt: '2026-10-22T07:00:00.000Z', status: 'COMPLETED' } })).visit.reason).toBe('Проведён');
  });

  it('материалы: нет резервов — не нужны', () => {
    expect(readiness(stage()).materials.state).toBe('none');
  });

  it('материалы: дефицит с датой поставки ждёт, без даты блокирует', () => {
    const inTransit = stage({ reservations: [{ itemName: 'Формирователь 4.5', quantity: 1, status: 'SHORT', expectedAt: '2026-10-20T00:00:00.000Z' }] });
    expect(readiness(inTransit).materials).toEqual({ state: 'waiting', reason: 'Формирователь 4.5: в пути до 20.10' });
    const missing = stage({ reservations: [{ itemName: 'Мембрана Bio-Gide', quantity: 1, status: 'SHORT', expectedAt: null }] });
    expect(readiness(missing).materials).toEqual({ state: 'blocked', reason: 'Мембрана Bio-Gide: нет на складе' });
  });

  it('материалы: всё в резерве готово, всё списано готово', () => {
    expect(readiness(stage({ reservations: [{ itemName: 'Имплант', quantity: 1, status: 'RESERVED', expectedAt: null }] })).materials.reason).toBe('В резерве');
    expect(readiness(stage({ reservations: [{ itemName: 'Имплант', quantity: 1, status: 'CONSUMED', expectedAt: null }] })).materials.reason).toBe('Списаны');
  });

  it('лаборатория: опаздывающий заказ блокирует визит', () => {
    const late = stage({ lab: { id: 'l1', status: 'IN_PROGRESS', dueAt: '2026-10-23T15:00:00.000Z' } });
    expect(readiness(late).lab).toEqual({ state: 'blocked', reason: 'Не успевает к визиту' });
  });

  it('лаборатория: готовый заказ готов, ожидающий слепка ждёт', () => {
    expect(readiness(stage({ lab: { id: 'l1', status: 'READY', dueAt: null } })).lab.state).toBe('ready');
    expect(readiness(stage({ lab: { id: 'l1', status: 'WAITING_IMPRESSION', dueAt: null } })).lab).toEqual({ state: 'waiting', reason: 'Ждёт слепок' });
  });

  it('оплата: остаток к визиту', () => {
    expect(readiness(stage({ paid: 8000 })).payment).toEqual({ state: 'waiting', reason: '50 000 ₽ к визиту' });
    expect(readiness(stage({ paid: 58000 })).payment.state).toBe('ready');
    expect(readiness(stage({ price: 0 })).payment.state).toBe('none');
  });
});

describe('routeOf', () => {
  it('сортирует этапы, отмечает проведённые и текущий, считает деньги', () => {
    const route = routeOf([
      stage({ id: 's2', sortOrder: 2, price: 67200, paid: 0, appointment: null }),
      stage({ id: 's1', sortOrder: 1, price: 11000, paid: 11000, appointment: { id: 'a0', startsAt: '2026-10-14T07:00:00.000Z', status: 'COMPLETED' } }),
    ]);
    expect(route.stages.map((item) => [item.id, item.status])).toEqual([['s1', 'done'], ['s2', 'current']]);
    expect(route.currentIndex).toBe(1);
    expect(route.price).toBe(78200);
    expect(route.paid).toBe(11000);
  });

  it('когда всё проведено, текущего этапа нет', () => {
    const route = routeOf([stage({ appointment: { id: 'a0', startsAt: '2026-10-14T07:00:00.000Z', status: 'COMPLETED' } })]);
    expect(route.currentIndex).toBe(-1);
  });
});
