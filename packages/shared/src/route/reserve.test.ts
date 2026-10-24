import { describe, expect, it } from 'vitest';
import { reservationsFor } from './reserve';

const norms = [
  { serviceId: 'implant', itemId: 'fixture', quantity: 1 },
  { serviceId: 'implant', itemId: 'healing-cap', quantity: 1 },
  { serviceId: 'filling', itemId: 'composite', quantity: 0.5 },
];

describe('reservationsFor', () => {
  it('резервирует по нормам услуги', () => {
    const rows = reservationsFor([{ planItemId: 'p1', serviceId: 'implant' }], norms, new Map([['fixture', 5], ['healing-cap', 2]]));
    expect(rows).toEqual([
      { planItemId: 'p1', itemId: 'fixture', quantity: 1, status: 'RESERVED' },
      { planItemId: 'p1', itemId: 'healing-cap', quantity: 1, status: 'RESERVED' },
    ]);
  });

  it('отмечает дефицит и делит частичный остаток', () => {
    const rows = reservationsFor(
      [{ planItemId: 'p1', serviceId: 'filling' }, { planItemId: 'p2', serviceId: 'filling' }, { planItemId: 'p3', serviceId: 'filling' }],
      norms,
      new Map([['composite', 1.2]]),
    );
    expect(rows).toEqual([
      { planItemId: 'p1', itemId: 'composite', quantity: 0.5, status: 'RESERVED' },
      { planItemId: 'p2', itemId: 'composite', quantity: 0.5, status: 'RESERVED' },
      { planItemId: 'p3', itemId: 'composite', quantity: 0.2, status: 'RESERVED' },
      { planItemId: 'p3', itemId: 'composite', quantity: 0.3, status: 'SHORT' },
    ]);
  });

  it('пропускает строки без услуги и не меняет переданный остаток', () => {
    const available = new Map([['fixture', 0]]);
    const rows = reservationsFor([{ planItemId: 'p1', serviceId: null }, { planItemId: 'p2', serviceId: 'implant' }], norms, available);
    expect(rows.every((row) => row.status === 'SHORT')).toBe(true);
    expect(available.get('fixture')).toBe(0);
  });
});
