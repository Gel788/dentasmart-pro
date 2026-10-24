import { kopecks, type PatientSegment } from '@dentasmart/shared';

export type RegistryPatient = {
  id: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  birthDate: string | null;
  gender: 'MALE' | 'FEMALE' | null;
  phone: string | null;
  email: string | null;
  clientType: string | null;
  allergies: string[];
  anticoagulant: boolean;
  pregnant: boolean;
  anxiety: string;
  tags: string[];
  notes?: string | null;
  lastVisit: string | null;
  nextVisit: string | null;
  debt: string;
  deposit: string;
  segments: PatientSegment[];
};

export type RegistrySort = 'name' | 'lastVisit' | 'nextVisit' | 'debt';

export type RegistryPage = {
  items: RegistryPatient[];
  total: number;
  page: number;
  pageSize: number;
  segment: PatientSegment | 'all';
  sort: RegistrySort;
  segments: Record<PatientSegment | 'all', number>;
};

export function fullName(row: Pick<RegistryPatient, 'lastName' | 'firstName' | 'middleName'>) {
  return [row.lastName, row.firstName === '—' ? '' : row.firstName, row.middleName ?? ''].filter(Boolean).join(' ');
}

export function ageOf(birthDate: string | null, now = new Date()) {
  if (!birthDate) return null;
  const born = new Date(birthDate);
  if (Number.isNaN(born.getTime())) return null;
  let age = now.getFullYear() - born.getUTCFullYear();
  const before = now.getMonth() < born.getUTCMonth() || (now.getMonth() === born.getUTCMonth() && now.getDate() < born.getUTCDate());
  if (before) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

export function years(n: number) {
  const last = n % 10;
  const tens = n % 100;
  if (last === 1 && tens !== 11) return `${n} год`;
  if (last >= 2 && last <= 4 && (tens < 12 || tens > 14)) return `${n} года`;
  return `${n} лет`;
}

/** +7 916 123-45-67 for Russian numbers, the raw value otherwise. */
export function phoneLabel(phone: string | null) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  const ten = digits.length === 11 && /^[78]/.test(digits) ? digits.slice(1) : digits.length === 10 ? digits : null;
  if (!ten) return phone;
  return `+7 ${ten.slice(0, 3)} ${ten.slice(3, 6)}-${ten.slice(6, 8)}-${ten.slice(8)}`;
}

const day = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
const soon = new Intl.DateTimeFormat('ru-RU', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
const time = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' });

export function dateLabel(iso: string | null) {
  return iso ? day.format(new Date(iso)).replace(' г.', '') : null;
}

export function visitLabel(iso: string | null) {
  if (!iso) return null;
  const at = new Date(iso);
  return `${soon.format(at)} · ${time.format(at)}`;
}

/** Whole days from today to the date; negative is in the past. */
export function daysFrom(iso: string, now = new Date()) {
  const a = new Date(iso);
  const start = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((Date.UTC(a.getFullYear(), a.getMonth(), a.getDate()) - start) / 86400000);
}

export type Alert = { id: string; label: string; strong: boolean };

/** What a doctor must see before touching the patient, strongest first. */
export function alertsOf(row: RegistryPatient): Alert[] {
  return [
    ...row.allergies.map((item) => ({ id: `a-${item}`, label: `Аллергия: ${item}`, strong: true })),
    ...(row.anticoagulant ? [{ id: 'anticoagulant', label: 'Антикоагулянты', strong: true }] : []),
    ...(row.pregnant ? [{ id: 'pregnant', label: 'Беременность', strong: true }] : []),
    ...(row.anxiety === 'HIGH' ? [{ id: 'anxiety', label: 'Сильный страх', strong: false }] : []),
  ];
}

export function hasDebt(row: RegistryPatient) {
  return kopecks(row.debt) > 0;
}

export function hasDeposit(row: RegistryPatient) {
  return kopecks(row.deposit) > 0;
}
