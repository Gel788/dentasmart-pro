import type { MedicalChange, MedicalFields } from '@dentasmart/shared';

export type Medical = {
  version: number;
  fields: MedicalFields;
  confirmedAt: string | null;
  confirmedBy: string | null;
  reviewDue: boolean;
};

export type Protocol = { complaints: string; objective: string; diagnosis: string; treatment: string; recommendations: string };

export type FeedItem = {
  id: string;
  at: string;
  kind: 'visit' | 'payment' | 'invoice' | 'image' | 'message' | 'chart' | 'consent' | 'plan' | 'medical' | string;
  title: string;
  detail: string;
  status?: string;
  protocol?: Protocol | null;
  changes?: MedicalChange[];
};

export type NextVisit = { id: string; startsAt: string; status: string; service: string; doctor: string | null; cabinet: string | null };

export type CardPatient = {
  id: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  birthDate: string | null;
  phone: string | null;
  email: string | null;
  gender: 'MALE' | 'FEMALE' | null;
  tags: string[];
  source: string | null;
  notes: string | null;
  clientType: string | null;
};

export type CardAlert = { tone: 'danger' | 'warning' | 'info'; text: string };

export const FEED_FILTERS: { id: string; label: string; kinds: string[] }[] = [
  { id: 'all', label: 'Всё', kinds: [] },
  { id: 'visit', label: 'Приёмы', kinds: ['visit'] },
  { id: 'medical', label: 'Медкарта', kinds: ['medical', 'chart', 'consent'] },
  { id: 'image', label: 'Снимки', kinds: ['image'] },
  { id: 'money', label: 'Деньги', kinds: ['payment', 'invoice'] },
  { id: 'plan', label: 'Планы', kinds: ['plan'] },
];

const longDate = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
const shortDate = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
const dayTime = new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
const clock = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' });

export const fmt = {
  long: (iso: string) => longDate.format(new Date(iso)).replace(' г.', ''),
  short: (iso: string) => shortDate.format(new Date(iso)).replace(' г.', ''),
  day: (iso: string) => dayTime.format(new Date(iso)),
  time: (iso: string) => clock.format(new Date(iso)),
};

/** "через 3 дн.", "сегодня", "2 мес. назад". */
export function relative(iso: string, now = new Date()) {
  const a = new Date(iso);
  const days = Math.round((Date.UTC(a.getFullYear(), a.getMonth(), a.getDate()) - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
  if (days === 0) return 'сегодня';
  if (days === 1) return 'завтра';
  if (days === -1) return 'вчера';
  if (days > 1) return `через ${days} дн.`;
  const ago = -days;
  if (ago < 31) return `${ago} дн. назад`;
  if (ago < 365) return `${Math.round(ago / 30)} мес. назад`;
  return `${Math.floor(ago / 365)} г. назад`;
}

export function valueText(value: unknown) {
  if (value === null || value === undefined || value === '') return '—';
  if (Array.isArray(value)) return value.length ? value.join(', ') : '—';
  if (value === true) return 'да';
  if (value === false) return 'нет';
  if (value === 'NONE') return 'нет';
  if (value === 'MILD') return 'тревожность';
  if (value === 'HIGH') return 'выраженный страх';
  return String(value);
}
