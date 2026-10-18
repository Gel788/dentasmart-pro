export type Sheet = { headers: string[]; rows: string[][] };

export type SourceKind = 'SQNS' | 'IDENT' | 'ADMINDENTA' | 'GENERIC';

export type PatientField =
  | 'lastName'
  | 'firstName'
  | 'middleName'
  | 'phone'
  | 'cardNumber'
  | 'birthDate'
  | 'gender'
  | 'email'
  | 'lastVisit'
  | 'visits'
  | 'balance'
  | 'comment'
  | 'sms';

export type VisitField = 'date' | 'time' | 'patient' | 'phone' | 'doctor' | 'service' | 'status';

export type PatientDraft = {
  lastName: string;
  firstName: string;
  middleName: string;
  phone: string;
  cardNumber: string;
  birthDate: string;
  gender: string;
  email: string;
  lastVisit: string;
  visits: string;
  balance: string;
  comment: string;
  sms: string;
};

export type VisitDraft = {
  date: string;
  time: string;
  patient: string;
  phone: string;
  doctor: string;
  service: string;
  status: string;
};

export type Issue = { level: 'skip' | 'warn'; reason: string; row: number; name: string };

const PATIENT_SYNONYMS: Record<PatientField, string[]> = {
  lastName: ['фамилия', 'lastname', 'surname'],
  firstName: ['имя', 'firstname'],
  middleName: ['отчество', 'middlename'],
  phone: ['телефон', 'phone', 'мобильный', 'сотовый'],
  cardNumber: ['номер медкарты', 'медкарта', 'номер карты', 'карта'],
  birthDate: ['день рождения', 'дата рождения', 'датарождения', 'birthdate', 'др'],
  gender: ['пол', 'gender'],
  email: ['e-mail', 'email', 'почта', 'электронная почта'],
  lastVisit: ['дата последнего визита', 'последний визит', 'последний приём', 'последний прием'],
  visits: ['визитов', 'количество визитов', 'число визитов'],
  balance: ['баланс'],
  comment: ['комментарий', 'примечание'],
  sms: ['разрешить sms', 'sms', 'рассылка'],
};

const VISIT_SYNONYMS: Record<VisitField, string[]> = {
  date: ['дата', 'дата приема', 'дата приёма', 'дата записи', 'дата визита'],
  time: ['время', 'время приема', 'время приёма'],
  patient: ['пациент', 'фио', 'фио пациента'],
  phone: ['телефон', 'phone'],
  doctor: ['врач', 'доктор', 'специалист'],
  service: ['услуга', 'прием', 'приём', 'услуга записи'],
  status: ['статус', 'состояние'],
};

export const PATIENT_FIELDS: { field: PatientField; label: string }[] = [
  { field: 'lastName', label: 'Фамилия' },
  { field: 'firstName', label: 'Имя' },
  { field: 'middleName', label: 'Отчество' },
  { field: 'phone', label: 'Телефон' },
  { field: 'cardNumber', label: 'Медкарта' },
  { field: 'birthDate', label: 'Дата рождения' },
  { field: 'gender', label: 'Пол' },
  { field: 'email', label: 'Почта' },
  { field: 'lastVisit', label: 'Последний визит' },
  { field: 'visits', label: 'Визитов' },
  { field: 'balance', label: 'Баланс' },
  { field: 'comment', label: 'Комментарий' },
  { field: 'sms', label: 'SMS' },
];

export const VISIT_FIELDS: { field: VisitField; label: string }[] = [
  { field: 'date', label: 'Дата' },
  { field: 'time', label: 'Время' },
  { field: 'patient', label: 'Пациент' },
  { field: 'phone', label: 'Телефон' },
  { field: 'doctor', label: 'Врач' },
  { field: 'service', label: 'Услуга' },
  { field: 'status', label: 'Статус' },
];

export function detectSource(headers: string[]): SourceKind {
  const names = headers.map(norm);
  const has = (needle: string) => names.some((name) => name === needle || name.includes(needle));
  if (has('номер медкарты') || has('сумма продаж') || has('разрешить sms')) return 'SQNS';
  if (has('датарождения') || has('идентификатор пациента') || names.includes('фио') && has('телефон')) {
    if (has('датарождения') || has('идентификатор')) return 'IDENT';
  }
  if ((has('фио пациента') || has('пациент')) && has('врач') && (has('дата приема') || has('дата приёма') || has('дата записи'))) return 'ADMINDENTA';
  if (names.some((name) => name.replace(/\s/g, '') === 'датарождения')) return 'IDENT';
  return 'GENERIC';
}

export function sheetKind(headers: string[]): 'patients' | 'visits' | 'skip' {
  const names = headers.map(norm).filter(Boolean);
  if (!names.length) return 'skip';
  const visit = names.some((name) => name === 'время' || name.startsWith('время '))
    || (names.some((name) => name === 'врач' || name === 'доктор') && names.some((name) => name === 'дата' || name.startsWith('дата приема') || name.startsWith('дата приёма') || name === 'дата записи'));
  if (visit) return 'visits';
  if (names.some((name) => name === 'фамилия' || name === 'имя' || name === 'фио' || name === 'фио пациента' || name === 'пациент')) return 'patients';
  return 'skip';
}

export function guessPatientMap(headers: string[]): Record<string, PatientField | ''> {
  return guess(headers, PATIENT_SYNONYMS);
}

export function guessVisitMap(headers: string[]): Record<string, VisitField | ''> {
  return guess(headers, VISIT_SYNONYMS);
}

function guess<T extends string>(headers: string[], book: Record<T, string[]>): Record<string, T | ''> {
  const used = new Set<T>();
  const map: Record<string, T | ''> = {};
  for (const header of headers) {
    const name = norm(header);
    let found: T | '' = '';
    for (const [field, synonyms] of Object.entries(book) as [T, string[]][]) {
      if (used.has(field)) continue;
      if (synonyms.some((item) => name === item || (item.length > 3 && name.includes(item)))) {
        found = field;
        used.add(field);
        break;
      }
    }
    map[header] = found;
  }
  return map;
}

export function readPatients(sheet: Sheet, map: Record<string, string>): { rows: PatientDraft[]; issues: Issue[] } {
  const rows: PatientDraft[] = [];
  const issues: Issue[] = [];
  const seenPhones = new Map<string, string>();
  const seenNames = new Map<string, number>();
  sheet.rows.forEach((cells, index) => {
    const rowNumber = index + 2;
    const draft = emptyPatient();
    sheet.headers.forEach((header, cell) => {
      const field = map[header] as PatientField | undefined;
      if (field && field in draft) draft[field] = String(cells[cell] ?? '').trim();
    });
    const name = `${draft.lastName} ${draft.firstName}`.trim();
    if (!draft.lastName && !draft.firstName) {
      issues.push({ level: 'skip', reason: 'Пустая строка', row: rowNumber, name: '' });
      return;
    }
    if (norm(draft.lastName) === 'физическое лицо' && !draft.firstName) {
      issues.push({ level: 'skip', reason: 'Служебная строка', row: rowNumber, name: draft.lastName });
      return;
    }
    const digits = digitsOf(draft.phone);
    if (draft.phone && digits.length < 10) {
      issues.push({ level: 'warn', reason: 'Телефон не похож на номер', row: rowNumber, name });
      draft.phone = '';
    } else if (digits.length >= 10) {
      const key = digits.slice(-10);
      const prev = seenPhones.get(key);
      if (prev) issues.push({ level: 'warn', reason: `Дубль телефона (${prev})`, row: rowNumber, name });
      else seenPhones.set(key, name);
      draft.phone = `+${digits}`;
    }
    const nameKey = norm(`${draft.lastName} ${draft.firstName} ${draft.middleName}`);
    if (!draft.phone && nameKey) {
      const prev = seenNames.get(nameKey);
      if (prev) issues.push({ level: 'warn', reason: 'Дубль ФИО', row: rowNumber, name });
      else seenNames.set(nameKey, rowNumber);
    }
    const birth = parseDate(draft.birthDate);
    if (draft.birthDate && !birth) issues.push({ level: 'warn', reason: 'Дата рождения не читается', row: rowNumber, name });
    draft.birthDate = birth ?? '';
    const last = parseDate(draft.lastVisit);
    if (draft.lastVisit && !last) issues.push({ level: 'warn', reason: 'Дата визита не читается', row: rowNumber, name });
    draft.lastVisit = last ?? '';
    const visits = Number(String(draft.visits).replace(/\s/g, '').replace(',', '.'));
    const emptyCard = !draft.phone && !draft.lastVisit && !(visits > 0) && !draft.email;
    if (emptyCard) issues.push({ level: 'warn', reason: 'Нет телефона и визитов', row: rowNumber, name });
    draft.gender = genderOf(draft.gender);
    rows.push(draft);
  });
  return { rows, issues };
}

export function readVisits(sheet: Sheet, map: Record<string, string>): { rows: VisitDraft[]; issues: Issue[] } {
  const rows: VisitDraft[] = [];
  const issues: Issue[] = [];
  sheet.rows.forEach((cells, index) => {
    const rowNumber = index + 2;
    const draft = emptyVisit();
    sheet.headers.forEach((header, cell) => {
      const field = map[header] as VisitField | undefined;
      if (field && field in draft) draft[field] = String(cells[cell] ?? '').trim();
    });
    const date = parseDate(draft.date);
    if (!date) {
      issues.push({ level: 'skip', reason: 'Нет даты записи', row: rowNumber, name: draft.patient });
      return;
    }
    if (!draft.patient && !draft.phone) {
      issues.push({ level: 'skip', reason: 'Нет пациента у записи', row: rowNumber, name: '' });
      return;
    }
    draft.date = date;
    const time = parseTime(draft.time);
    if (draft.time && !time) issues.push({ level: 'warn', reason: 'Время не читается, ставим 09:00', row: rowNumber, name: draft.patient });
    draft.time = time || '09:00';
    draft.status = statusOf(draft.status);
    rows.push(draft);
  });
  return { rows, issues };
}

export function parseDate(value: string) {
  const text = value.trim();
  if (!text) return '';
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return validDate(+iso[1], +iso[2], +iso[3]);
  const local = text.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})/);
  if (local) {
    const year = local[3].length === 2 ? 2000 + Number(local[3]) : Number(local[3]);
    return validDate(year, +local[2], +local[1]);
  }
  if (/^\d{4,5}(\.\d+)?$/.test(text)) {
    const serial = Math.floor(Number(text));
    if (serial > 20000 && serial < 80000) {
      const date = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
      return validDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
    }
  }
  return '';
}

export function parseTime(value: string) {
  const text = value.trim();
  const match = text.match(/^(\d{1,2})[:.](\d{2})/);
  if (!match) return '';
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return '';
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function validDate(year: number, month: number, day: number) {
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return '';
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return '';
  return date.toISOString().slice(0, 10);
}

function genderOf(value: string) {
  const text = norm(value);
  if (text.startsWith('жен') || text === 'ж' || text === 'f' || text === 'female') return 'FEMALE';
  if (text.startsWith('муж') || text === 'м' || text === 'm' || text === 'male') return 'MALE';
  return '';
}

function statusOf(value: string) {
  const text = norm(value);
  if (/неяв|no-show|noshow/.test(text)) return 'NO_SHOW';
  if (/отмен|cancel/.test(text)) return 'CANCELLED';
  if (/заверш|выполн|приш[её]л|completed/.test(text)) return 'COMPLETED';
  if (/ожида|arrived|пришел/.test(text)) return 'ARRIVED';
  return 'CONFIRMED';
}

function digitsOf(value: string) {
  let digits = value.replace(/\D/g, '');
  if (digits.startsWith('8')) digits = `7${digits.slice(1)}`;
  if (digits.length === 10) digits = `7${digits}`;
  return digits;
}

function norm(value: string) {
  return value.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
}

function emptyPatient(): PatientDraft {
  return { lastName: '', firstName: '', middleName: '', phone: '', cardNumber: '', birthDate: '', gender: '', email: '', lastVisit: '', visits: '', balance: '', comment: '', sms: '' };
}

function emptyVisit(): VisitDraft {
  return { date: '', time: '', patient: '', phone: '', doctor: '', service: '', status: '' };
}

export const SOURCE_LABEL: Record<SourceKind, string> = {
  SQNS: 'SQNS',
  IDENT: 'IDENT',
  ADMINDENTA: 'АдминДента',
  GENERIC: 'Своя таблица',
};
