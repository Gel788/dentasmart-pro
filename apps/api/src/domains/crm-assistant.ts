import { BadRequestException, Body, Controller, Get, Injectable, Logger, Post, Res, ServiceUnavailableException, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import type { Response as HttpResponse } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
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
import { WorkspaceService } from './workspace.service';
import { DictationService } from './dictation.service';
import { ReportsService } from './reports';

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
  | { type: 'visit'; intent?: string; patient?: string; date?: string; dateTo?: string; from?: string }
  | { type: 'new_patient'; lastName?: string; firstName?: string; middleName?: string; phone?: string }
  | { type: 'report'; date?: string; dateTo?: string; doctor?: string }
  | { type: 'debtors' }
  | { type: 'patient_info'; patient?: string }
  | { type: 'payment'; patient?: string; amount?: number; method?: string }
  | { type: 'tasks' }
  | { type: 'task_new'; title?: string; date?: string; patient?: string; assignee?: string }
  | { type: 'stock'; query?: string }
  | { type: 'none' };
const ACTIONS = ['slots', 'patient', 'day', 'open', 'visit', 'new_patient', 'report', 'debtors', 'patient_info', 'payment', 'tasks', 'task_new', 'stock'];

export type Card =
  | { kind: 'slots'; doctor: { id: string; name: string } | null; patient: { id: string; name: string } | null; serviceId: string | null; durationMin: number; service: string | null; items: { startsAt: string; endsAt: string }[] }
  | { kind: 'patients'; query: string; items: { id: string; name: string; phone: string | null }[] }
  | { kind: 'day'; date: string; items: { id: string; startsAt: string; patientId: string; patient: string; doctor: string | null; service: string | null; status: string }[] }
  | { kind: 'link'; href: string; label: string }
  | { kind: 'visits'; intent: VisitIntent; query: string; items: VisitRow[]; slots: { startsAt: string; endsAt: string }[] }
  | { kind: 'newPatient'; lastName: string; firstName: string; middleName: string; phone: string }
  | { kind: 'report'; from: string; to: string; doctor: string | null; visits: { total: number; completed: number; noShows: number; cancelled: number }; patients: { seen: number; new: number }; money: { moneyIn: number; net: number; averageBill: number; debtNow: number } | null }
  | { kind: 'debtors'; total: number; items: { patientId: string; name: string; phone: string | null; amount: number }[] }
  | { kind: 'patientInfo'; id: string; name: string; phone: string | null; age: number | null; allergies: string[] | null; debt: number | null; nextVisit: { id: string; startsAt: string; doctor: string | null; service: string | null } | null; lastVisit: { startsAt: string; service: string | null } | null; todayVisitId: string | null; plan: { title: string; total: number; left: number } | null; tasks: number }
  | { kind: 'payment'; patient: { id: string; name: string } | null; amount: number; method: 'CASH' | 'CARD' | 'ONLINE'; debt: number | null; candidates: { id: string; name: string; phone: string | null }[] }
  | { kind: 'tasks'; items: { id: string; title: string; dueAt: string | null; overdue: boolean; patient: { id: string; name: string } | null }[] }
  | { kind: 'newTask'; title: string; dueAt: string | null; patient: { id: string; name: string } | null; assignee: { id: string; name: string } | null }
  | { kind: 'stock'; query: string; items: { id: string; name: string; unit: string; quantity: number; minStock: number; low: boolean }[] };
export type VisitIntent = 'cancel' | 'confirm' | 'arrived' | 'no_show' | 'move';
type VisitRow = { id: string; startsAt: string; endsAt: string; patientId: string; patient: string; doctor: string | null; service: string | null; status: string };
const INTENTS: VisitIntent[] = ['cancel', 'confirm', 'arrived', 'no_show', 'move'];

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

  constructor(private readonly prisma: PrismaService, private readonly widget: WidgetService, private readonly workspace: WorkspaceService, private readonly reports: ReportsService) {}

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
    // Small models miscount weekdays and miss commands, so dates and command verbs are read here too.
    const said = turns.at(-1)!.content;
    let action = withMoney(withDates(withCommand(routed.action, said), said, today), said);
    if (((action.type === 'visit' || action.type === 'patient_info' || action.type === 'payment') && !action.patient) || (action.type === 'slots' && !action.patient && /запиш/i.test(said))) {
      const named = await this.nameIn(orgId, said);
      if (named) action = { ...action, patient: named };
    }
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

    if (action.type === 'visit' && can('schedule.read')) {
      const intent: VisitIntent = INTENTS.includes(action.intent as VisitIntent) ? (action.intent as VisitIntent) : 'confirm';
      const query = String(action.patient ?? '').trim();
      const patients = query && can('patient.read') ? await this.findPatients(orgId, query) : [];
      const visits = patients.length
        ? await this.prisma.appointment.findMany({
            where: {
              organizationId: orgId,
              patientId: { in: patients.map((row) => row.id) },
              status: { notIn: ['CANCELLED', 'COMPLETED', 'NO_SHOW'] },
              startsAt: { gte: new Date(Date.now() - 12 * 3600_000) },
            },
            orderBy: { startsAt: 'asc' },
            take: 6,
            select: { id: true, startsAt: true, endsAt: true, status: true, patientId: true, doctorId: true, patient: { select: { firstName: true, lastName: true } }, doctor: { select: { firstName: true, lastName: true } }, service: { select: { name: true } } },
          })
        : [];
      let slots: { startsAt: string; endsAt: string }[] = [];
      const first = visits[0];
      if (intent === 'move' && first && branch) {
        const target = datesIn(targetPart(turns.at(-1)!.content), today);
        const fromDate = target?.date && target.date >= today ? target.date : today;
        const toDate = target?.dateTo ?? (target ? fromDate : addDays(today, 6));
        const durationMin = Math.round((+first.endsAt - +first.startsAt) / 60000);
        const from = new Date(Date.parse(`${fromDate}T00:00:00Z`) - offset * 60000);
        const to = new Date(Date.parse(`${addDays(toDate, 1)}T00:00:00Z`) - offset * 60000);
        const after = clock(action.from);
        slots = (await this.widget.freeSlots(orgId, branch.id, durationMin, from, to, { doctorId: first.doctorId, limit: 200 }))
          .filter((slot) => after === null || Math.round(((Date.parse(slot.startsAt) + offset * 60000) % 86400000) / 60000) >= after)
          .slice(0, 12);
      }
      cards.push({
        kind: 'visits',
        intent,
        query,
        slots,
        items: visits.map((row) => ({
          id: row.id,
          startsAt: row.startsAt.toISOString(),
          endsAt: row.endsAt.toISOString(),
          patientId: row.patientId,
          patient: `${row.patient.lastName} ${row.patient.firstName}`,
          doctor: row.doctor ? `${row.doctor.lastName} ${row.doctor.firstName[0] ?? ''}.` : null,
          service: row.service?.name ?? null,
          status: row.status,
        })),
      });
    }

    if (action.type === 'new_patient' && can('patient.write')) {
      const word = (value?: string) => capitalize(String(value ?? '').trim().slice(0, 60));
      cards.push({ kind: 'newPatient', lastName: word(action.lastName), firstName: word(action.firstName), middleName: word(action.middleName), phone: String(action.phone ?? '').replace(/[^\d+]/g, '').slice(0, 16) });
    }

    if (action.type === 'open') {
      const page = pages.find((item) => item.href === action.page);
      if (page) cards.push({ kind: 'link', href: page.href, label: page.label });
    }

    if (action.type === 'report' && can('schedule.read')) {
      const doctor = doctorOf(action.doctor);
      const from = isDate(action.date) ? action.date : today;
      const to = isDate(action.dateTo) && action.dateTo >= from ? action.dateTo : from;
      const report = await this.reports.report(orgId, permissions, { from, to, doctorId: doctor?.id });
      cards.push({
        kind: 'report', from, to,
        doctor: doctor ? `${doctor.lastName} ${doctor.firstName}` : null,
        visits: { total: report.visits.total, completed: report.visits.completed, noShows: report.visits.noShows, cancelled: report.visits.cancelled },
        patients: { seen: report.patients.seen, new: report.patients.new },
        money: report.finance ? { moneyIn: report.finance.moneyIn, net: report.finance.net, averageBill: report.finance.averageBill, debtNow: report.finance.debtNow } : null,
      });
    }

    if (action.type === 'debtors' && can('finance.read')) {
      const open = await this.prisma.invoice.findMany({
        where: { organizationId: orgId, status: { in: ['ISSUED', 'PARTIAL'] } },
        select: { patientId: true, totalAmount: true, paidAmount: true, discountAmount: true, patient: { select: { firstName: true, lastName: true, phone: true } } },
        take: 2000,
      });
      const byPatient = new Map<string, { patientId: string; name: string; phone: string | null; amount: number }>();
      for (const row of open) {
        const left = Number(row.totalAmount) - Number(row.paidAmount) - Number(row.discountAmount ?? 0);
        if (left <= 0.009) continue;
        const entry = byPatient.get(row.patientId) ?? { patientId: row.patientId, name: `${row.patient.lastName} ${row.patient.firstName}`, phone: row.patient.phone, amount: 0 };
        entry.amount = Math.round((entry.amount + left) * 100) / 100;
        byPatient.set(row.patientId, entry);
      }
      const items = [...byPatient.values()].sort((a, b) => b.amount - a.amount);
      cards.push({ kind: 'debtors', total: Math.round(items.reduce((sum, row) => sum + row.amount, 0) * 100) / 100, items: items.slice(0, 12) });
    }

    if (action.type === 'patient_info' && can('patient.read')) {
      const query = String(action.patient ?? '').trim();
      const patients = query ? await this.findPatients(orgId, query) : [];
      if (patients.length === 1) cards.push(await this.patientInfo(orgId, patients[0].id, permissions, offset));
      else cards.push({ kind: 'patients', query, items: patients });
    }

    if (action.type === 'payment' && can('finance.write')) {
      const query = String(action.patient ?? '').trim();
      const patients = query ? await this.findPatients(orgId, query) : [];
      const one = patients.length === 1 ? patients[0] : null;
      const method = action.method === 'CASH' || action.method === 'ONLINE' ? action.method : 'CARD';
      cards.push({
        kind: 'payment',
        patient: one ? { id: one.id, name: one.name } : null,
        amount: Math.max(0, Math.round((Number(action.amount) || 0) * 100) / 100),
        method,
        debt: one ? await this.debtOf(orgId, one.id) : null,
        candidates: one ? [] : patients,
      });
    }

    if (action.type === 'tasks' && can('patient.read')) {
      const rows = await this.prisma.staffTask.findMany({
        where: { organizationId: orgId, status: 'OPEN', OR: [{ assigneeId: userId }, { assigneeId: null, createdById: userId }] },
        orderBy: [{ dueAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
        take: 12,
        select: { id: true, title: true, dueAt: true, patient: { select: { id: true, firstName: true, lastName: true } } },
      });
      cards.push({ kind: 'tasks', items: rows.map((row) => ({ id: row.id, title: row.title, dueAt: row.dueAt?.toISOString() ?? null, overdue: !!row.dueAt && row.dueAt < new Date(), patient: row.patient ? { id: row.patient.id, name: `${row.patient.lastName} ${row.patient.firstName}` } : null })) });
    }

    if (action.type === 'task_new' && can('patient.read')) {
      const patients = action.patient ? await this.findPatients(orgId, action.patient) : [];
      const people = await this.prisma.user.findMany({ where: { organizationId: orgId, isActive: true }, select: { id: true, email: true, employee: { select: { firstName: true, lastName: true } } }, take: 200 });
      const words = clean(action.assignee).split(/\s+/).filter((word) => word.length > 2);
      const assignee = words.length ? people.find((row) => row.employee && words.some((word) => [row.employee!.firstName, row.employee!.lastName].some((part) => clean(part).startsWith(word.slice(0, Math.max(3, word.length - 2)))))) : null;
      const due = isDate(action.date) ? new Date(Date.parse(`${action.date}T18:00:00Z`) - offset * 60000) : null;
      cards.push({
        kind: 'newTask',
        title: capitalize(String(action.title ?? '').trim().slice(0, 200)),
        dueAt: due?.toISOString() ?? null,
        patient: patients.length === 1 ? { id: patients[0].id, name: patients[0].name } : null,
        assignee: assignee?.employee ? { id: assignee.id, name: `${assignee.employee.lastName} ${assignee.employee.firstName}` } : null,
      });
    }

    if (action.type === 'stock' && can('warehouse.read')) {
      const query = String(action.query ?? '').trim().slice(0, 60);
      const words = clean(query).split(/\s+/).filter((word) => word.length > 2).map((word) => word.slice(0, Math.max(4, word.length - 2)));
      const rows = await this.prisma.inventoryItem.findMany({
        where: { organizationId: orgId, isActive: true, ...(words.length ? { AND: words.map((word) => ({ name: { contains: word, mode: 'insensitive' as const } })) } : {}) },
        select: { id: true, name: true, unit: true, minStock: true, batches: { select: { quantity: true } } },
        take: 300,
        orderBy: { name: 'asc' },
      });
      const items = rows
        .map((row) => {
          const quantity = Math.round(row.batches.reduce((sum, batch) => sum + Number(batch.quantity), 0) * 1000) / 1000;
          return { id: row.id, name: row.name, unit: row.unit, quantity, minStock: Number(row.minStock), low: quantity <= Number(row.minStock) };
        })
        // Without a name, «что заканчивается»: only what is at or under its minimum.
        .filter((row) => words.length || row.low)
        .slice(0, 12);
      cards.push({ kind: 'stock', query, items });
    }

    // Who asked and what kind of lookup, never the words.
    await this.prisma.auditLog.create({ data: { organizationId: orgId, userId, entityType: 'CrmAssistant', entityId: orgId, action: 'VIEW', changes: { action: action.type, cards: cards.length } } }).catch(() => undefined);
    // For commands the words come from what will actually happen, never from the model's guess.
    const acting = cards.some((card) => ['visits', 'newPatient', 'payment', 'newTask', 'report', 'debtors', 'patientInfo', 'tasks', 'stock'].includes(card.kind));
    return { reply: acting || !reply ? describe(cards) : reply, cards };
  }

  private async debtOf(orgId: string, patientId: string) {
    const open = await this.prisma.invoice.findMany({ where: { organizationId: orgId, patientId, status: { in: ['ISSUED', 'PARTIAL'] } }, select: { totalAmount: true, paidAmount: true, discountAmount: true } });
    return Math.max(0, Math.round(open.reduce((sum, row) => sum + Number(row.totalAmount) - Number(row.paidAmount) - Number(row.discountAmount ?? 0), 0) * 100) / 100);
  }

  /** One patient at a glance; each part only for those allowed to see it. */
  private async patientInfo(orgId: string, patientId: string, permissions: string[], offset: number): Promise<Card> {
    const can = (perm: string) => permissions.includes(perm);
    const now = new Date();
    const local = new Date(now.getTime() + offset * 60000).toISOString().slice(0, 10);
    const dayStart = new Date(Date.parse(`${local}T00:00:00Z`) - offset * 60000);
    const visitSelect = { id: true, startsAt: true, doctor: { select: { firstName: true, lastName: true } }, service: { select: { name: true } } } as const;
    const [patient, next, last, today, plan, tasks] = await Promise.all([
      this.prisma.patient.findFirstOrThrow({ where: { id: patientId, organizationId: orgId }, select: { id: true, firstName: true, lastName: true, middleName: true, phone: true, birthDate: true, allergies: true } }),
      this.prisma.appointment.findFirst({ where: { organizationId: orgId, patientId, startsAt: { gte: now }, status: { notIn: ['CANCELLED', 'NO_SHOW', 'COMPLETED'] } }, orderBy: { startsAt: 'asc' }, select: visitSelect }),
      this.prisma.appointment.findFirst({ where: { organizationId: orgId, patientId, status: 'COMPLETED' }, orderBy: { startsAt: 'desc' }, select: visitSelect }),
      this.prisma.appointment.findFirst({ where: { organizationId: orgId, patientId, startsAt: { gte: dayStart, lt: new Date(dayStart.getTime() + 86400000) }, status: { notIn: ['CANCELLED', 'NO_SHOW'] } }, orderBy: { startsAt: 'asc' }, select: { id: true } }),
      can('medical.read')
        ? this.prisma.treatmentPlan.findFirst({ where: { organizationId: orgId, patientId, status: { in: ['ACCEPTED', 'IN_PROGRESS'] } }, orderBy: { createdAt: 'desc' }, select: { title: true, items: { select: { price: true, status: true } } } })
        : null,
      this.prisma.staffTask.count({ where: { organizationId: orgId, patientId, status: 'OPEN' } }),
    ]);
    const age = patient.birthDate ? Math.floor((now.getTime() - patient.birthDate.getTime()) / (365.25 * 86400000)) : null;
    const short = (row: { firstName: string; lastName: string } | null) => (row ? `${row.lastName} ${row.firstName[0] ?? ''}.` : null);
    return {
      kind: 'patientInfo',
      id: patient.id,
      name: [patient.lastName, patient.firstName, patient.middleName].filter(Boolean).join(' '),
      phone: patient.phone,
      age,
      allergies: can('medical.read') ? patient.allergies : null,
      debt: can('finance.read') ? await this.debtOf(orgId, patientId) : null,
      nextVisit: next ? { id: next.id, startsAt: next.startsAt.toISOString(), doctor: short(next.doctor), service: next.service?.name ?? null } : null,
      lastVisit: last ? { startsAt: last.startsAt.toISOString(), service: last.service?.name ?? null } : null,
      todayVisitId: today?.id ?? null,
      plan: plan ? { title: plan.title, total: plan.items.reduce((sum, item) => sum + Number(item.price), 0), left: plan.items.filter((item) => item.status !== 'DONE').reduce((sum, item) => sum + Number(item.price), 0) } : null,
      tasks,
    };
  }

  /** Booking straight from the conversation: the chair is picked here, the clash checks are the usual ones. */
  async book(orgId: string, userId: string, body: { patientId?: string; startsAt?: string; serviceId?: string | null; doctorId?: string | null }) {
    if (!body?.patientId || !body.startsAt) throw new BadRequestException('Выберите пациента и время');
    const startsAt = new Date(body.startsAt);
    if (Number.isNaN(+startsAt) || startsAt <= new Date()) throw new BadRequestException('Выберите будущее время');
    const service = body.serviceId ? await this.prisma.service.findFirst({ where: { id: body.serviceId, organizationId: orgId, isActive: true }, select: { id: true, durationMin: true } }) : null;
    const durationMin = service?.durationMin || 30;
    const branch = await this.widget.branchOf(orgId);
    const cabinetId = await this.widget.pickCabinet(orgId, branch.id, startsAt, new Date(startsAt.getTime() + durationMin * 60000));
    if (!cabinetId) throw new BadRequestException('Все кресла в это время заняты. Выберите другое время.');
    const visit = await this.workspace.book(orgId, { patientId: body.patientId, startsAt: startsAt.toISOString(), durationMin, doctorId: body.doctorId || undefined, cabinetId, serviceId: service?.id });
    await this.prisma.auditLog.create({ data: { organizationId: orgId, userId, entityType: 'Appointment', entityId: visit.id, action: 'CREATE', changes: { via: 'assistant' } } }).catch(() => undefined);
    return { id: visit.id, startsAt: visit.startsAt.toISOString(), endsAt: visit.endsAt.toISOString(), patientId: visit.patientId };
  }

  /** A patient named anywhere in the sentence: the first word that matches someone. */
  private async nameIn(orgId: string, text: string) {
    const skip = /^(перенес|отмен|подтверд|запиш|пришел|пришёл|приш|не|на|в|во|с|со|к|у|визит|запис|пациент|завтра|сегодня|послезавтра|понедельник|вторник|сред|четверг|пятниц|суббот|воскрес|утр|вечер|после|обеда)/i;
    for (const word of text.split(/[\s,.!?]+/).filter((item) => item.length >= 3 && !skip.test(item)).slice(0, 6)) {
      if ((await this.findPatients(orgId, word)).length) return word;
    }
    return null;
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
      '- visit: действие с уже существующим визитом пациента. Поля: patient (фамилия), intent — одно из: cancel (отменить), confirm (подтвердить), arrived (пришёл, отметить приход), no_show (не пришёл), move (перенести), from (HH:MM, если для переноса назвали время).',
      '- new_patient: завести нового пациента. Поля lastName, firstName, middleName, phone.',
      '- report: цифры за период — сколько визитов, пришло пациентов, новых, выручка, средний чек, неявки. Поля date и dateTo (YYYY-MM-DD; «сегодня», «за неделю», «за месяц» переведи в даты), doctor (если назван).',
      '- debtors: кто должен клинике, долги пациентов. Без полей.',
      '- patient_info: всё о пациенте — телефон, долг, ближайший и прошлый визит, план лечения, аллергии. Поле patient (фамилия).',
      '- payment: принять оплату от пациента. Поля patient (фамилия), amount (число рублей), method — CASH (наличные), CARD (карта), ONLINE (перевод, СБП).',
      '- tasks: мои задачи, что мне сделать. Без полей.',
      '- task_new: создать задачу или напоминание. Поля title (что сделать, своими словами), date (YYYY-MM-DD, срок), patient (фамилия, если задача про пациента), assignee (фамилия сотрудника, если поручают другому).',
      '- stock: остатки на складе, что заканчивается. Поле query (материал словами; пусто — показать то, что заканчивается).',
      `- open: открыть раздел. Поле page — один из адресов: ${context.pages.map((page) => `${page.href} (${page.label})`).join(', ')}.`,
      '- none: вопрос о том, как работать в CRM, или просто разговор. Тогда ответь сам в reply, в 1–4 предложениях.',
      'Когда действие не none, reply — одна короткая фраза о том, что ты показываешь («Свободные окна у Завена Седраковича завтра вечером:»). Не придумывай имена, время, суммы и диагнозы — их покажет CRM.',
      'Ты выполняешь команды через CRM: она покажет, что будет сделано, а человек нажмёт «Подтвердить». На просьбу записать выбери slots, на отмену, перенос, подтверждение и отметки визита — visit, на нового пациента — new_patient, на оплату — payment, на «напомни» и «поставь задачу» — task_new.',
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

/** Command verbs said outright decide the action, whatever the model made of them. */
export function withCommand(action: Action, text: string): Action {
  const said = clean(text);
  const patient = 'patient' in action ? action.patient : action.type === 'patient' ? action.query : undefined;
  const visit = (intent: VisitIntent): Action => ({ type: 'visit', intent, patient, ...(action.type === 'visit' ? { from: action.from } : {}) });
  if (/нов\S* пациент|заведи|завести|создай пациент/.test(said)) return action.type === 'new_patient' ? action : { type: 'new_patient' };
  if (/(прими|принять|внеси|провед\S*|заплатил|оплатил|оплата от)\s.*\d/.test(said)) return action.type === 'payment' ? action : { type: 'payment', patient };
  if (/кто (нам )?долж|должник|долги пациент|задолженн/.test(said)) return { type: 'debtors' };
  if (/(напомни|поставь задач|создай задач|добавь задач|новая задача)/.test(said)) return action.type === 'task_new' ? action : { type: 'task_new', title: text.replace(/^(зааза|заза)[,\s]*/i, '').slice(0, 200) };
  if (/(мои задачи|какие\S*( у меня)? задач|задачи на сегодня|что мне (сделать|надо)|список задач)/.test(said)) return { type: 'tasks' };
  if (/(остат|на складе|заканчива|сколько осталось)/.test(said)) return action.type === 'stock' ? action : { type: 'stock' };
  if (/(выручк|сколько заработ|сколько денег|отч[её]т|статистик|сколько (было )?визитов|средний чек)/.test(said) && action.type !== 'report') return { type: 'report' };
  if (/перенес|перенос|передвин/.test(said)) return visit('move');
  if (/отмени|отменить|отмена/.test(said)) return visit('cancel');
  if (/не (при|яви)ш|не пришл|неявк/.test(said)) return visit('no_show');
  if (/пришел|пришла|пришли|отметь приход|на месте/.test(said)) return visit('arrived');
  if (/подтверд/.test(said)) return visit('confirm');
  return action;
}

function withDates(action: Action, text: string, today: string): Action {
  if (action.type === 'report' || action.type === 'task_new') {
    const said = clean(text);
    const dates = datesIn(text, today);
    if (action.type === 'task_new') return dates ? { ...action, date: dates.date } : action;
    if (/за (эту )?недел/.test(said)) return { ...action, date: weekMonday(today), dateTo: today };
    if (/за (этот )?месяц/.test(said)) return { ...action, date: `${today.slice(0, 8)}01`, dateTo: today };
    if (/вчера/.test(said)) return { ...action, date: addDays(today, -1), dateTo: addDays(today, -1) };
    if (/сегодня/.test(said)) return { ...action, date: today, dateTo: today };
    return dates ? { ...action, date: dates.date, dateTo: dates.dateTo ?? dates.date } : action;
  }
  if (action.type !== 'slots' && action.type !== 'day') return action;
  if (action.type === 'slots') {
    const said = clean(text);
    if (/утр/.test(said) && !action.to) action = { ...action, to: '12:00' };
    if (/вечер/.test(said) && !action.from) action = { ...action, from: '17:00' };
    if (/после обеда|дн[её]м/.test(said) && !action.from) action = { ...action, from: '14:00' };
  }
  const dates = datesIn(text, today);
  if (!dates) return action;
  return action.type === 'slots' ? { ...action, date: dates.date, dateTo: dates.dateTo ?? dates.date } : { ...action, date: dates.date };
}

function weekMonday(date: string) {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return addDays(date, -((day + 6) % 7));
}

/** «Прими у Орловой 5 000 картой»: the sum and the way to pay are read from the words, not guessed. */
export function withMoney(action: Action, text: string): Action {
  if (action.type !== 'payment') return action;
  const said = clean(text);
  const thousands = /(\d+(?:[.,]\d+)?)\s*(тыс|к(?![а-я]))/.exec(said);
  const plain = /(\d[\d\s]*(?:[.,]\d{1,2})?)\s*(₽|руб|р(?![а-я])|рублей)?/.exec(said.replace(/(\d)\s+(?=\d{3}\b)/g, '$1'));
  const amount = thousands ? Number(thousands[1].replace(',', '.')) * 1000 : plain ? Number(plain[1].replace(/\s/g, '').replace(',', '.')) : Number(action.amount) || 0;
  const method = /налич|кэш/.test(said) ? 'CASH' : /перевод|сбп|онлайн/.test(said) ? 'ONLINE' : /карт|терминал/.test(said) ? 'CARD' : action.method;
  return { ...action, amount: amount || Number(action.amount) || 0, method };
}

const capitalize = (value: string) => value.charAt(0).toLocaleUpperCase('ru-RU') + value.slice(1);

/** «Перенеси Орлову с пятницы на понедельник»: the new date is what follows the last «на». */
function targetPart(text: string) {
  const parts = clean(text).split(/\sна\s/);
  return parts.length > 1 ? parts.at(-1)! : text;
}

function describe(cards: Card[]) {
  const card = cards[0];
  if (!card) return 'Не понял запрос. Спросите иначе — например, «свободные окна завтра после 15:00».';
  if (card.kind === 'slots') return card.items.length ? `Свободное время${card.doctor ? ` у врача ${card.doctor.name}` : ''}${card.patient ? ` для пациента ${card.patient.name}` : ''}:` : 'Свободного времени по этому запросу нет.';
  if (card.kind === 'patients') return card.items.length ? 'Нашёл пациентов:' : 'Пациента не нашёл.';
  if (card.kind === 'day') return 'Записи на день:';
  if (card.kind === 'visits') {
    if (!card.items.length) return card.query ? `Ближайших визитов у «${card.query}» не нашёл.` : 'Назовите фамилию пациента.';
    return { cancel: 'Какой визит отменить?', confirm: 'Подтверждаю визит:', arrived: 'Отмечаю приход:', no_show: 'Отмечаю неявку:', move: 'Перенос визита — выберите новое время:' }[card.intent];
  }
  if (card.kind === 'newPatient') return 'Проверьте данные нового пациента:';
  if (card.kind === 'report') return card.from === card.to ? `Цифры за ${ruDate(card.from)}${card.doctor ? `, ${card.doctor}` : ''}:` : `Цифры с ${ruDate(card.from)} по ${ruDate(card.to)}${card.doctor ? `, ${card.doctor}` : ''}:`;
  if (card.kind === 'debtors') return card.items.length ? `Должны клинике ${card.items.length > 1 ? `${card.items.length} пациентов` : 'один пациент'}, всего ${rub(card.total)}:` : 'Долгов нет — все счета оплачены.';
  if (card.kind === 'patientInfo') return `${card.name}:`;
  if (card.kind === 'payment') return card.patient ? `Оплата ${card.amount ? `${rub(card.amount)} ` : ''}— ${card.patient.name}. Проверьте и подтвердите:` : card.candidates.length ? 'От кого принять оплату?' : 'Назовите фамилию пациента и сумму.';
  if (card.kind === 'tasks') return card.items.length ? `Открытых задач: ${card.items.length}` : 'Открытых задач нет.';
  if (card.kind === 'newTask') return card.title ? 'Создаю задачу — проверьте:' : 'Что записать в задачу?';
  if (card.kind === 'stock') return card.items.length ? (card.query ? 'На складе:' : 'Заканчивается:') : card.query ? `«${card.query}» на складе не нашёл.` : 'Всё в достатке, ничего не заканчивается.';
  return `Раздел «${card.label}»:`;
}

const rub = (value: number) => `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value)} ₽`;
const ruDate = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString('ru-RU', { timeZone: 'UTC', day: 'numeric', month: 'long' });

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
  const type = ACTIONS.includes(action.type) ? action.type : 'none';
  const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, 80) : undefined);
  return {
    reply,
    action: {
      type,
      patient: text(action.patient),
      intent: text(action.intent),
      lastName: text(action.lastName),
      firstName: text(action.firstName),
      middleName: text(action.middleName),
      phone: text(action.phone),
      doctor: text(action.doctor),
      date: text(action.date),
      dateTo: text(action.dateTo),
      from: text(action.from),
      to: text(action.to),
      service: text(action.service),
      durationMin: Number(action.durationMin) || undefined,
      query: text(action.query),
      page: text(action.page),
      amount: Number(String(action.amount ?? '').replace(/[^\d.,]/g, '').replace(',', '.')) || undefined,
      method: ['CASH', 'CARD', 'ONLINE'].includes(String(action.method).toUpperCase()) ? String(action.method).toUpperCase() : undefined,
      title: typeof action.title === 'string' && action.title.trim() ? action.title.trim().slice(0, 200) : undefined,
      assignee: text(action.assignee),
    } as Action,
  };
}

/**
 * ZaZa's voice: Yandex SpeechKit, hosted in Russia, so a reply that names a patient stays in the country.
 * The key lives only in the server's .env (YANDEX_SPEECHKIT_API_KEY); without it the browser falls back
 * to a voice on the device.
 */
@Injectable()
export class SpeechService {
  private readonly log = new Logger('Speech');
  /** Swappable in tests; production calls SpeechKit. */
  http: Fetch = (input, init) => fetch(input, init);

  get enabled() {
    return Boolean(process.env.YANDEX_SPEECHKIT_API_KEY);
  }

  async say(raw: string): Promise<Buffer> {
    if (!this.enabled) throw new ServiceUnavailableException('Голос Яндекса не подключён');
    const text = String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, 500);
    if (!text) throw new BadRequestException('Нечего озвучивать');
    const form = new URLSearchParams({
      text,
      lang: 'ru-RU',
      voice: process.env.YANDEX_TTS_VOICE || 'alena',
      emotion: process.env.YANDEX_TTS_EMOTION || 'good',
      speed: process.env.YANDEX_TTS_SPEED || '1.05',
      format: 'mp3',
    });
    if (process.env.YANDEX_FOLDER_ID) form.set('folderId', process.env.YANDEX_FOLDER_ID);
    let response: Response;
    try {
      response = await this.http('https://tts.api.cloud.yandex.net/speech/v1/tts:synthesize', {
        method: 'POST',
        headers: { Authorization: `Api-Key ${process.env.YANDEX_SPEECHKIT_API_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err) {
      this.log.warn(`speechkit unreachable: ${err instanceof Error ? err.message : err}`);
      throw new ServiceUnavailableException('Голос Яндекса сейчас недоступен');
    }
    if (!response.ok) {
      // The error body names the cause (bad key, no role, no money), never the text.
      this.log.warn(`speechkit ${response.status}: ${(await response.text().catch(() => '')).slice(0, 300)}`);
      if (response.status === 401 || response.status === 403) throw new ServiceUnavailableException('Яндекс не принял ключ SpeechKit: проверьте ключ и роль ai.speechkit-tts.user');
      throw new ServiceUnavailableException('Голос Яндекса ответил ошибкой');
    }
    return Buffer.from(await response.arrayBuffer());
  }
}

@ApiTags('assistant')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('assistant')
export class CrmAssistantController {
  constructor(private readonly assistant: CrmAssistantService, private readonly dictation: DictationService, private readonly speech: SpeechService) {}

  /** A spoken question turned into text by the Russian-hosted speech model; the text then goes through ask(). */
  @Post('transcribe')
  @Throttle({ default: { limit: 40, ttl: 10 * 60_000 } })
  @RequirePermissions('patient.read')
  @UseInterceptors(FileInterceptor('audio', {
    limits: { fileSize: 6 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => (/^(audio|video)\/(webm|ogg|mp4|mpeg|mp3|wav|x-wav|x-m4a|m4a|aac)/.test(file.mimetype) ? cb(null, true) : cb(new BadRequestException('Этот формат записи не принимается'), false)),
  }))
  async transcribe(@UploadedFile() audio?: Express.Multer.File) {
    if (!audio?.buffer?.length) throw new BadRequestException('Пустая запись');
    if (!this.dictation.enabled) throw new ServiceUnavailableException('Голосовой ввод не подключён');
    const text = await this.dictation.transcribe(audio.buffer, audio.mimetype);
    if (!text) throw new BadRequestException('Не расслышал. Скажите ещё раз ближе к микрофону.');
    return { text: text.slice(0, 1200) };
  }

  @Get()
  @RequirePermissions('patient.read')
  status() {
    return { enabled: this.assistant.enabled, model: this.assistant.model, voice: this.speech.enabled ? 'yandex' : 'device' };
  }

  /** The reply spoken in a natural voice; mp3 for the browser to play. */
  @Post('speak')
  @Throttle({ default: { limit: 80, ttl: 10 * 60_000 } })
  @RequirePermissions('patient.read')
  async speak(@Body() body: { text?: string }, @Res() res: HttpResponse) {
    const audio = await this.speech.say(String(body?.text ?? ''));
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');
    res.send(audio);
  }

  @Post()
  @Throttle({ default: { limit: 40, ttl: 10 * 60_000 } })
  @RequirePermissions('patient.read')
  ask(@OrgId() orgId: string, @CurrentUser() user: AuthUser, @Body() body: { messages?: Turn[] }) {
    return this.assistant.ask(orgId, user.id, user.permissions, body?.messages ?? []);
  }

  @Post('book')
  @RequirePermissions('schedule.write')
  book(@OrgId() orgId: string, @CurrentUser() user: AuthUser, @Body() body: { patientId?: string; startsAt?: string; serviceId?: string | null; doctorId?: string | null }) {
    return this.assistant.book(orgId, user.id, body);
  }
}
