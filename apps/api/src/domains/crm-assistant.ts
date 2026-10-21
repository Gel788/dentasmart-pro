import { BadRequestException, Body, Controller, Get, Injectable, Logger, Post, ServiceUnavailableException, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthUser } from '@dentasmart/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { CurrentUser } from '../common/current-user.decorator';
import { OrgId } from '../common/org.decorator';
import { tzOffsetMinutes } from '@dentasmart/shared';
import { PrismaService } from '../prisma/prisma.service';
import { clinicianWhere } from './clinicians';
import { WidgetService } from './widget.service';

/**
 * The staff assistant inside the CRM. A Russian-hosted model (GigaChat through Polza, so whatever a
 * receptionist types about a patient stays in Russia) only reads the request and says what to look up;
 * the lookups run here under the user's own permissions, and the answer comes back as cards built from
 * the database, never as facts the model made up. It reads and points; booking still goes through the
 * usual sheet.
 */
const POLZA = 'https://polza.ai/api/v1';
const MODEL = process.env.CRM_ASSISTANT_MODEL || process.env.DICTATION_MODEL || 'sber/gigachat-2';
const MAX_TURNS = 8;
const MAX_CHARS = 1200;

const PAGES = [
  { href: '/', label: 'Сегодня', perm: 'patient.read' },
  { href: '/patients', label: 'Пациенты', perm: 'patient.read' },
  { href: '/schedule', label: 'Расписание', perm: 'schedule.read' },
  { href: '/supply', label: 'Снабжение и склад', perm: 'warehouse.read' },
  { href: '/money', label: 'Деньги: оплаты, долги, касса', perm: 'finance.read' },
  { href: '/price', label: 'Прайс', perm: 'patient.read' },
  { href: '/requests', label: 'Запись с сайта', perm: 'schedule.read' },
  { href: '/leads', label: 'Заявки', perm: 'patient.read' },
  { href: '/kpis', label: 'Врачи и показатели', perm: 'patient.read' },
  { href: '/radar', label: 'Радар денег', perm: 'finance.read' },
  { href: '/return', label: 'Возврат пациентов', perm: 'medical.read' },
  { href: '/widget', label: 'Виджет записи для сайта', perm: 'org.manage' },
  { href: '/settings', label: 'Настройки: часы работы, сотрудники, праздники', perm: 'org.manage' },
];

export type Turn = { role: 'user' | 'assistant'; content: string };
type Action =
  | { type: 'slots'; patient?: string; doctor?: string; date?: string; dateTo?: string; from?: string; to?: string; service?: string; durationMin?: number }
  | { type: 'patient'; query?: string }
  | { type: 'day'; date?: string; doctor?: string }
  | { type: 'open'; page?: string }
  | { type: 'none' };

export type Card =
  | { kind: 'slots'; doctor: { id: string; name: string } | null; patient: { id: string; name: string } | null; serviceId: string | null; durationMin: number; service: string | null; items: { startsAt: string; endsAt: string }[] }
  | { kind: 'patients'; query: string; items: { id: string; name: string; phone: string | null }[] }
  | { kind: 'day'; date: string; items: { id: string; startsAt: string; patientId: string; patient: string; doctor: string | null; service: string | null; status: string }[] }
  | { kind: 'link'; href: string; label: string };

type Fetch = typeof fetch;
const clean = (value: unknown) => String(value ?? '').trim().toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
const isDate = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
const clock = (value: unknown) => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? ''));
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
};

@Injectable()
export class CrmAssistantService {
  private readonly log = new Logger('CrmAssistant');
  /** Swappable in tests; production calls Polza. */
  http: Fetch = (input, init) => fetch(input, init);

  constructor(private readonly prisma: PrismaService, private readonly widget: WidgetService) {}

  get enabled() {
    return Boolean(process.env.POLZA_API_KEY);
  }

  get model() {
    return MODEL;
  }

  async ask(orgId: string, userId: string, permissions: string[], history: Turn[]): Promise<{ reply: string; cards: Card[] }> {
    if (!this.enabled) throw new ServiceUnavailableException('Помощник не подключён: на сервере нет ключа Polza AI');
    const turns = (Array.isArray(history) ? history : [])
      .filter((turn) => (turn?.role === 'user' || turn?.role === 'assistant') && typeof turn.content === 'string' && turn.content.trim())
      .slice(-MAX_TURNS)
      .map((turn) => ({ role: turn.role, content: turn.content.trim().slice(0, MAX_CHARS) }));
    if (turns.at(-1)?.role !== 'user') throw new BadRequestException('Напишите вопрос');

    const branch = await this.widget.branchOf(orgId).catch(() => null);
    const offset = tzOffsetMinutes(branch?.timezone || 'Europe/Moscow', new Date());
    const local = new Date(Date.now() + offset * 60000);
    const today = local.toISOString().slice(0, 10);
    const weekday = new Intl.DateTimeFormat('ru-RU', { weekday: 'long', timeZone: 'UTC' }).format(local);
    const doctors = await this.prisma.employee.findMany({ where: clinicianWhere(orgId), select: { id: true, firstName: true, lastName: true, middleName: true }, orderBy: { lastName: 'asc' } });
    const pages = PAGES.filter((page) => permissions.includes(page.perm));

    const routed = await this.route(turns, { today, weekday, doctors: doctors.map((row) => `${row.lastName} ${row.firstName}${row.middleName ? ` ${row.middleName}` : ''}`), pages });
    const { reply } = routed;
    // Small models miscount weekdays, so dates said in words are worked out here and win.
    const action = withDates(routed.action, turns.at(-1)!.content, today);
    const cards: Card[] = [];
    const can = (perm: string) => permissions.includes(perm);
    const doctorOf = (name?: string) => {
      const words = clean(name).split(/\s+/).filter((word) => word.length > 2);
      if (!words.length) return null;
      return doctors.find((row) => words.some((word) => [row.firstName, row.lastName, row.middleName].some((part) => clean(part).startsWith(word.slice(0, Math.max(3, word.length - 2)))))) ?? null;
    };

    if (action.type === 'slots' && can('schedule.read') && branch) {
      const doctor = doctorOf(action.doctor);
      const service = action.service ? await this.serviceOf(orgId, action.service) : null;
      const durationMin = Math.min(180, Math.max(15, Number(action.durationMin) || service?.durationMin || 30));
      const fromDate = isDate(action.date) && action.date >= today ? action.date : today;
      const toDate = isDate(action.dateTo) && action.dateTo >= fromDate ? action.dateTo : isDate(action.date) ? fromDate : addDays(today, 6);
      const from = new Date(Date.parse(`${fromDate}T00:00:00Z`) - offset * 60000);
      const to = new Date(Date.parse(`${addDays(toDate, 1)}T00:00:00Z`) - offset * 60000);
      const after = clock(action.from);
      const before = clock(action.to);
      const all = await this.widget.freeSlots(orgId, branch.id, durationMin, from, to, { doctorId: doctor?.id, limit: 200 });
      const items = all
        .filter((slot) => {
          const minute = Math.round(((Date.parse(slot.startsAt) + offset * 60000) % 86400000) / 60000);
          return (after === null || minute >= after) && (before === null || minute + durationMin <= before);
        })
        .slice(0, 12);
      const patients = action.patient && can('patient.read') ? await this.findPatients(orgId, action.patient) : [];
      cards.push({
        kind: 'slots',
        doctor: doctor ? { id: doctor.id, name: `${doctor.lastName} ${doctor.firstName}` } : null,
        patient: patients.length === 1 ? { id: patients[0].id, name: patients[0].name } : null,
        serviceId: service?.id ?? null,
        durationMin,
        service: service?.name ?? null,
        items,
      });
      // Several or no matching patients: show them, the person picks on the booking sheet.
      if (action.patient && can('patient.read') && patients.length !== 1) cards.push({ kind: 'patients', query: action.patient, items: patients });
    }

    if (action.type === 'patient' && can('patient.read')) {
      const query = String(action.query ?? '').trim().slice(0, 80);
      cards.push({ kind: 'patients', query, items: await this.findPatients(orgId, query) });
    }

    if (action.type === 'day' && can('schedule.read')) {
      const date = isDate(action.date) ? action.date : today;
      const doctor = doctorOf(action.doctor);
      const from = new Date(Date.parse(`${date}T00:00:00Z`) - offset * 60000);
      const rows = await this.prisma.appointment.findMany({
        where: { organizationId: orgId, startsAt: { gte: from, lt: new Date(from.getTime() + 86400000) }, status: { not: 'CANCELLED' }, ...(doctor ? { doctorId: doctor.id } : {}) },
        orderBy: { startsAt: 'asc' },
        take: 40,
        select: { id: true, startsAt: true, status: true, patientId: true, patient: { select: { firstName: true, lastName: true } }, doctor: { select: { firstName: true, lastName: true } }, service: { select: { name: true } } },
      });
      cards.push({
        kind: 'day',
        date,
        items: rows.map((row) => ({
          id: row.id,
          startsAt: row.startsAt.toISOString(),
          patientId: row.patientId,
          patient: `${row.patient.lastName} ${row.patient.firstName}`,
          doctor: row.doctor ? `${row.doctor.lastName} ${row.doctor.firstName[0] ?? ''}.` : null,
          service: row.service?.name ?? null,
          status: row.status,
        })),
      });
    }

    if (action.type === 'open') {
      const page = pages.find((item) => item.href === action.page);
      if (page) cards.push({ kind: 'link', href: page.href, label: page.label });
    }

    // Who asked and what kind of lookup, never the words.
    await this.prisma.auditLog.create({ data: { organizationId: orgId, userId, entityType: 'CrmAssistant', entityId: orgId, action: 'VIEW', changes: { action: action.type, cards: cards.length } } }).catch(() => undefined);
    return { reply: reply || describe(cards), cards };
  }

  private async findPatients(orgId: string, raw: string) {
    const query = raw.trim().slice(0, 80);
    // «Орлову», «Кузнецовой»: the stem finds the name in any case form.
    const words = query.split(/\s+/).filter(Boolean).slice(0, 3).map((word) => {
      const stem = word.replace(/(ой|ою|ей|ую|ым|ом|у|ю|а|я|е|ы|и)$/i, '');
      return stem.length >= 3 ? stem : word;
    });
    const digits = query.replace(/\D/g, '');
    if (!words.length) return [];
    const rows = await this.prisma.patient.findMany({
      where: {
        organizationId: orgId,
        isActive: true,
        AND: digits.length >= 4
          ? [{ phone: { contains: digits.slice(-10) } }]
          : words.map((word) => ({ OR: [{ lastName: { contains: word, mode: 'insensitive' as const } }, { firstName: { contains: word, mode: 'insensitive' as const } }, { middleName: { contains: word, mode: 'insensitive' as const } }] })),
      },
      take: 8,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      select: { id: true, firstName: true, lastName: true, middleName: true, phone: true },
    });
    return rows.map((row) => ({ id: row.id, name: [row.lastName, row.firstName, row.middleName].filter(Boolean).join(' '), phone: row.phone }));
  }

  private async serviceOf(orgId: string, name: string) {
    const words = clean(name).split(/\s+/).filter((word) => word.length > 2).slice(0, 4);
    if (!words.length) return null;
    const rows = await this.prisma.service.findMany({ where: { organizationId: orgId, isActive: true }, select: { id: true, name: true, durationMin: true }, take: 300 });
    let best: (typeof rows)[number] | null = null;
    let score = 0;
    for (const row of rows) {
      const hay = clean(row.name);
      const hits = words.filter((word) => hay.includes(word.slice(0, Math.max(4, word.length - 2)))).length;
      if (hits > score) { best = row; score = hits; }
    }
    return best;
  }

  /** The model only classifies the request and fills the lookup's parameters. */
  private async route(turns: Turn[], context: { today: string; weekday: string; doctors: string[]; pages: { href: string; label: string }[] }) {
    const system = [
      'Ты — помощник администратора и врача в CRM стоматологической клиники. Отвечай по-русски, коротко и по делу.',
      `Сегодня ${context.today}, ${context.weekday}.`,
      `Календарь на две недели (бери даты только отсюда): ${calendar(context.today)}.`,
      '«В пятницу» без уточнения — ближайшая пятница из календаря, «на следующей неделе» — с понедельника по воскресенье следующей недели.',
      `Врачи клиники: ${context.doctors.join('; ') || 'нет'}.`,
      'Ты не видишь базу данных. Ты выбираешь одно действие, а CRM сама найдёт данные и покажет их под твоим ответом.',
      'Действия:',
      '- slots: свободное время для записи; также когда просят записать пациента. Поля: patient (фамилия пациента, если назван), doctor (фамилия или имя врача, если назван), date и dateTo (YYYY-MM-DD; «завтра», «в пятницу», «на следующей неделе» переведи в даты), from и to (HH:MM, «вечером» = from 17:00, «утром» = to 12:00, «после обеда» = from 14:00), service (услуга словами, если названа), durationMin (если названа длительность).',
      '- patient: найти пациента. Поле query: фамилия, имя или телефон.',
      '- day: кто записан на день. Поля date (YYYY-MM-DD) и doctor.',
      `- open: открыть раздел. Поле page — один из адресов: ${context.pages.map((page) => `${page.href} (${page.label})`).join(', ')}.`,
      '- none: вопрос о том, как работать в CRM, или просто разговор. Тогда ответь сам в reply, в 1–4 предложениях.',
      'Когда действие не none, reply — одна короткая фраза о том, что ты показываешь («Свободные окна у Завена Седраковича завтра вечером:»). Не придумывай имена, время, суммы и диагнозы — их покажет CRM.',
      'Ты не записываешь, не отменяешь и не переносишь визиты сам. На просьбу записать выбери slots: CRM покажет время, человек нажмёт его и подтвердит запись.',
      'Подсказки по CRM: часы работы клиники и врачей, праздники и отпуска — в Настройках; запись — кнопкой на свободном месте в Расписании или из карточки окна; протокол приёма и диктовка — на экране визита; заявки с сайта подтверждаются в разделе «Запись с сайта».',
      'В reply пиши как живой помощник: никогда не упоминай action, JSON, поля и адреса страниц.',
      'Ответь только JSON без пояснений: {"reply":"","action":{"type":"slots","patient":"","doctor":"","date":"","dateTo":"","from":"","to":"","service":""}}',
    ].join('\n');
    const response = await this.call({ model: MODEL, temperature: 0.1, max_tokens: 500, messages: [{ role: 'system', content: system }, ...turns] });
    return parseRoute(String(response?.choices?.[0]?.message?.content ?? ''));
  }

  private async call(body: unknown) {
    let response: Response;
    try {
      response = await this.http(`${POLZA}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.POLZA_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(45_000),
      });
    } catch (err) {
      this.log.warn(`polza unreachable: ${err instanceof Error ? err.message : err}`);
      throw new ServiceUnavailableException('Помощник сейчас недоступен. Попробуйте ещё раз.');
    }
    const data = (await response.json().catch(() => null)) as Record<string, any> | null;
    if (!response.ok) {
      this.log.warn(`polza ${response.status}: ${JSON.stringify(data)?.slice(0, 300)}`);
      if (response.status === 402) throw new ServiceUnavailableException('На счёте Polza AI закончились средства');
      throw new ServiceUnavailableException('Помощник ответил ошибкой. Попробуйте ещё раз.');
    }
    return data;
  }
}

const WEEKDAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

/** Fourteen days spelled out, so the model never has to count weekdays itself. */
function calendar(today: string) {
  return Array.from({ length: 14 }, (_, index) => {
    const date = addDays(today, index);
    return `${WEEKDAYS[new Date(`${date}T12:00:00Z`).getUTCDay()]} ${date}`;
  }).join(', ');
}

const DAY_WORDS: [RegExp, number][] = [[/понедельник/, 1], [/вторник/, 2], [/сред[уаы]/, 3], [/четверг/, 4], [/пятниц/, 5], [/суббот/, 6], [/воскресень/, 0]];
const MONTHS = ['январ', 'феврал', 'март', 'апрел', 'ма[йя]', 'июн', 'июл', 'август', 'сентябр', 'октябр', 'ноябр', 'декабр'];

/** Dates said in words — «завтра», «в пятницу», «на следующей неделе», «23 октября», «23.10» — from today. */
export function datesIn(text: string, today: string): { date: string; dateTo?: string } | null {
  const said = clean(text);
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  const year = Number(today.slice(0, 4));
  const pick = (date: string) => (date < today ? `${Number(date.slice(0, 4)) + 1}${date.slice(4)}` : date);
  const numeric = /(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?/.exec(said);
  if (numeric) return { date: pick(`${numeric[3] ? (numeric[3].length === 2 ? `20${numeric[3]}` : numeric[3]) : year}-${numeric[2].padStart(2, '0')}-${numeric[1].padStart(2, '0')}`) };
  for (let index = 0; index < 12; index += 1) {
    const match = new RegExp(`(\\d{1,2})\\s+${MONTHS[index]}`).exec(said);
    if (match) return { date: pick(`${year}-${String(index + 1).padStart(2, '0')}-${match[1].padStart(2, '0')}`) };
  }
  if (/послезавтра/.test(said)) return { date: addDays(today, 2) };
  if (/завтра/.test(said)) return { date: addDays(today, 1) };
  if (/сегодня/.test(said)) return { date: today };
  const toMonday = ((8 - weekday) % 7) || 7;
  if (/следующ\S* недел/.test(said)) return { date: addDays(today, toMonday), dateTo: addDays(today, toMonday + 6) };
  if (/(эт\S*|текущ\S*) недел/.test(said)) return { date: today, dateTo: addDays(today, (7 - weekday) % 7) };
  for (const [pattern, day] of DAY_WORDS) {
    if (!pattern.test(said)) continue;
    const ahead = (day - weekday + 7) % 7;
    // «Следующий вторник» means next week's only while this week's is still ahead.
    const stillThisWeek = (day + 6) % 7 > (weekday + 6) % 7;
    return { date: addDays(today, /следующ/.test(said) && stillThisWeek ? ahead + 7 : ahead) };
  }
  return null;
}

function withDates(action: Action, text: string, today: string): Action {
  if (action.type !== 'slots' && action.type !== 'day') return action;
  const dates = datesIn(text, today);
  if (!dates) return action;
  return action.type === 'slots' ? { ...action, date: dates.date, dateTo: dates.dateTo ?? dates.date } : { ...action, date: dates.date };
}

function describe(cards: Card[]) {
  const card = cards[0];
  if (!card) return 'Не понял запрос. Спросите иначе — например, «свободные окна завтра после 15:00».';
  if (card.kind === 'slots') return card.items.length ? `Свободное время${card.doctor ? ` у врача ${card.doctor.name}` : ''}${card.patient ? ` для пациента ${card.patient.name}` : ''}:` : 'Свободного времени по этому запросу нет.';
  if (card.kind === 'patients') return card.items.length ? 'Нашёл пациентов:' : 'Пациента не нашёл.';
  if (card.kind === 'day') return 'Записи на день:';
  return `Раздел «${card.label}»:`;
}

function addDays(date: string, days: number) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
}

/** The model's JSON, even inside prose or fences; anything unknown becomes a plain reply. */
export function parseRoute(content: string): { reply: string; action: Action } {
  const start = content.indexOf('{');
  const end = content.lastIndexOf('}');
  let raw: Record<string, any> = {};
  if (start >= 0 && end > start) {
    try { raw = JSON.parse(content.slice(start, end + 1)); } catch { raw = {}; }
  }
  const reply = typeof raw.reply === 'string' ? raw.reply.trim().slice(0, 1200) : start < 0 ? content.trim().slice(0, 1200) : '';
  const action = raw.action && typeof raw.action === 'object' ? raw.action : {};
  const type = ['slots', 'patient', 'day', 'open'].includes(action.type) ? action.type : 'none';
  const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, 80) : undefined);
  return {
    reply,
    action: {
      type,
      patient: text(action.patient),
      doctor: text(action.doctor),
      date: text(action.date),
      dateTo: text(action.dateTo),
      from: text(action.from),
      to: text(action.to),
      service: text(action.service),
      durationMin: Number(action.durationMin) || undefined,
      query: text(action.query),
      page: text(action.page),
    } as Action,
  };
}

@ApiTags('assistant')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('assistant')
export class CrmAssistantController {
  constructor(private readonly assistant: CrmAssistantService) {}

  @Get()
  @RequirePermissions('patient.read')
  status() {
    return { enabled: this.assistant.enabled, model: this.assistant.model };
  }

  @Post()
  @Throttle({ default: { limit: 40, ttl: 10 * 60_000 } })
  @RequirePermissions('patient.read')
  ask(@OrgId() orgId: string, @CurrentUser() user: AuthUser, @Body() body: { messages?: Turn[] }) {
    return this.assistant.ask(orgId, user.id, user.permissions, body?.messages ?? []);
  }
}
