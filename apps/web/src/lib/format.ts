export function formatMoney(n: number | string) {
  return Number(n).toLocaleString('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 });
}

/** Dates read the same everywhere: 24.10.2026, and time on the 24-hour clock: 24.10.2026, 14:30. */
export function formatDate(d: string | Date) {
  return `${formatDateOnly(d)}, ${formatTime(d)}`;
}

export function formatDateOnly(d: string | Date) {
  return new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatTime(d: string | Date) {
  return new Date(d).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
}

/** A calendar day as ГГГГ-ММ-ДД (no time zone shift) written дд.мм.гггг. */
export function formatDay(day: string) {
  const [y, m, d] = day.slice(0, 10).split('-');
  return y && m && d ? `${d}.${m}.${y}` : day;
}

export function patientAge(birthDate: string | Date) {
  const b = new Date(birthDate);
  const today = new Date();
  let age = today.getFullYear() - b.getFullYear();
  const m = today.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < b.getDate())) age--;
  return age;
}

export const APPOINTMENT_STATUS: Record<string, string> = {
  SCHEDULED: 'Запланирована',
  CONFIRMED: 'Подтверждена',
  WAITING: 'Ожидает',
  IN_PROGRESS: 'На приёме',
  COMPLETED: 'Выполнена',
  CANCELLED: 'Отменена',
  NO_SHOW: 'Неявка',
};

export const PLAN_STATUS: Record<string, string> = {
  DRAFT: 'Черновик',
  PROPOSED: 'Предложен',
  ACCEPTED: 'Согласован',
  IN_PROGRESS: 'В работе',
  COMPLETED: 'Выполнен',
  REJECTED: 'Отказ',
  CANCELLED: 'Отменён',
};

export const PLAN_ITEM_STATUS: Record<string, string> = {
  PROPOSED: 'Предложена',
  ACCEPTED: 'Согласована',
  DONE: 'Выполнена',
  REJECTED: 'Отказ',
};

export const PATIENT_SOURCE: Record<string, string> = {
  SITE: 'Сайт',
  CALL: 'Звонок',
  WALK_IN: 'С улицы',
  REFERRAL: 'Рекомендация',
  ADS: 'Реклама',
  DOCTOR: 'Врач',
};

export const INVOICE_STATUS: Record<string, string> = {
  DRAFT: 'Черновик',
  ISSUED: 'Выставлен',
  PARTIAL: 'Частично оплачен',
  PAID: 'Оплачен',
  CANCELLED: 'Отменён',
};

export const PAYMENT_METHOD: Record<string, string> = {
  CASH: 'Наличные',
  CARD: 'Карта',
  ONLINE: 'Онлайн',
  DMS: 'ДМС',
  INSTALLMENT: 'Рассрочка',
  BONUS: 'Бонусы',
};

export const CONSENT_TYPE: Record<string, string> = {
  PD_PROCESSING: 'Обработка ПДн',
  MEDICAL_TREATMENT: 'Лечение (ИДС)',
  MARKETING: 'Маркетинг',
  TELEMEDICINE: 'Телемедицина',
};

export const CONSENT_STATUS: Record<string, string> = {
  PENDING: 'Ожидает подписи',
  SIGNED: 'Подписано',
  REVOKED: 'Отозвано',
};

export const INSTALLMENT_STATUS: Record<string, string> = {
  ACTIVE: 'Активна',
  COMPLETED: 'Закрыта',
  DEFAULTED: 'Просрочка',
  CANCELLED: 'Отменена',
};

export const QUEUE_STATUS: Record<string, string> = {
  WAITING: 'Ждёт',
  CALLED: 'Вызван',
  IN_CHAIR: 'В кресле',
  DONE: 'Готов',
  SKIPPED: 'Пропущен',
};

export const LAB_STATUS: Record<string, string> = {
  WAITING_IMPRESSION: 'Ждём слепок',
  RECEIVED: 'Принято',
  IN_PROGRESS: 'В работе',
  READY: 'Готово',
  DELIVERED: 'Доставлено',
  REJECTED: 'Отклонено',
};

export const EMPLOYEE_STATUS: Record<string, string> = {
  ACTIVE: 'Работает',
  ON_LEAVE: 'В отпуске',
  TERMINATED: 'Уволен',
};

export const INSTALLMENT_LINE_STATUS: Record<string, string> = {
  PENDING: 'Ожидает',
  PAID: 'Оплачен',
  OVERDUE: 'Просрочен',
};

export const TOOTH_CONDITIONS: Record<string, string> = {
  HEALTHY: 'Здоров',
  CARIES: 'Кариес',
  FILLED: 'Пломба',
  CROWN: 'Коронка',
  MISSING: 'Отсутствует',
  IMPLANT: 'Имплант',
  ROOT_CANAL: 'Каналы',
  OTHER: 'Другое',
};

export function label(map: Record<string, string>, key: string) {
  return map[key] ?? key;
}
