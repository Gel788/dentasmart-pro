import { describe, expect, it } from 'vitest';
import { canMoveVisit, isVisitClosed, visitMoveError } from './visit';

describe('переходы статусов визита', () => {
  it('обычный путь приёма', () => {
    expect(canMoveVisit('SCHEDULED', 'CONFIRMED')).toBe(true);
    expect(canMoveVisit('CONFIRMED', 'WAITING')).toBe(true);
    expect(canMoveVisit('WAITING', 'IN_PROGRESS')).toBe(true);
    expect(canMoveVisit('IN_PROGRESS', 'COMPLETED')).toBe(true);
  });

  it('нельзя провести, не начав, и нельзя переиграть закрытый визит', () => {
    expect(canMoveVisit('SCHEDULED', 'COMPLETED')).toBe(false);
    expect(canMoveVisit('COMPLETED', 'CANCELLED')).toBe(false);
    expect(canMoveVisit('CANCELLED', 'CONFIRMED')).toBe(false);
    expect(canMoveVisit('NO_SHOW', 'IN_PROGRESS')).toBe(false);
  });

  it('пришедшего пациента нельзя отметить неявкой задним числом, начатый приём не отменяют', () => {
    expect(canMoveVisit('IN_PROGRESS', 'NO_SHOW')).toBe(false);
    expect(canMoveVisit('IN_PROGRESS', 'CANCELLED')).toBe(false);
  });

  it('тот же статус — не ошибка', () => {
    expect(canMoveVisit('CONFIRMED', 'CONFIRMED')).toBe(true);
  });

  it('понятная причина отказа и закрытые статусы', () => {
    expect(visitMoveError('COMPLETED', 'CANCELLED')).toBe('Визит уже проведён. Изменить его статус нельзя');
    expect(isVisitClosed('NO_SHOW')).toBe(true);
    expect(isVisitClosed('CONFIRMED')).toBe(false);
  });
});
