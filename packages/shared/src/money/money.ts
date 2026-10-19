// Money moves through the system as whole kopecks. Rubles exist only at the edges: input, Decimal columns, display.

export type InvoiceStatus = 'DRAFT' | 'ISSUED' | 'PARTIAL' | 'PAID' | 'CANCELLED';

/** Rubles (number, numeric string, Prisma Decimal) to whole kopecks. Accepts "12 345,67". */
export function kopecks(value: number | string | { toString(): string } | null | undefined): number {
  if (value === null || value === undefined || value === '') return 0;
  const text = String(value).replace(/[\s ]/g, '').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(text)) throw new Error('Сумма указана неверно');
  const negative = text.startsWith('-');
  const [whole, fraction = ''] = text.replace('-', '').split('.');
  const cents = Number(whole) * 100 + Number((fraction + '00').slice(0, 2)) + (Number(fraction[2] ?? 0) >= 5 ? 1 : 0);
  return negative ? -cents : cents;
}

/** Kopecks to the "12345.67" string a Decimal(12,2) column accepts. */
export function fromKopecks(value: number): string {
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(Math.round(value));
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

export function formatRub(value: number): string {
  const abs = Math.abs(Math.round(value));
  const rub = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const cents = abs % 100;
  return `${value < 0 ? '−' : ''}${rub}${cents ? `,${String(cents).padStart(2, '0')}` : ''} ₽`;
}

/** The only rule for an invoice's status: what is due is the total less the discount. */
export function invoiceStatus(input: { total: number; discount: number; paid: number; current?: InvoiceStatus }): InvoiceStatus {
  if (input.current === 'CANCELLED') return 'CANCELLED';
  const due = Math.max(0, input.total - input.discount);
  if (input.paid >= due) return 'PAID';
  if (input.paid > 0) return 'PARTIAL';
  return 'ISSUED';
}
