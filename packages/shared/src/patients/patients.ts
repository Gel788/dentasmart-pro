/** A patient with no finished visit for this long and nothing booked ahead is someone to call back. */
export const DORMANT_DAYS = 180;

export type PatientSegment = 'phone' | 'debt' | 'upcoming' | 'dormant' | 'declined';

export const SEGMENTS: { id: PatientSegment | 'all'; label: string }[] = [
  { id: 'all', label: 'Все' },
  { id: 'phone', label: 'С телефоном' },
  { id: 'debt', label: 'С долгом' },
  { id: 'upcoming', label: 'Записаны' },
  { id: 'dormant', label: 'Давно не были' },
  { id: 'declined', label: 'Отказавшиеся' },
];

/** What the search box holds: name words (case- and ё-insensitive) or phone digits, never both read as one. */
export function searchTerms(raw: string) {
  const text = (raw ?? '').trim().toLowerCase().replace(/ё/g, 'е');
  const digits = text.replace(/\D/g, '');
  const words = text.split(/\s+/).map((word) => word.replace(/[^a-zа-я-]/g, '')).filter((word) => word.length > 0);
  if (words.length) return { words, digits: '' };
  return { words: [], digits };
}

/**
 * How typed phone digits match a stored number: anywhere in it, or, when the input starts with the trunk
 * prefix 8 or the country code 7, from the start of a +7 number ("8 900 123" finds +7 900 123-45-67).
 */
export function phoneNeedle(digits: string): { anywhere: string; start: string | null } | null {
  if (!digits) return null;
  if (digits.length >= 11) return { anywhere: digits.slice(-10), start: null };
  return { anywhere: digits, start: /^[78]\d{3,}$/.test(digits) ? `7${digits.slice(1)}` : null };
}

export function phoneMatches(phone: string | null | undefined, digits: string) {
  const needle = phoneNeedle(digits);
  if (!needle) return true;
  const stored = (phone ?? '').replace(/\D/g, '');
  return stored.includes(needle.anywhere) || (needle.start !== null && stored.startsWith(needle.start));
}

export function patientSegments(
  row: { phone: string | null; lastVisit: string | null; nextVisit: string | null; debtKopecks: number; clientType: string | null },
  now: Date = new Date(),
): PatientSegment[] {
  const out: PatientSegment[] = [];
  if (row.clientType?.trim().toLowerCase().startsWith('отказ')) return ['declined'];
  if ((row.phone ?? '').replace(/\D/g, '').length >= 10) out.push('phone');
  if (row.debtKopecks > 0) out.push('debt');
  if (row.nextVisit) out.push('upcoming');
  const cutoff = now.getTime() - DORMANT_DAYS * 86400000;
  if (!row.nextVisit && (!row.lastVisit || Date.parse(row.lastVisit) < cutoff)) out.push('dormant');
  return out;
}
