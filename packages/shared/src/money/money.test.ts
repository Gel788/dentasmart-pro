import { describe, expect, it } from 'vitest';
import { formatRub, fromKopecks, invoiceStatus, kopecks } from './money';

describe('kopecks', () => {
  it('переводит рубли в целые копейки без ошибок плавающей точки', () => {
    expect(kopecks('0.1')).toBe(10);
    expect(kopecks(0.1 + 0.2)).toBe(30);
    expect(kopecks('12 345,67')).toBe(1234567);
    expect(kopecks('-1500')).toBe(-150000);
    expect(kopecks(null)).toBe(0);
  });

  it('отклоняет не-числа', () => {
    expect(() => kopecks('abc')).toThrow('Сумма указана неверно');
  });

  it('обратный перевод в строку для Decimal', () => {
    expect(fromKopecks(1234567)).toBe('12345.67');
    expect(fromKopecks(-5)).toBe('-0.05');
    expect(fromKopecks(0)).toBe('0.00');
  });
});

describe('invoiceStatus', () => {
  it('скидка уменьшает сумму к оплате', () => {
    expect(invoiceStatus({ total: 100000, discount: 10000, paid: 90000 })).toBe('PAID');
    expect(invoiceStatus({ total: 100000, discount: 0, paid: 90000 })).toBe('PARTIAL');
  });

  it('без оплат счёт выставлен, отменённый остаётся отменённым', () => {
    expect(invoiceStatus({ total: 100000, discount: 0, paid: 0 })).toBe('ISSUED');
    expect(invoiceStatus({ total: 100000, discount: 0, paid: 0, current: 'CANCELLED' })).toBe('CANCELLED');
  });

  it('нулевой счёт считается оплаченным', () => {
    expect(invoiceStatus({ total: 0, discount: 0, paid: 0 })).toBe('PAID');
  });
});

describe('formatRub', () => {
  it('рубли с пробелами, копейки только когда есть', () => {
    expect(formatRub(1234500)).toBe('12 345 ₽');
    expect(formatRub(1234567)).toBe('12 345,67 ₽');
  });
});
