import { describe, expect, it } from 'vitest';
import { DORMANT_DAYS, phoneMatches, patientSegments, searchTerms } from './patients';

describe('searchTerms', () => {
  it('делит ФИО на слова и вытаскивает цифры телефона', () => {
    expect(searchTerms('  Смирнова  Анна ')).toEqual({ words: ['смирнова', 'анна'], digits: '' });
    expect(searchTerms('900 123')).toEqual({ words: [], digits: '900123' });
    expect(searchTerms('+7 (900) 12')).toEqual({ words: [], digits: '790012' });
    expect(searchTerms('Ёлкина 9')).toEqual({ words: ['елкина'], digits: '' });
  });
});

describe('patientSegments', () => {
  const now = new Date('2026-10-20T10:00:00Z');
  const days = (n: number) => new Date(now.getTime() - n * 86400000).toISOString();

  it('долг, запись и телефон', () => {
    expect(patientSegments({ phone: '+79001234567', lastVisit: days(10), nextVisit: days(-2), debtKopecks: 150000, clientType: null }, now))
      .toEqual(['phone', 'debt', 'upcoming']);
  });

  it('давно не были — нет визита за полгода и нет записи вперёд', () => {
    expect(patientSegments({ phone: null, lastVisit: days(DORMANT_DAYS + 1), nextVisit: null, debtKopecks: 0, clientType: null }, now)).toEqual(['dormant']);
    expect(patientSegments({ phone: null, lastVisit: null, nextVisit: null, debtKopecks: 0, clientType: null }, now)).toEqual(['dormant']);
    expect(patientSegments({ phone: null, lastVisit: days(DORMANT_DAYS + 1), nextVisit: days(-1), debtKopecks: 0, clientType: null }, now)).toEqual(['upcoming']);
  });

  it('отказавшиеся из SQNS отдельно', () => {
    expect(patientSegments({ phone: null, lastVisit: days(5), nextVisit: null, debtKopecks: 0, clientType: 'отказавшиеся' }, now)).toEqual(['declined']);
  });

  it('matches phone digits typed with the trunk prefix', () => {
    expect(phoneMatches('+7 900 123-45-67', '8900123')).toBe(true);
    expect(phoneMatches('+7 900 123-45-67', '7900123')).toBe(true);
    expect(phoneMatches('+7 900 123-45-67', '4567')).toBe(true);
    expect(phoneMatches('+7 900 123-45-67', '89001234567')).toBe(true);
    expect(phoneMatches('+7 900 123-45-67', '8901')).toBe(false);
    expect(phoneMatches(null, '900')).toBe(false);
  });
});
