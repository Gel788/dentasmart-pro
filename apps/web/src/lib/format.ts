export function formatMoney(n: number | string) {
  return Number(n).toLocaleString('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 });
}

export function formatDate(d: string | Date) {
  return new Date(d).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDateOnly(d: string | Date) {
  return new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
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
  PROPOSED: 'Предложен',
  ACCEPTED: 'Принят',
  IN_PROGRESS: 'В работе',
  COMPLETED: 'Завершён',
  CANCELLED: 'Отменён',
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
