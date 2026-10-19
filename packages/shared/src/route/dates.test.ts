import { describe, expect, it } from 'vitest';
import { labDueAt } from './dates';

describe('labDueAt', () => {
  it('отступает два рабочих дня внутри недели', () => {
    expect(labDueAt(new Date('2026-10-21T06:30:00Z')).toISOString()).toBe('2026-10-19T06:30:00.000Z');
  });

  it('перешагивает выходные', () => {
    expect(labDueAt(new Date('2026-10-26T07:00:00Z')).toISOString()).toBe('2026-10-22T07:00:00.000Z');
  });

  it('принимает другое число рабочих дней', () => {
    expect(labDueAt(new Date('2026-10-23T07:00:00Z'), 1).toISOString()).toBe('2026-10-22T07:00:00.000Z');
  });
});
