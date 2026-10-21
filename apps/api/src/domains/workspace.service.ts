import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ToothCondition, ToothFormulaType } from '@dentasmart/database';
import { dayLoad, effectiveHours, employeeWeek, kopecks, medicalReviewDue, tzOffsetMinutes, visibleHours, wallDate, weekHoursOf } from '@dentasmart/shared';
import { medicalView } from '../patients/patients.service';
import { clinicianWhere } from './clinicians';
import { assertPlace } from '../common/clinic-place';
import { PrismaService } from '../prisma/prisma.service';
import { openLabOrders, reserveForPlan } from '../route/route-chain';
import { ClinicConfigService } from './clinic-config.service';

type Role = 'owner' | 'doctor' | 'reception';

const SURFACE_NAME: Record<string, string> = {
  M: 'мезиальная',
  D: 'дистальная',
  O: 'жевательная',
  B: 'вестибулярная',
  L: 'язычная',
  I: 'режущая',
  TOOTH: 'весь зуб',
};

const TIER_LABEL: Record<string, string> = {
  ECONOM: 'Эконом',
  OPTIMUM: 'Оптимум',
  PREMIUM: 'Премиум',
};

const PAYMENT_METHOD_RU: Record<string, string> = {
  CASH: 'наличные', CARD: 'карта', ONLINE: 'онлайн', DMS: 'ДМС', INSTALLMENT: 'рассрочка', BONUS: 'бонусы',
};
const CONSENT_TYPE_RU: Record<string, string> = {
  PD_PROCESSING: 'Согласие на обработку персональных данных',
  MEDICAL_TREATMENT: 'Информированное согласие на лечение',
  MARKETING: 'Согласие на рассылки',
  TELEMEDICINE: 'Согласие на телемедицину',
};
const CONSENT_STATUS_RU: Record<string, string> = { PENDING: 'ждёт подписи', SIGNED: 'подписано', REVOKED: 'отозвано' };

type ComposeLine = { code?: string; title?: string; toothNum?: number | null; qty?: number; unitPrice?: number; discountPercent?: number; durationMin?: number };
type ComposePhase = { title?: string; specialty?: string; healingDays?: number; dependsOnTitle?: string | null; items?: ComposeLine[] };
export type ComposeBody = {
  patientId: string;
  title?: string;
  plans?: { tier: 'ECONOM' | 'OPTIMUM' | 'PREMIUM'; guaranteeMonths?: number; durationWeeks?: number; installmentMonths?: number; phases?: ComposePhase[] }[];
};
const TIERS = new Set(['ECONOM', 'OPTIMUM', 'PREMIUM']);
const CHART_TEETH_SET = new Set([
  ...[11, 12, 13, 14, 15, 16, 17, 18, 21, 22, 23, 24, 25, 26, 27, 28, 31, 32, 33, 34, 35, 36, 37, 38, 41, 42, 43, 44, 45, 46, 47, 48],
  ...[51, 52, 53, 54, 55, 61, 62, 63, 64, 65, 71, 72, 73, 74, 75, 81, 82, 83, 84, 85],
]);

@Injectable()
export class WorkspaceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ClinicConfigService,
  ) {}

  roleOf(permissions: string[]): Role {
    if (permissions.includes('analytics.read')) return 'owner';
    if (permissions.includes('medical.write')) return 'doctor';
    return 'reception';
  }

  /**
   * The working day in one call: today's patients in time order with what to watch for and the next
   * step, what needs attention (tomorrow's unconfirmed visits, histories to re-confirm, today's debts,
   * plans waiting for an answer), and money only for those allowed to see it.
   */
  async today(orgId: string, permissions: string[], employeeId?: string) {
    const branch = await this.prisma.branch.findFirst({ where: { organizationId: orgId, isActive: true }, orderBy: { createdAt: 'asc' } });
    const now = new Date();
    const offset = tzOffsetMinutes(branch?.timezone ?? 'Europe/Moscow', now);
    const wall = new Date(now.getTime() + offset * 60000);
    const start = new Date(Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate()) - offset * 60000);
    const end = new Date(start.getTime() + 86400000);
    const tomorrowEnd = new Date(end.getTime() + 86400000);
    const doctorOnly = this.roleOf(permissions) === 'doctor' && employeeId ? { doctorId: employeeId } : {};
    const seeMoney = permissions.includes('finance.read');

    const [visits, tomorrow, waitingPlans] = await Promise.all([
      this.prisma.appointment.findMany({
        where: { organizationId: orgId, startsAt: { gte: start, lt: end }, status: { not: 'CANCELLED' }, ...doctorOnly },
        include: { patient: true, doctor: true, cabinet: true, service: true },
        orderBy: { startsAt: 'asc' },
      }),
      this.prisma.appointment.findMany({
        where: { organizationId: orgId, startsAt: { gte: end, lt: tomorrowEnd }, status: 'SCHEDULED', ...doctorOnly },
        include: { patient: { select: { id: true, firstName: true, lastName: true, phone: true } } },
        orderBy: { startsAt: 'asc' },
      }),
      this.prisma.treatmentPlan.findMany({
        where: { organizationId: orgId, status: 'PROPOSED', signedAt: null, abandonedAt: null, presentedAt: { lt: new Date(now.getTime() - 3 * 86400000) } },
        include: { patient: { select: { id: true, firstName: true, lastName: true } } },
        orderBy: { presentedAt: 'asc' },
        take: 40,
      }),
    ]);
    const patientIds = [...new Set(visits.map((visit) => visit.patientId))];
    const debts = new Map<string, number>();
    if (patientIds.length) {
      const open = await this.prisma.invoice.findMany({ where: { organizationId: orgId, patientId: { in: patientIds }, status: { in: ['ISSUED', 'PARTIAL'] } } });
      for (const invoice of open) {
        const left = Math.max(0, kopecks(invoice.totalAmount) - kopecks(invoice.discountAmount) - kopecks(invoice.paidAmount));
        debts.set(invoice.patientId, (debts.get(invoice.patientId) ?? 0) + left);
      }
    }
    const name = (row: { lastName: string; firstName: string }) => `${row.lastName} ${row.firstName === '—' ? '' : row.firstName}`.trim();
    const day = visits.map((visit) => {
      const debt = (debts.get(visit.patientId) ?? 0) / 100;
      const reviewDue = medicalReviewDue(visit.patient.medicalConfirmedAt, now);
      const next =
        ['SCHEDULED', 'CONFIRMED'].includes(visit.status) ? 'check-in'
        : visit.status === 'WAITING' ? 'start'
        : visit.status === 'IN_PROGRESS' ? 'continue'
        : visit.status === 'COMPLETED' && debt > 0 ? 'pay'
        : null;
      return {
        id: visit.id,
        startsAt: visit.startsAt,
        endsAt: visit.endsAt,
        status: visit.status,
        patientId: visit.patientId,
        patient: name(visit.patient),
        phone: visit.patient.phone,
        service: visit.service?.name ?? 'Приём',
        doctor: visit.doctor ? `${visit.doctor.lastName} ${visit.doctor.firstName}` : null,
        cabinet: visit.cabinet?.name ?? null,
        alerts: this.alerts(visit.patient, 0).filter((alert) => alert.tone === 'danger').map((alert) => alert.text),
        reviewDue,
        debt: seeMoney ? debt : null,
        next,
      };
    });

    const live = day.filter((visit) => !['COMPLETED', 'NO_SHOW', 'CANCELLED'].includes(visit.status));
    const attention: { kind: string; title: string; detail: string; href: string; patientId?: string }[] = [];
    // Site bookings first: the slot is held until someone answers.
    const requests = await this.prisma.bookingRequest.findMany({ where: { organizationId: orgId, status: 'PENDING' }, orderBy: { startsAt: 'asc' }, take: 5 });
    for (const row of requests) {
      const when = new Date(row.startsAt.getTime() + offset * 60000);
      attention.push({
        kind: 'request',
        title: `${row.urgent ? 'Срочная заявка' : 'Заявка с сайта'}: ${row.lastName} ${row.firstName}`,
        detail: `${when.toISOString().slice(8, 10)}.${when.toISOString().slice(5, 7)} в ${when.toISOString().slice(11, 16)} · подтвердите или предложите другое время`,
        href: '/requests',
      });
    }
    for (const visit of tomorrow) {
      attention.push({
        kind: 'confirm',
        title: `Подтвердить завтрашний визит: ${name(visit.patient)}`,
        detail: `${new Date(visit.startsAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: branch?.timezone ?? 'Europe/Moscow' })}${visit.patient.phone ? ` · ${visit.patient.phone}` : ''}`,
        href: `/visits/${visit.id}`,
        patientId: visit.patient.id,
      });
    }
    for (const visit of live.filter((row) => row.reviewDue)) {
      attention.push({ kind: 'review', title: `Уточнить анамнез: ${visit.patient}`, detail: 'перед приёмом сегодня', href: `/visits/${visit.id}`, patientId: visit.patientId });
    }
    if (seeMoney) {
      for (const visit of day.filter((row) => row.status === 'COMPLETED' && (row.debt ?? 0) > 0)) {
        attention.push({ kind: 'pay', title: `Принять оплату: ${visit.patient}`, detail: `осталось ${Math.round(visit.debt ?? 0).toLocaleString('ru-RU')} ₽`, href: `/finance?patient=${encodeURIComponent(visit.patient.split(' ')[0])}`, patientId: visit.patientId });
      }
    }
    for (const plan of waitingPlans.slice(0, 5)) {
      attention.push({ kind: 'plan', title: `План ждёт ответа: ${name(plan.patient)}`, detail: `предложен ${plan.presentedAt?.toLocaleDateString('ru-RU') ?? ''}`, href: `/patients/${plan.patient.id}`, patientId: plan.patient.id });
    }

    let money: { revenueToday: number; dueToday: number } | null = null;
    if (seeMoney) {
      const paid = await this.prisma.payment.aggregate({ where: { organizationId: orgId, paidAt: { gte: start, lt: end } }, _sum: { amount: true } });
      money = {
        revenueToday: Number(paid._sum.amount ?? 0),
        dueToday: day.reduce((sum, visit) => sum + (visit.debt ?? 0), 0),
      };
    }
    return {
      day: new Date(start.getTime() + offset * 60000).toISOString().slice(0, 10),
      now,
      // Minutes the clinic's clock is ahead of UTC; the screen shows times in the clinic's zone.
      offsetMinutes: offset,
      visits: day,
      counts: {
        total: day.filter((visit) => visit.status !== 'NO_SHOW').length,
        done: day.filter((visit) => visit.status === 'COMPLETED').length,
        waiting: day.filter((visit) => visit.status === 'WAITING').length,
        inChair: day.filter((visit) => visit.status === 'IN_PROGRESS').length,
        noShow: day.filter((visit) => visit.status === 'NO_SHOW').length,
      },
      attention,
      money,
      tomorrow: tomorrow.length,
    };
  }

  /**
   * Who to call back: patients whose last finished visit is over half a year ago and who have nothing
   * booked, and proposed plans nobody has answered (one per family, the recommended variant).
   */
  async recall(orgId: string) {
    const now = new Date();
    const horizon = new Date(now.getTime() - 183 * 86400000);
    const [last, upcoming, plans] = await Promise.all([
      this.prisma.appointment.groupBy({ by: ['patientId'], where: { organizationId: orgId, status: 'COMPLETED' }, _max: { startsAt: true } }),
      this.prisma.appointment.findMany({
        where: { organizationId: orgId, startsAt: { gte: now }, status: { in: ['SCHEDULED', 'CONFIRMED', 'WAITING'] } },
        select: { patientId: true },
        distinct: ['patientId'],
      }),
      this.prisma.treatmentPlan.findMany({
        where: { organizationId: orgId, status: 'PROPOSED', signedAt: null, abandonedAt: null },
        include: { patient: { select: { id: true, firstName: true, lastName: true, phone: true, isActive: true } } },
        orderBy: { createdAt: 'desc' },
        take: 300,
      }),
    ]);
    const booked = new Set(upcoming.map((row) => row.patientId));
    const due = last.filter((row) => row._max.startsAt && row._max.startsAt < horizon && !booked.has(row.patientId));
    const people = due.length
      ? await this.prisma.patient.findMany({ where: { organizationId: orgId, isActive: true, id: { in: due.map((row) => row.patientId) } }, select: { id: true, firstName: true, lastName: true, phone: true } })
      : [];
    const byId = new Map(people.map((row) => [row.id, row]));
    const name = (row: { lastName: string; firstName: string }) => `${row.lastName} ${row.firstName === '—' ? '' : row.firstName}`.trim();
    const checkups = due
      .filter((row) => byId.has(row.patientId))
      .map((row) => {
        const patient = byId.get(row.patientId)!;
        const lastVisit = row._max.startsAt!;
        return { id: patient.id, patient: name(patient), phone: patient.phone, lastVisit, days: Math.round((now.getTime() - lastVisit.getTime()) / 86400000) };
      })
      .sort((a, b) => b.days - a.days)
      .slice(0, 50);
    const families = new Map<string, (typeof plans)[number]>();
    for (const plan of plans) {
      if (!plan.patient.isActive) continue;
      const key = plan.familyKey ?? plan.id;
      const held = families.get(key);
      if (!held || (plan.tier === 'OPTIMUM' && held.tier !== 'OPTIMUM')) families.set(key, plan);
    }
    return {
      checkups,
      plans: [...families.values()].slice(0, 50).map((plan) => ({
        planId: plan.id,
        patientId: plan.patient.id,
        patient: name(plan.patient),
        phone: plan.patient.phone,
        title: plan.tier ? TIER_LABEL[plan.tier] : plan.title,
        total: Number(plan.totalPrice),
        status: plan.status,
      })),
    };
  }

  async home(orgId: string, permissions: string[], employeeId?: string) {
    const role = this.roleOf(permissions);
    if (role === 'owner') return { role, ...(await this.ownerMetrics(orgId)) };
    if (role === 'doctor') return { role, ...(await this.doctorDay(orgId, employeeId)) };
    return { role, ...(await this.desk(orgId)) };
  }

  async search(orgId: string, q: string) {
    const query = q.trim();
    if (query.length < 2) return [];
    const patients = await this.prisma.patient.findMany({
      where: {
        organizationId: orgId,
        isActive: true,
        OR: [
          { lastName: { contains: query, mode: 'insensitive' } },
          { firstName: { contains: query, mode: 'insensitive' } },
          { phone: { contains: query } },
        ],
      },
      take: 8,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      select: { id: true, firstName: true, lastName: true, phone: true, birthDate: true },
    });
    return patients;
  }

  async brief(orgId: string, patientId: string) {
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, organizationId: orgId },
    });
    if (!patient) throw new NotFoundException('Пациент не найден');
    const debt = await this.debtOf(patientId);
    const next = await this.prisma.appointment.findFirst({
      where: { patientId, startsAt: { gte: new Date() }, status: { notIn: ['CANCELLED', 'NO_SHOW'] } },
      orderBy: { startsAt: 'asc' },
      include: { service: true, doctor: true },
    });
    return {
      id: patient.id,
      firstName: patient.firstName,
      lastName: patient.lastName,
      middleName: patient.middleName,
      phone: patient.phone,
      birthDate: patient.birthDate,
      allergies: patient.allergies,
      anxiety: patient.anxiety,
      pregnant: patient.pregnant,
      anticoagulant: patient.anticoagulant,
      contraindications: patient.contraindications,
      debt,
      alerts: this.alerts(patient, debt),
      next: next
        ? {
            id: next.id,
            startsAt: next.startsAt,
            service: next.service?.name ?? 'Приём',
            doctor: next.doctor ? `${next.doctor.lastName} ${next.doctor.firstName}` : null,
          }
        : null,
    };
  }

  async setDisclosure(orgId: string, planId: string, show: boolean) {
    const saved = await this.prisma.treatmentPlan.updateMany({ where: { id: planId, organizationId: orgId }, data: { showBreakdown: show } });
    if (!saved.count) throw new NotFoundException('План не найден');
    return { showBreakdown: show };
  }

  async setInstallment(orgId: string, planId: string, months: number) {
    const value = months >= 2 ? Math.min(36, Math.round(months)) : 0;
    const saved = await this.prisma.treatmentPlan.updateMany({ where: { id: planId, organizationId: orgId }, data: { installmentMonths: value } });
    if (!saved.count) throw new NotFoundException('План не найден');
    return { installmentMonths: value };
  }

  async card(orgId: string, patientId: string) {
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, organizationId: orgId },
    });
    if (!patient) throw new NotFoundException('Пациент не найден');

    const [debt, surfaces, events, perio, plans, appointments, payments, invoices, imaging, messages, consents, medicalLog, next, deposit, medical] =
      await Promise.all([
        this.debtOf(patientId),
        this.prisma.toothSurface.findMany({ where: { patientId } }),
        this.prisma.toothEvent.findMany({ where: { patientId }, orderBy: { createdAt: 'desc' }, take: 40 }),
        this.prisma.perioExam.findFirst({
          where: { patientId },
          orderBy: { examinedAt: 'desc' },
          include: { teeth: { include: { sites: true } } },
        }),
        this.prisma.treatmentPlan.findMany({
          where: { patientId, organizationId: orgId },
          orderBy: { createdAt: 'desc' },
          include: {
            phases: { orderBy: { sortOrder: 'asc' }, include: { dependsOn: true } },
            items: { orderBy: { sortOrder: 'asc' }, include: { service: true } },
            doctor: true,
          },
        }),
        this.prisma.appointment.findMany({
          where: { patientId },
          orderBy: { startsAt: 'desc' },
          take: 30,
          include: { service: true, doctor: true, visitNote: true },
        }),
        this.prisma.payment.findMany({ where: { patientId }, orderBy: { paidAt: 'desc' }, take: 20 }),
        this.prisma.invoice.findMany({ where: { patientId }, orderBy: { createdAt: 'desc' }, take: 12 }),
        this.prisma.imagingStudy.findMany({ where: { patientId }, orderBy: { takenAt: 'desc' }, take: 12 }),
        this.prisma.patientCommunication.findMany({ where: { patientId }, orderBy: { createdAt: 'desc' }, take: 12 }),
        this.prisma.patientConsent.findMany({ where: { patientId }, take: 12 }),
        this.prisma.auditLog.findMany({
          where: { organizationId: orgId, entityType: 'PatientMedical', entityId: patientId },
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: { user: { include: { employee: true } } },
        }),
        this.prisma.appointment.findFirst({
          where: { patientId, startsAt: { gte: new Date() }, status: { in: ['SCHEDULED', 'CONFIRMED', 'WAITING'] } },
          orderBy: { startsAt: 'asc' },
          include: { service: true, doctor: true, cabinet: true },
        }),
        this.prisma.patientDeposit.findUnique({ where: { patientId } }),
        medicalView(this.prisma, patient),
      ]);

    const timeline = [
      ...appointments.map((a) => ({
        id: `v-${a.id}`,
        at: a.startsAt,
        kind: 'visit',
        title: a.service?.name ?? 'Визит',
        detail: [a.doctor ? `${a.doctor.lastName} ${a.doctor.firstName[0]}.` : null, this.statusRu(a.status)].filter(Boolean).join(' · '),
        status: a.status,
        protocol: a.visitNote
          ? {
              complaints: a.visitNote.complaints,
              objective: a.visitNote.objective,
              diagnosis: a.visitNote.diagnosis,
              treatment: a.visitNote.treatment,
              recommendations: a.visitNote.recommendations,
            }
          : null,
      })),
      ...medicalLog.map((entry) => {
        const data = (entry.changes ?? {}) as { confirmed?: boolean; changes?: { label: string }[] };
        const labels = (data.changes ?? []).map((change) => change.label);
        const who = entry.user?.employee ? `${entry.user.employee.lastName} ${entry.user.employee.firstName[0]}.` : entry.user?.email ?? null;
        return {
          id: `med-${entry.id}`,
          at: entry.createdAt,
          kind: 'medical',
          title: labels.length ? 'Медкарта изменена' : 'Медкарта подтверждена',
          detail: [labels.join(', ') || (data.confirmed ? 'без изменений' : null), labels.length && data.confirmed ? 'подтверждена с пациентом' : null, who].filter(Boolean).join(' · '),
          changes: data.changes ?? [],
        };
      }),
      ...payments.map((p) => ({
        id: `p-${p.id}`,
        at: p.paidAt,
        kind: 'payment',
        title: `Оплата ${this.money(p.amount)}`,
        detail: PAYMENT_METHOD_RU[p.method] ?? p.method,
      })),
      ...invoices.map((i) => ({
        id: `i-${i.id}`,
        at: i.createdAt,
        kind: 'invoice',
        title: `Счёт ${i.number}`,
        detail: `${this.money(i.totalAmount)} · оплачено ${this.money(i.paidAmount)}`,
      })),
      ...imaging.map((i) => ({
        id: `x-${i.id}`,
        at: i.takenAt,
        kind: 'image',
        title: i.title ?? i.type,
        detail: i.toothNum ? `зуб ${i.toothNum}` : 'снимок',
      })),
      ...messages.map((m) => ({
        id: `m-${m.id}`,
        at: m.createdAt,
        kind: 'message',
        title: this.channelRu(m.channel),
        detail: m.summary,
      })),
      ...events.map((e) => ({
        id: `t-${e.id}`,
        at: e.createdAt,
        kind: 'chart',
        title: `Зуб ${e.toothNum}: ${this.conditionRu(e.condition)}`,
        detail: e.note ?? e.surfaces.join(', '),
      })),
      ...consents.map((c) => ({
        id: `c-${c.id}`,
        at: c.signedAt ?? new Date(0),
        kind: 'consent',
        title: CONSENT_TYPE_RU[c.type] ?? 'Согласие',
        detail: CONSENT_STATUS_RU[c.status] ?? c.status,
      })),
      ...plans.map((p) => ({
        id: `plan-${p.id}`,
        at: p.signedAt ?? p.createdAt,
        kind: 'plan',
        title: p.title,
        detail: [p.tier ? TIER_LABEL[p.tier] : null, this.statusRu(p.status)].filter(Boolean).join(' · '),
      })),
    ]
      .sort((a, b) => +new Date(b.at) - +new Date(a.at))
      .slice(0, 60);

    return {
      patient: this.patientDto(patient),
      medical,
      deposit: Number(deposit?.balance ?? 0),
      nextVisit: next
        ? {
            id: next.id,
            startsAt: next.startsAt,
            status: next.status,
            service: next.service?.name ?? 'Приём',
            doctor: next.doctor ? `${next.doctor.lastName} ${next.doctor.firstName}` : null,
            cabinet: next.cabinet?.name ?? null,
          }
        : null,
      debt,
      alerts: this.alerts(patient, debt),
      timeline,
      chart: {
        surfaces: surfaces.map((s) => ({
          toothNum: s.toothNum,
          formula: s.formula,
          surface: s.surface,
          condition: s.condition,
          layer: s.layer,
          diagnosis: s.diagnosis,
        })),
        events: events.map((e) => ({
          id: e.id,
          toothNum: e.toothNum,
          surfaces: e.surfaces,
          condition: e.condition,
          note: e.note,
          at: e.createdAt,
        })),
      },
      perio: perio
        ? {
            id: perio.id,
            examinedAt: perio.examinedAt,
            notes: perio.notes,
            teeth: perio.teeth.map((t) => ({
              toothNum: t.toothNum,
              mobility: t.mobility,
              furcation: t.furcation,
              missing: t.missing,
              sites: t.sites.map((s) => ({
                position: s.position,
                pocket: s.pocket,
                recession: s.recession,
                bleeding: s.bleeding,
              })),
            })),
          }
        : null,
      families: this.groupFamilies(plans),
    };
  }

  async paint(
    orgId: string,
    patientId: string,
    body: { toothNum: number; formula?: 'ADULT' | 'CHILD'; surface: string; condition: string; diagnosis?: string },
  ) {
    const owned = await this.prisma.patient.count({ where: { id: patientId, organizationId: orgId } });
    if (!owned) throw new NotFoundException('Пациент не найден');
    const formula: ToothFormulaType = body.formula === 'CHILD' || body.toothNum >= 50 ? 'CHILD' : 'ADULT';
    const surface = (body.surface || 'TOOTH').toUpperCase();
    const condition = body.condition as ToothCondition;
    if (!Object.values(ToothCondition).includes(condition)) throw new BadRequestException('Неизвестное состояние зуба');
    const layer = condition === 'CARIES' || condition === 'TO_EXTRACT' ? 'PATHOLOGY' : 'EXISTING';
    await this.prisma.toothSurface.upsert({
      where: { patientId_formula_toothNum_surface: { patientId, formula, toothNum: body.toothNum, surface } },
      create: { patientId, formula, toothNum: body.toothNum, surface, condition, layer, diagnosis: body.diagnosis },
      update: { condition, layer, diagnosis: body.diagnosis },
    });
    const surfaces = await this.prisma.toothSurface.findMany({ where: { patientId, formula, toothNum: body.toothNum } });
    const summary = this.summarize(surfaces.map((s) => s.condition));
    await this.prisma.toothRecord.upsert({
      where: { patientId_formula_toothNum: { patientId, formula, toothNum: body.toothNum } },
      create: {
        patientId,
        formula,
        toothNum: body.toothNum,
        condition: summary,
        layer: summary === 'CARIES' || summary === 'TO_EXTRACT' ? 'PATHOLOGY' : 'EXISTING',
        surfaces: surfaces.map((s) => s.surface),
        diagnosis: body.diagnosis,
      },
      update: {
        condition: summary,
        layer: summary === 'CARIES' || summary === 'TO_EXTRACT' ? 'PATHOLOGY' : 'EXISTING',
        surfaces: surfaces.map((s) => s.surface),
        diagnosis: body.diagnosis,
      },
    });
    await this.prisma.toothEvent.create({
      data: {
        patientId,
        formula,
        toothNum: body.toothNum,
        surfaces: [surface],
        condition,
        layer: layer as 'PATHOLOGY' | 'EXISTING',
        note: body.diagnosis,
        source: 'EXAM',
      },
    });
    return { ok: true };
  }

  async savePerio(
    orgId: string,
    patientId: string,
    body: {
      notes?: string;
      teeth: { toothNum: number; mobility?: number; furcation?: number; missing?: boolean; sites: { position: number; pocket?: number; recession?: number; bleeding?: boolean }[] }[];
    },
  ) {
    const patient = await this.prisma.patient.findFirst({ where: { id: patientId, organizationId: orgId } });
    if (!patient) throw new NotFoundException('Пациент не найден');
    const exam = await this.prisma.perioExam.create({
      data: {
        organizationId: orgId,
        patientId,
        notes: body.notes,
        teeth: {
          create: (body.teeth ?? []).map((t) => ({
            toothNum: t.toothNum,
            mobility: t.mobility ?? 0,
            furcation: t.furcation ?? 0,
            missing: !!t.missing,
            sites: {
              create: (t.sites ?? []).map((s) => ({
                position: s.position,
                pocket: s.pocket ?? 0,
                recession: s.recession ?? 0,
                bleeding: !!s.bleeding,
              })),
            },
          })),
        },
      },
      include: { teeth: { include: { sites: true } } },
    });
    return exam;
  }

  async catalog(orgId: string) {
    const [services, listed] = await Promise.all([
      this.prisma.service.findMany({
        where: { organizationId: orgId, isActive: true, NOT: { code: { startsWith: 'GROUP' } } },
        orderBy: [{ sortOrder: 'asc' }],
      }),
      this.prisma.priceListItem.findMany({
        where: { priceList: { organizationId: orgId, isActive: true, isDefault: true } },
      }),
    ]);
    const price = new Map(listed.map((i) => [i.serviceId, Number(i.price)]));
    return services
      .filter((s) => s.code)
      .map((s) => ({
        id: s.id,
        code: s.code,
        name: s.name,
        price: price.get(s.id) ?? Number(s.basePrice),
        durationMin: s.durationMin,
      }));
  }

  async proposeFromChart(orgId: string, patientId: string, doctorId?: string) {
    const patient = await this.prisma.patient.findFirst({ where: { id: patientId, organizationId: orgId } });
    if (!patient) throw new NotFoundException('Пациент не найден');
    const surfaces = await this.prisma.toothSurface.findMany({
      where: { patientId, layer: 'PATHOLOGY' },
    });
    const byTooth = new Map<number, { surfaces: string[]; condition: string }>();
    for (const s of surfaces) {
      const row = byTooth.get(s.toothNum) ?? { surfaces: [], condition: s.condition };
      if (s.surface !== 'TOOTH') row.surfaces.push(s.surface);
      if (s.condition === 'TO_EXTRACT') row.condition = 'TO_EXTRACT';
      else if (row.condition !== 'TO_EXTRACT') row.condition = s.condition;
      byTooth.set(s.toothNum, row);
    }
    if (byTooth.size === 0) throw new BadRequestException('На формуле нет находок. Отметьте кариес или зуб к удалению.');

    const catalog = await this.catalog(orgId);
    const byCode = new Map(catalog.map((s) => [s.code, s]));
    const need = (code: string) => {
      const row = byCode.get(code);
      if (!row) throw new BadRequestException(`В прайсе нет услуги ${code}`);
      return row;
    };
    const caries = need('CARIES');
    const endo = need('ENDO');
    const crown = need('CROWN');
    const extract = need('EXTRACT');
    const implant = need('IMPLANT');
    const whitening = need('WHITENING');

    const findings = [...byTooth.entries()];
    const familyKey = `family-${patientId.slice(-6)}-${Date.now().toString(36)}`;
    const title = 'План по формуле';

    const economItems = findings.map(([tooth, f], i) =>
      f.condition === 'TO_EXTRACT'
        ? item(extract, tooth, [], 1, i)
        : item(caries, tooth, f.surfaces, 1, i),
    );
    const optimumTherapy = findings
      .filter(([, f]) => f.condition !== 'TO_EXTRACT')
      .map(([tooth, f], i) => item(caries, tooth, f.surfaces, 1, i));
    const optimumSurgery = findings
      .filter(([, f]) => f.condition === 'TO_EXTRACT')
      .map(([tooth], i) => item(extract, tooth, [], 1, i));
    const optimumCrown = findings
      .filter(([tooth, f]) => f.condition !== 'TO_EXTRACT' && tooth % 10 >= 4)
      .map(([tooth], i) => item(crown, tooth, [], 2, i, 10));
    const premiumEndo = findings
      .filter(([, f]) => f.condition !== 'TO_EXTRACT' && f.surfaces.length >= 2)
      .map(([tooth, f], i) => item(endo, tooth, f.surfaces, 1, i));
    const premiumFill = findings
      .filter(([, f]) => f.condition !== 'TO_EXTRACT' && f.surfaces.length < 2)
      .map(([tooth, f], i) => item(caries, tooth, f.surfaces, 1, i));
    const premiumExtract = findings
      .filter(([, f]) => f.condition === 'TO_EXTRACT')
      .map(([tooth], i) => item(extract, tooth, [], 1, i));
    const premiumImplant = findings
      .filter(([, f]) => f.condition === 'TO_EXTRACT')
      .map(([tooth], i) => item(implant, tooth, [], 2, i));
    const premiumCrown = findings
      .filter(([tooth, f]) => f.condition !== 'TO_EXTRACT' && (f.surfaces.length >= 2 || tooth % 10 >= 4))
      .map(([tooth], i) => item({ ...crown, price: Math.round(crown.price * 1.15) }, tooth, [], 2, i));

    await this.prisma.$transaction(async (tx) => {
      await this.writeTier(tx, {
        orgId,
        patientId,
        doctorId,
        familyKey,
        title: `${title} · Эконом`,
        tier: 'ECONOM',
        guaranteeMonths: 12,
        durationWeeks: 2,
        installmentMonths: 0,
        discountPercent: 0,
        phases: [{ sort: 1, title: 'Санация', specialty: 'Терапия', healingDays: 0, items: economItems }],
      });
      await this.writeTier(tx, {
        orgId,
        patientId,
        doctorId,
        familyKey,
        title: `${title} · Оптимум`,
        tier: 'OPTIMUM',
        guaranteeMonths: 24,
        durationWeeks: 6,
        installmentMonths: 3,
        discountPercent: 0,
        phases: [
          { sort: 1, title: 'Санация', specialty: 'Терапия', healingDays: 14, items: [...optimumTherapy, ...optimumSurgery] },
          { sort: 2, title: 'Ортопедия', specialty: 'Ортопедия', healingDays: 0, dependsOnSort: 1, items: optimumCrown },
        ].filter((p) => p.items.length),
      });
      await this.writeTier(tx, {
        orgId,
        patientId,
        doctorId,
        familyKey,
        title: `${title} · Премиум`,
        tier: 'PREMIUM',
        guaranteeMonths: 36,
        durationWeeks: 16,
        installmentMonths: 6,
        discountPercent: 0,
        phases: [
          { sort: 1, title: 'Санация и удаление', specialty: 'Хирургия', healingDays: premiumImplant.length ? 90 : 21, items: [...premiumEndo, ...premiumFill, ...premiumExtract] },
          { sort: 2, title: 'Ортопедия', specialty: 'Ортопедия', healingDays: 7, dependsOnSort: 1, items: [...premiumCrown, ...premiumImplant] },
          { sort: 3, title: 'Эстетика', specialty: 'Гигиена', healingDays: 0, dependsOnSort: 2, items: [item(whitening, null, [], 3, 0)] },
        ].filter((p) => p.items.length),
      });
    });

    return this.card(orgId, patientId);
  }

  /**
   * Saves the three variants the plan builder composed from the findings. Lines are matched to the
   * clinic's price list by code (or exact name); a unit price may differ from the list only within
   * half to double of it, so a tampered request cannot price a crown at one rouble.
   */
  async compose(orgId: string, patientId: string, doctorId: string | undefined, body: ComposeBody) {
    const patient = await this.prisma.patient.findFirst({ where: { id: patientId, organizationId: orgId } });
    if (!patient) throw new NotFoundException('Пациент не найден');
    const drafts = (body.plans ?? []).filter((plan) => TIERS.has(plan.tier)).slice(0, 3);
    if (!drafts.length) throw new BadRequestException('План пустой');
    const catalog = await this.catalog(orgId);
    const byCode = new Map(catalog.filter((s) => s.code).map((s) => [String(s.code).toUpperCase(), s]));
    const byName = new Map(catalog.map((s) => [s.name.trim().toLowerCase(), s]));
    const familyKey = `family-${patientId.slice(-6)}-${Date.now().toString(36)}`;
    const title = (body.title ?? '').trim().slice(0, 120) || 'План лечения';

    const ids = await this.prisma.$transaction(async (tx) => {
      const out: { tier: string; id: string }[] = [];
      for (const draft of drafts) {
        const phases = (draft.phases ?? []).slice(0, 12).map((phase, index, all) => {
          const sort = index + 1;
          const dependsOn = phase.dependsOnTitle ? all.findIndex((other) => other.title === phase.dependsOnTitle) : -1;
          const items = (phase.items ?? []).slice(0, 64).map((line, order) => {
            const service = byCode.get(String(line.code ?? '').toUpperCase()) ?? byName.get(String(line.title ?? '').trim().toLowerCase());
            if (!service) throw new BadRequestException(`В прайсе нет услуги «${line.title}»`);
            const qty = Math.min(32, Math.max(1, Math.round(Number(line.qty) || 1)));
            const asked = Number(line.unitPrice);
            const unit = Number.isFinite(asked) && asked >= service.price * 0.5 && asked <= service.price * 2 ? asked : service.price;
            const discount = Math.min(100, Math.max(0, Number(line.discountPercent) || 0));
            const tooth = line.toothNum == null ? null : Number(line.toothNum);
            if (tooth != null && !CHART_TEETH_SET.has(tooth)) throw new BadRequestException('Номер зуба должен быть в системе FDI');
            return {
              serviceId: service.id,
              title: service.name,
              toothNum: tooth,
              surfaces: [] as string[],
              phase: sort,
              sortOrder: order,
              price: round2(unit * qty * (1 - discount / 100)),
              listPrice: round2(service.price * qty),
              discountPercent: discount,
              durationMin: Math.max(10, Number(line.durationMin) || service.durationMin),
            };
          });
          return {
            sort,
            title: String(phase.title ?? `Этап ${sort}`).slice(0, 80),
            specialty: String(phase.specialty ?? 'Терапия').slice(0, 60),
            healingDays: Math.min(365, Math.max(0, Math.round(Number(phase.healingDays) || 0))),
            dependsOnSort: dependsOn >= 0 && dependsOn < index ? dependsOn + 1 : undefined,
            items,
          };
        }).filter((phase) => phase.items.length);
        if (!phases.length) continue;
        const id = await this.writeTier(tx, {
          orgId,
          patientId,
          doctorId,
          familyKey,
          title: `${title} · ${TIER_LABEL[draft.tier]}`,
          tier: draft.tier,
          guaranteeMonths: Math.min(120, Math.max(0, Math.round(Number(draft.guaranteeMonths) || 12))),
          durationWeeks: Math.min(104, Math.max(1, Math.round(Number(draft.durationWeeks) || 4))),
          installmentMonths: Number(draft.installmentMonths) >= 2 ? Math.min(36, Math.round(Number(draft.installmentMonths))) : 0,
          discountPercent: 0,
          phases,
        });
        out.push({ tier: draft.tier, id });
      }
      return out;
    });
    if (!ids.length) throw new BadRequestException('План пустой');
    const optimum = ids.find((row) => row.tier === 'OPTIMUM') ?? ids[0];
    return { familyKey, planId: optimum.id };
  }

  async planSheet(orgId: string, planId: string) {
    const plan = await this.prisma.treatmentPlan.findFirst({
      where: { id: planId, organizationId: orgId },
      include: {
        patient: true,
        doctor: true,
        phases: { orderBy: { sortOrder: 'asc' }, include: { dependsOn: true } },
        items: { include: { service: true } },
      },
    });
    if (!plan) throw new NotFoundException('План не найден');
    const grouped = this.groupFamilies([plan]);
    const chosen = grouped[0].plans[0];
    const months = chosen.installmentMonths >= 2 ? chosen.installmentMonths : 0;
    return {
      clinic: 'Седракович Дент',
      city: 'Москва',
      patient: { firstName: plan.patient.firstName, lastName: plan.patient.lastName },
      doctor: plan.doctor ? `${plan.doctor.lastName} ${plan.doctor.firstName}` : 'Козлова Елена',
      plan: chosen,
      parts: months ? splitInstallment(chosen.total, months) : [],
      share: plan.familyKey ? `/present/${plan.familyKey}` : '',
    };
  }

  async saveDraft(orgId: string, planId: string, body: { discountPercent?: number }, userId: string) {
    const plan = await this.prisma.treatmentPlan.findFirst({
      where: { id: planId, organizationId: orgId },
      include: { items: true },
    });
    if (!plan) throw new NotFoundException('План не найден');
    const policy = await this.config.policy(userId);
    const limit = policy.maxDiscountPercent;
    const discount = body.discountPercent ?? Number(plan.discountPercent);
    if (discount < 0 || discount > limit) throw new BadRequestException(`Для вашей роли скидка не больше ${limit}%`);
    const subtotal = plan.items.filter((item) => item.status !== 'REJECTED').reduce((sum, item) => sum + Number(item.price), 0);
    const total = round2(subtotal * (1 - discount / 100));
    await this.prisma.treatmentPlan.update({
      where: { id: plan.id },
      data: { discountPercent: discount, totalPrice: total, presentedAt: plan.presentedAt ?? new Date() },
    });
    const version = await this.prisma.planVersion.create({
      data: {
        organizationId: orgId,
        planId: plan.id,
        note: 'Сохранение',
        snapshot: {
          discountPercent: discount,
          total,
          items: plan.items.map((item) => ({ id: item.id, title: item.title, price: Number(item.price), status: item.status, toothNum: item.toothNum })),
        },
      },
    });
    await this.prisma.auditLog.create({
      data: { organizationId: orgId, userId, entityType: 'TreatmentPlan', entityId: plan.id, action: 'UPDATE', changes: { discount, total, versionId: version.id } },
    });
    return { savedAt: version.createdAt.toISOString(), discountPercent: discount, total, versionId: version.id };
  }

  async versions(orgId: string, planId: string) {
    const rows = await this.prisma.planVersion.findMany({
      where: { organizationId: orgId, planId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return rows.map((row) => ({ id: row.id, note: row.note, createdAt: row.createdAt, snapshot: row.snapshot }));
  }

  async restoreVersion(orgId: string, planId: string, versionId: string, userId: string) {
    const version = await this.prisma.planVersion.findFirst({ where: { id: versionId, planId, organizationId: orgId } });
    if (!version) throw new NotFoundException('Версия не найдена');
    const snapshot = version.snapshot as { discountPercent?: number; total?: number; items?: { id: string; price: number; status: string }[] };
    await this.prisma.treatmentPlan.update({
      where: { id: planId },
      data: { discountPercent: snapshot.discountPercent ?? 0, totalPrice: snapshot.total ?? 0 },
    });
    for (const item of snapshot.items ?? []) {
      await this.prisma.treatmentPlanItem.updateMany({
        where: { id: item.id, planId },
        data: { price: item.price, status: item.status as 'PROPOSED' },
      });
    }
    await this.prisma.auditLog.create({
      data: { organizationId: orgId, userId, entityType: 'TreatmentPlan', entityId: planId, action: 'UPDATE', changes: { restored: versionId } },
    });
    return { ok: true, versionId };
  }

  async accept(orgId: string, planId: string, body: { signedName: string; signatureSvg: string }, employeeId?: string) {
    const name = body.signedName?.trim();
    if (!name || name.length < 2) throw new BadRequestException('Нужна подпись пациента: имя и фамилия');
    if (!body.signatureSvg || body.signatureSvg.length < 40) throw new BadRequestException('Поставьте подпись на планшете');

    const plan = await this.prisma.treatmentPlan.findFirst({
      where: { id: planId, organizationId: orgId },
      include: {
        phases: { orderBy: { sortOrder: 'asc' }, include: { dependsOn: true, items: true } },
        items: { include: { service: true } },
        patient: true,
      },
    });
    if (!plan) throw new NotFoundException('План не найден');
    if (plan.status === 'REJECTED' || plan.status === 'CANCELLED') {
      throw new BadRequestException('Этот вариант закрыт');
    }
    if (plan.status === 'ACCEPTED' || plan.status === 'IN_PROGRESS' || plan.status === 'COMPLETED') {
      throw new BadRequestException('План уже принят');
    }

    const branch = await this.prisma.branch.findFirst({
      where: { organizationId: orgId, isActive: true },
      include: { cabinets: { where: { isActive: true }, orderBy: { name: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    });
    if (!branch) throw new BadRequestException('Нет филиала для записи');
    const doctorId = plan.doctorId ?? employeeId ?? null;

    const subtotal = plan.items.filter((i) => i.status !== 'REJECTED').reduce((s, i) => s + Number(i.price), 0);
    const discount = round2(subtotal * (Number(plan.discountPercent) / 100));
    const total = round2(subtotal - discount);

    let chain = { reserved: 0, short: 0 };
    const createdAppointments: { id: string; startsAt: Date; title: string }[] = [];

    await this.prisma.$transaction(async (tx) => {
      await tx.treatmentPlan.update({
        where: { id: plan.id },
        data: {
          status: 'ACCEPTED',
          acceptedAt: new Date(),
          presentedAt: plan.presentedAt ?? new Date(),
          signedAt: new Date(),
          signedName: name,
          signatureSvg: body.signatureSvg,
          totalPrice: total,
          abandonedAt: null,
        },
      });
      await tx.treatmentPlanItem.updateMany({
        where: { planId: plan.id, status: 'PROPOSED' },
        data: { status: 'ACCEPTED' },
      });
      if (plan.familyKey) {
        await tx.treatmentPlan.updateMany({
          where: {
            familyKey: plan.familyKey,
            id: { not: plan.id },
            status: { in: ['DRAFT', 'PROPOSED'] },
          },
          data: { status: 'REJECTED' },
        });
      }

      const phases = plan.phases.length
        ? plan.phases
        : [
            {
              id: 'loose',
              title: 'Лечение',
              sortOrder: 1,
              healingDays: 0,
              dependsOnId: null,
              dependsOn: null,
              items: plan.items,
            },
          ];

      const placed = new Map<string, Date>();
      let cursor = nextMorning();
      for (const phase of phases) {
        const items = 'items' in phase ? phase.items : [];
        const open = items.filter((i) => i.status !== 'REJECTED' && i.status !== 'DONE');
        if (!open.length) continue;
        let start = cursor;
        if (phase.dependsOnId && placed.has(phase.dependsOnId)) {
          const heal = phase.dependsOn?.healingDays ?? 0;
          start = addDays(placed.get(phase.dependsOnId)!, Math.max(heal, 1));
          start.setHours(10, 0, 0, 0);
        }
        const minutes = Math.max(30, open.reduce((s, i) => s + (i.durationMin || 30), 0));
        const slot = await this.findSlot(tx, doctorId, branch.cabinets.map((c) => c.id), start, minutes);
        const appt = await tx.appointment.create({
          data: {
            organizationId: orgId,
            branchId: branch.id,
            cabinetId: slot.cabinetId,
            doctorId: doctorId ?? undefined,
            patientId: plan.patientId,
            serviceId: open[0].serviceId,
            startsAt: slot.startsAt,
            endsAt: slot.endsAt,
            status: 'SCHEDULED',
            notes: `${plan.title} · ${phase.title}`,
          },
        });
        await tx.treatmentPlanItem.updateMany({
          where: { id: { in: open.map((i) => i.id) } },
          data: { appointmentId: appt.id, status: 'ACCEPTED' },
        });
        placed.set(phase.id, slot.endsAt);
        cursor = addDays(slot.endsAt, 1);
        cursor.setHours(10, 0, 0, 0);
        createdAppointments.push({ id: appt.id, startsAt: slot.startsAt, title: phase.title });
      }

      chain = await reserveForPlan(tx, { organizationId: orgId, branchId: branch.id, planId: plan.id });
      await openLabOrders(tx, { organizationId: orgId, planId: plan.id, patientId: plan.patientId, doctorId });
      const number = `SD-${Date.now().toString().slice(-8)}`;
      const invoice = await tx.invoice.create({
        data: {
          organizationId: orgId,
          patientId: plan.patientId,
          treatmentPlanId: plan.id,
          number,
          status: 'ISSUED',
          totalAmount: total,
          discountAmount: discount,
          dueDate: addDays(new Date(), 7),
          items: {
            create: plan.items
              .filter((i) => i.status !== 'REJECTED')
              .map((i) => ({
                planItemId: i.id,
                serviceId: i.serviceId,
                toothNum: i.toothNum,
                title: i.toothNum ? `${i.title} · зуб ${i.toothNum}` : i.title,
                price: i.price,
              })),
          },
        },
      });

      let installment: { months: number; parts: { dueDate: Date; amount: number }[] } | null = null;
      if (plan.installmentMonths >= 2 && total > 0) {
        const parts = splitInstallment(total, plan.installmentMonths);
        await tx.installmentPlan.create({
          data: {
            organizationId: orgId,
            patientId: plan.patientId,
            invoiceId: invoice.id,
            totalAmount: total,
            months: plan.installmentMonths,
            schedule: { create: parts.map((p) => ({ dueDate: p.dueDate, amount: p.amount })) },
          },
        });
        installment = { months: plan.installmentMonths, parts };
      }

      return { invoiceNumber: invoice.number, installment };
    });

    const invoice = await this.prisma.invoice.findFirst({
      where: { treatmentPlanId: plan.id },
      orderBy: { createdAt: 'desc' },
      include: { installmentPlans: { include: { schedule: true } } },
    });

    return {
      planId: plan.id,
      status: 'ACCEPTED',
      appointments: createdAppointments,
      materials: chain,
      invoice: invoice
        ? { id: invoice.id, number: invoice.number, total: Number(invoice.totalAmount) }
        : null,
      installment: invoice?.installmentPlans[0]
        ? {
            months: invoice.installmentPlans[0].months,
            parts: invoice.installmentPlans[0].schedule.map((s) => ({
              dueDate: s.dueDate,
              amount: Number(s.amount),
            })),
          }
        : null,
    };
  }

  async acceptPartial(
    orgId: string,
    planId: string,
    body: { signedName: string; signatureSvg: string; phaseIds: string[] },
    employeeId?: string,
  ) {
    const phaseIds = body.phaseIds ?? [];
    if (!phaseIds.length) throw new BadRequestException('Отметьте хотя бы один этап');
    const name = body.signedName?.trim();
    if (!name || name.length < 2) throw new BadRequestException('Нужна подпись пациента: имя и фамилия');
    if (!body.signatureSvg || body.signatureSvg.length < 40) throw new BadRequestException('Поставьте подпись на планшете');
    const plan = await this.prisma.treatmentPlan.findFirst({
      where: { id: planId, organizationId: orgId },
      include: { phases: { orderBy: { sortOrder: 'asc' }, include: { items: true } }, patient: true },
    });
    if (!plan) throw new NotFoundException('План не найден');
    const chosen = plan.phases.filter((phase) => phaseIds.includes(phase.id));
    if (!chosen.length) throw new BadRequestException('Таких этапов в плане нет');
    const full = chosen.length === plan.phases.length;
    const branch = await this.prisma.branch.findFirst({
      where: { organizationId: orgId, isActive: true },
      include: { cabinets: { where: { isActive: true } } },
    });
    if (!branch) throw new BadRequestException('Нет филиала для записи');
    const doctorId = plan.doctorId ?? employeeId ?? null;
    const chosenItems = chosen.flatMap((phase) => phase.items).filter((item) => item.status !== 'REJECTED' && item.status !== 'DONE');
    const total = round2(chosenItems.reduce((sum, item) => sum + Number(item.price), 0));
    const appointments: { id: string; startsAt: Date; title: string }[] = [];
    await this.prisma.$transaction(async (tx) => {
      await tx.treatmentPlan.update({
        where: { id: plan.id },
        data: {
          status: full ? 'ACCEPTED' : 'IN_PROGRESS',
          acceptedAt: new Date(),
          signedAt: new Date(),
          signedName: name,
          signatureSvg: body.signatureSvg,
          totalPrice: total,
          abandonedAt: null,
        },
      });
      await tx.treatmentPlanItem.updateMany({
        where: { id: { in: chosenItems.map((item) => item.id) } },
        data: { status: 'ACCEPTED' },
      });
      if (plan.familyKey) {
        await tx.treatmentPlan.updateMany({
          where: { familyKey: plan.familyKey, id: { not: plan.id }, status: { in: ['DRAFT', 'PROPOSED'] } },
          data: { status: 'REJECTED' },
        });
      }
      let cursor = nextMorning();
      for (const phase of chosen) {
        const open = phase.items.filter((item) => item.status !== 'REJECTED' && item.status !== 'DONE');
        if (!open.length) continue;
        const minutes = Math.max(30, open.reduce((sum, item) => sum + (item.durationMin || 30), 0));
        const slot = await this.findSlot(tx, doctorId, branch.cabinets.map((cabinet) => cabinet.id), cursor, minutes);
        const appointment = await tx.appointment.create({
          data: {
            organizationId: orgId,
            branchId: branch.id,
            cabinetId: slot.cabinetId,
            doctorId: doctorId ?? undefined,
            patientId: plan.patientId,
            serviceId: open[0].serviceId,
            startsAt: slot.startsAt,
            endsAt: slot.endsAt,
            status: 'SCHEDULED',
            notes: `${plan.title} · ${phase.title}`,
          },
        });
        await tx.treatmentPlanItem.updateMany({
          where: { id: { in: open.map((item) => item.id) } },
          data: { appointmentId: appointment.id, status: 'ACCEPTED' },
        });
        appointments.push({ id: appointment.id, startsAt: slot.startsAt, title: phase.title });
        cursor = addDays(slot.endsAt, 1);
        cursor.setHours(10, 0, 0, 0);
      }
      await reserveForPlan(tx, { organizationId: orgId, branchId: branch.id, planId: plan.id });
      await openLabOrders(tx, { organizationId: orgId, planId: plan.id, patientId: plan.patientId, doctorId });
      await tx.invoice.create({
        data: {
          organizationId: orgId,
          patientId: plan.patientId,
          treatmentPlanId: plan.id,
          number: `SD-${Date.now().toString().slice(-8)}`,
          status: 'ISSUED',
          totalAmount: total,
          dueDate: addDays(new Date(), 7),
          items: {
            create: chosenItems.map((item) => ({
              planItemId: item.id,
              serviceId: item.serviceId,
              toothNum: item.toothNum,
              title: item.toothNum ? `${item.title} · зуб ${item.toothNum}` : item.title,
              price: item.price,
            })),
          },
        },
      });
    });
    return { planId: plan.id, status: full ? 'ACCEPTED' : 'IN_PROGRESS', partial: !full, appointments };
  }

  async bookPhase(orgId: string, planId: string, phaseId: string, employeeId?: string) {
    const plan = await this.prisma.treatmentPlan.findFirst({
      where: { id: planId, organizationId: orgId },
      include: { phases: { include: { items: true } } },
    });
    if (!plan) throw new NotFoundException('План не найден');
    if (!['ACCEPTED', 'IN_PROGRESS', 'PROPOSED', 'DRAFT'].includes(plan.status)) {
      throw new BadRequestException('Этот план уже нельзя записать');
    }
    const phase = plan.phases.find((row) => row.id === phaseId);
    if (!phase) throw new NotFoundException('Этап не найден');
    const open = phase.items.filter((item) => item.status !== 'REJECTED' && item.status !== 'DONE');
    if (!open.length) throw new BadRequestException('В этапе нечего записывать');
    const existing = open.find((item) => item.appointmentId);
    if (existing?.appointmentId) {
      const appointment = await this.prisma.appointment.findUnique({ where: { id: existing.appointmentId } });
      return { appointmentId: existing.appointmentId, startsAt: appointment?.startsAt, already: true };
    }
    const branch = await this.prisma.branch.findFirst({
      where: { organizationId: orgId, isActive: true },
      include: { cabinets: { where: { isActive: true } } },
    });
    if (!branch) throw new BadRequestException('Нет филиала');
    const doctorId = plan.doctorId ?? employeeId ?? null;
    const minutes = Math.max(30, open.reduce((sum, item) => sum + (item.durationMin || 30), 0));
    const slot = await this.findSlot(this.prisma, doctorId, branch.cabinets.map((cabinet) => cabinet.id), nextMorning(), minutes);
    const appointment = await this.prisma.appointment.create({
      data: {
        organizationId: orgId,
        branchId: branch.id,
        cabinetId: slot.cabinetId,
        doctorId: doctorId ?? undefined,
        patientId: plan.patientId,
        serviceId: open[0].serviceId,
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
        status: 'SCHEDULED',
        notes: `${plan.title} · ${phase.title}`,
      },
    });
    await this.prisma.treatmentPlanItem.updateMany({
      where: { id: { in: open.map((item) => item.id) } },
      data: { appointmentId: appointment.id },
    });
    return { appointmentId: appointment.id, startsAt: appointment.startsAt, title: phase.title, already: false };
  }

  async abandon(orgId: string, planId: string) {
    const plan = await this.prisma.treatmentPlan.findFirst({ where: { id: planId, organizationId: orgId } });
    if (!plan) throw new NotFoundException('План не найден');
    if (plan.familyKey) {
      await this.prisma.treatmentPlan.updateMany({
        where: { familyKey: plan.familyKey, status: { in: ['DRAFT', 'PROPOSED'] } },
        data: { abandonedAt: new Date() },
      });
    } else {
      await this.prisma.treatmentPlan.update({ where: { id: plan.id }, data: { abandonedAt: new Date() } });
    }
    return { ok: true };
  }

  async abandoned(orgId: string) {
    const plans = await this.prisma.treatmentPlan.findMany({
      where: { organizationId: orgId, status: { in: ['DRAFT', 'PROPOSED'] } },
      include: { patient: true, items: true },
      orderBy: { createdAt: 'asc' },
    });
    const cutoff = addDays(new Date(), -30);
    const groups = new Map<string, typeof plans>();
    for (const plan of plans) {
      const key = plan.familyKey ?? plan.id;
      groups.set(key, [...(groups.get(key) ?? []), plan]);
    }
    const rows: { familyKey: string; planId: string; title: string; patientId: string; patient: string; phone: string | null; since: Date; days: number; total: number; tiers: (string | null)[] }[] = [];
    for (const [key, list] of groups) {
      const marked = list.some((p) => p.abandonedAt);
      const old = list.some((p) => (p.presentedAt ?? p.createdAt) < cutoff);
      if (!marked && !old) continue;
      const patient = list[0].patient;
      const total = Math.max(...list.map((p) => Number(p.totalPrice) || p.items.reduce((s, i) => s + Number(i.price), 0)));
      const since = list.reduce((min, p) => (p.createdAt < min ? p.createdAt : min), list[0].createdAt);
      rows.push({
        familyKey: key,
        planId: list[0].id,
        title: list[0].title.replace(/ · (Эконом|Оптимум|Премиум)$/, ''),
        patientId: patient.id,
        patient: `${patient.lastName} ${patient.firstName}`,
        phone: patient.phone,
        since,
        days: Math.floor((Date.now() - +since) / 86400000),
        total,
        tiers: list.map((p) => p.tier).filter(Boolean),
      });
    }
    rows.sort((a, b) => b.days - a.days);
    const presented = await this.prisma.treatmentPlan.findMany({
      where: { organizationId: orgId, status: { not: 'DRAFT' } },
      select: { familyKey: true, id: true, status: true },
    });
    const fam = new Map<string, string[]>();
    for (const p of presented) {
      const key = p.familyKey ?? p.id;
      fam.set(key, [...(fam.get(key) ?? []), p.status]);
    }
    let accepted = 0;
    let lost = 0;
    let open = 0;
    for (const statuses of fam.values()) {
      if (statuses.some((s) => ['ACCEPTED', 'IN_PROGRESS', 'COMPLETED'].includes(s))) accepted += 1;
      else if (statuses.every((s) => s === 'REJECTED' || s === 'CANCELLED')) lost += 1;
      else open += 1;
    }
    return {
      rows,
      funnel: {
        accepted,
        abandoned: rows.length,
        open,
        lost,
        rate: accepted + rows.length + lost ? Math.round((accepted / (accepted + rows.length + lost)) * 100) : 0,
      },
    };
  }

  async family(orgId: string, familyKey: string) {
    const plans = await this.prisma.treatmentPlan.findMany({
      where: { organizationId: orgId, OR: [{ familyKey }, { id: familyKey }] },
      include: {
        patient: true,
        doctor: true,
        phases: { orderBy: { sortOrder: 'asc' }, include: { dependsOn: true } },
        items: { orderBy: { sortOrder: 'asc' }, include: { service: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    if (!plans.length) throw new NotFoundException('Сравнение не найдено');
    const patient = plans[0].patient;
    const debt = await this.debtOf(patient.id);
    return {
      familyKey,
      patient: this.patientDto(patient),
      alerts: this.alerts(patient, debt),
      debt,
      plans: this.groupFamilies(plans)[0]?.plans ?? [],
    };
  }

  async schedule(orgId: string, dateStr?: string) {
    const day = dateStr ? new Date(dateStr) : new Date();
    if (Number.isNaN(+day)) throw new BadRequestException('Некорректная дата');
    const start = new Date(day);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const [branches, appointments] = await Promise.all([
      this.prisma.branch.findMany({
        where: { organizationId: orgId, isActive: true },
        include: { cabinets: { where: { isActive: true }, orderBy: { name: 'asc' } } },
        orderBy: { name: 'asc' },
      }),
      this.prisma.appointment.findMany({
        where: { organizationId: orgId, startsAt: { gte: start, lt: end }, status: { not: 'CANCELLED' } },
        include: { patient: true, doctor: true, service: true, cabinet: true },
        orderBy: { startsAt: 'asc' },
      }),
    ]);
    const doctors = await this.prisma.employee.findMany({
      where: clinicianWhere(orgId),
      include: { schedules: { where: { isActive: true } } },
      orderBy: { lastName: 'asc' },
    });
    return {
      date: start.toISOString(),
      branches: branches.map((b) => ({
        id: b.id,
        name: b.name,
        cabinets: b.cabinets.map((c) => ({ id: c.id, name: c.name })),
      })),
      // weekHours null: the doctor works by the clinic's hours.
      doctors: doctors.map((d) => ({ id: d.id, name: `${d.lastName} ${d.firstName}`, weekHours: employeeWeek(d.schedules) })),
      exceptions: await this.scheduleExceptions(orgId, start.toISOString().slice(0, 10), new Date(start.getTime() + 86400000).toISOString().slice(0, 10)),
      appointments: appointments.map(boardVisit),
    };
  }

  /** Holidays, vacations and one-off hours touching the clinic-local dates from..to. */
  private async scheduleExceptions(orgId: string, from: string, to: string) {
    const rows = await this.prisma.scheduleException.findMany({
      where: { organizationId: orgId, dateFrom: { lte: to }, dateTo: { gte: from } },
      orderBy: { dateFrom: 'asc' },
    });
    return rows.map((row) => ({ id: row.id, employeeId: row.employeeId, dateFrom: row.dateFrom, dateTo: row.dateTo, opensAt: row.opensAt, closesAt: row.closesAt, note: row.note }));
  }

  /** Visits and how full each clinic-local day is, for the week, month and agenda views. */
  async scheduleRange(orgId: string, fromStr: string, toStr: string) {
    const valid = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value ?? '') && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
    if (!valid(fromStr) || !valid(toStr)) throw new BadRequestException('Укажите даты в виде ГГГГ-ММ-ДД');
    const fromDay = Date.parse(`${fromStr}T00:00:00Z`);
    const toDay = Date.parse(`${toStr}T00:00:00Z`);
    const days = Math.round((toDay - fromDay) / 86400000) + 1;
    if (days < 1 || days > 62) throw new BadRequestException('Период от 1 до 62 дней');

    const [org, branches] = await Promise.all([
      this.prisma.organization.findUniqueOrThrow({ where: { id: orgId }, select: { workHours: true, weekHours: true } }),
      this.prisma.branch.findMany({
        where: { organizationId: orgId, isActive: true },
        include: { cabinets: { where: { isActive: true }, select: { id: true } } },
        orderBy: { name: 'asc' },
      }),
    ]);
    const timezone = branches[0]?.timezone ?? 'Europe/Moscow';
    const offset = tzOffsetMinutes(timezone, new Date(fromDay));
    const week = weekHoursOf(org.weekHours, org.workHours);
    const dates = Array.from({ length: days }, (_, index) => new Date(fromDay + index * 86400000).toISOString().slice(0, 10));
    const exceptions = await this.scheduleExceptions(orgId, fromStr, toStr);
    const clinicExceptions = exceptions.filter((row) => row.employeeId === null);
    const chairs = branches.reduce((sum, branch) => sum + branch.cabinets.length, 0);
    const appointments = await this.prisma.appointment.findMany({
      where: {
        organizationId: orgId,
        status: { not: 'CANCELLED' },
        startsAt: { gte: new Date(fromDay - offset * 60000), lt: new Date(toDay + 86400000 - offset * 60000) },
      },
      include: { patient: true, doctor: true, service: true, cabinet: true },
      orderBy: { startsAt: 'asc' },
    });
    const visits = appointments.map(boardVisit);
    const byDay = new Map<string, typeof visits>();
    for (const visit of visits) {
      const key = wallDate(visit.startsAt.toISOString(), offset);
      byDay.set(key, [...(byDay.get(key) ?? []), visit]);
    }
    return {
      from: fromStr,
      to: toStr,
      timezone,
      offsetMinutes: offset,
      // The widest working span of the range, for grids that show several days at once.
      hours: visibleHours(dates.map((date) => effectiveHours(week, date, clinicExceptions))),
      week,
      exceptions,
      chairs,
      days: dates.map((date) => {
        const list = byDay.get(date) ?? [];
        const open = effectiveHours(week, date, clinicExceptions);
        return {
          date,
          hours: open,
          ...dayLoad(list.map((v) => ({ id: v.id, startsAt: v.startsAt.toISOString(), endsAt: v.endsAt.toISOString(), status: v.status })), {
            chairs,
            opensAt: open?.opensAt ?? 0,
            closesAt: open?.closesAt ?? 0,
            tzOffsetMinutes: offset,
          }),
        };
      }),
      appointments: visits,
    };
  }

  async book(
    orgId: string,
    body: { patientId: string; startsAt: string; durationMin?: number; doctorId?: string; cabinetId?: string; serviceId?: string },
  ) {
    const startsAt = new Date(body.startsAt);
    if (Number.isNaN(+startsAt)) throw new BadRequestException('Некорректное время');
    const minutes = body.durationMin && body.durationMin > 0 ? body.durationMin : 30;
    const endsAt = new Date(startsAt.getTime() + minutes * 60_000);
    await assertPlace(this.prisma, orgId, { doctorId: body.doctorId, cabinetId: body.cabinetId, serviceId: body.serviceId });
    const patient = await this.prisma.patient.findFirst({ where: { id: body.patientId, organizationId: orgId } });
    if (!patient) throw new NotFoundException('Пациент не найден');
    if (body.doctorId) {
      const clash = await this.prisma.appointment.findFirst({
        where: {
          doctorId: body.doctorId,
          status: { notIn: ['CANCELLED', 'NO_SHOW'] },
          startsAt: { lt: endsAt },
          endsAt: { gt: startsAt },
        },
      });
      if (clash) throw new BadRequestException('Врач уже занят в это время');
    }
    if (body.cabinetId) {
      const clash = await this.prisma.appointment.findFirst({
        where: {
          cabinetId: body.cabinetId,
          status: { notIn: ['CANCELLED', 'NO_SHOW'] },
          startsAt: { lt: endsAt },
          endsAt: { gt: startsAt },
        },
      });
      if (clash) throw new BadRequestException('Кресло уже занято в это время');
    }
    const branch = body.cabinetId
      ? await this.prisma.cabinet.findUnique({ where: { id: body.cabinetId } })
      : null;
    const fallback = await this.prisma.branch.findFirst({ where: { organizationId: orgId, isActive: true } });
    const branchId = branch?.branchId ?? fallback?.id;
    if (!branchId) throw new BadRequestException('Нет филиала');
    const appt = await this.prisma.appointment.create({
      data: {
        organizationId: orgId,
        branchId,
        cabinetId: body.cabinetId,
        doctorId: body.doctorId,
        patientId: body.patientId,
        serviceId: body.serviceId,
        startsAt,
        endsAt,
        status: 'SCHEDULED',
      },
    });
    return appt;
  }

  private async ownerMetrics(orgId: string) {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);
    const [payments, monthVisits, noShows, today, patients, branches, cabinets, funnel] = await Promise.all([
      this.prisma.payment.findMany({ where: { organizationId: orgId, paidAt: { gte: addDays(monthStart, -14) } } }),
      this.prisma.appointment.count({
        where: { organizationId: orgId, status: 'COMPLETED', startsAt: { gte: monthStart } },
      }),
      this.prisma.appointment.count({
        where: { organizationId: orgId, status: 'NO_SHOW', startsAt: { gte: monthStart } },
      }),
      this.prisma.appointment.count({
        where: { organizationId: orgId, startsAt: { gte: dayStart, lt: dayEnd }, status: { not: 'CANCELLED' } },
      }),
      this.prisma.patient.findMany({ where: { organizationId: orgId, isActive: true }, select: { source: true } }),
      this.prisma.branch.count({ where: { organizationId: orgId, isActive: true } }),
      this.prisma.cabinet.count({ where: { isActive: true, branch: { organizationId: orgId } } }),
      this.abandoned(orgId),
    ]);
    const monthPay = payments.filter((p) => p.paidAt >= monthStart);
    const revenue = monthPay.reduce((s, p) => s + Number(p.amount), 0);
    const avgCheck = monthPay.length ? Math.round(revenue / monthPay.length) : 0;
    const scheduled = monthVisits + noShows;
    const sources = new Map<string, number>();
    for (const p of patients) {
      const key = p.source || 'Не указан';
      sources.set(key, (sources.get(key) ?? 0) + 1);
    }
    const payers = new Set(payments.map((p) => p.patientId));
    const allPay = await this.prisma.payment.aggregate({ where: { organizationId: orgId }, _sum: { amount: true } });
    const ltv = payers.size ? Math.round(Number(allPay._sum.amount ?? 0) / payers.size) : 0;
    const bookedMinutes = await this.bookedMinutes(orgId, dayStart, dayEnd);
    const loadPercent = cabinets ? Math.min(100, Math.round((bookedMinutes / (cabinets * 10 * 60)) * 100)) : 0;
    const series = Array.from({ length: 14 }, (_, i) => {
      const d = addDays(new Date(), -13 + i);
      const key = d.toISOString().slice(0, 10);
      const amount = payments
        .filter((p) => p.paidAt.toISOString().slice(0, 10) === key)
        .reduce((s, p) => s + Number(p.amount), 0);
      return { day: key, amount };
    });
    return {
      revenue,
      avgCheck,
      visits: monthVisits,
      noShows,
      noShowRate: scheduled ? Math.round((noShows / scheduled) * 100) : 0,
      loadPercent,
      today,
      ltv,
      branches,
      conversion: funnel.funnel,
      sources: [...sources.entries()].map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count),
      series,
    };
  }

  private async doctorDay(orgId: string, employeeId?: string) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const appointments = await this.prisma.appointment.findMany({
      where: {
        organizationId: orgId,
        startsAt: { gte: start, lt: end },
        status: { not: 'CANCELLED' },
        ...(employeeId ? { doctorId: employeeId } : {}),
      },
      include: { patient: true, service: true },
      orderBy: { startsAt: 'asc' },
    });
    const ids = [...new Set(appointments.map((a) => a.patientId))];
    const [plans, consents, debts] = await Promise.all([
      this.prisma.treatmentPlanItem.findMany({
        where: { plan: { patientId: { in: ids }, status: { in: ['ACCEPTED', 'IN_PROGRESS', 'PROPOSED'] } }, status: { in: ['ACCEPTED', 'PROPOSED'] } },
        include: { plan: true },
      }),
      this.prisma.patientConsent.findMany({
        where: { patientId: { in: ids }, type: 'MEDICAL_TREATMENT', status: 'SIGNED' },
      }),
      this.debts(ids),
    ]);
    const signed = new Set(consents.map((c) => c.patientId));
    const visits = appointments.map((a) => {
      const debt = debts.get(a.patientId) ?? 0;
      const prepare = plans
        .filter((i) => i.plan.patientId === a.patientId)
        .slice(0, 3)
        .map((i) => (i.toothNum ? `${i.title} · ${i.toothNum}` : i.title));
      return {
        id: a.id,
        startsAt: a.startsAt,
        endsAt: a.endsAt,
        status: a.status,
        service: a.service?.name ?? 'Приём',
        patientId: a.patientId,
        patient: `${a.patient.lastName} ${a.patient.firstName}`,
        alerts: this.alerts(a.patient, debt).slice(0, 3),
        prepare,
      };
    });
    const incomplete = visits
      .filter((v) => !signed.has(v.patientId))
      .map((v) => ({ patientId: v.patientId, patient: v.patient, missing: 'Нет подписанного согласия на лечение' }));
    const done = await this.prisma.treatmentPlanItem.count({
      where: { status: 'DONE', plan: { organizationId: orgId, doctorId: employeeId } },
    });
    const total = await this.prisma.treatmentPlanItem.count({
      where: { plan: { organizationId: orgId, doctorId: employeeId, status: { in: ['ACCEPTED', 'IN_PROGRESS', 'COMPLETED'] } } },
    });
    return { visits, incomplete, progress: { done, total, percent: total ? Math.round((done / total) * 100) : 0 } };
  }

  private async desk(orgId: string) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const [appointments, invoices, waitlist] = await Promise.all([
      this.prisma.appointment.findMany({
        where: { organizationId: orgId, startsAt: { gte: start, lt: end }, status: { not: 'CANCELLED' } },
        include: { patient: true, doctor: true, cabinet: true, service: true },
        orderBy: { startsAt: 'asc' },
      }),
      this.prisma.invoice.findMany({
        where: { organizationId: orgId, status: { in: ['ISSUED', 'PARTIAL'] } },
        include: { patient: true },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
      this.prisma.waitlistEntry.findMany({
        where: { organizationId: orgId, isActive: true },
        include: { patient: true },
        orderBy: { priority: 'asc' },
        take: 8,
      }),
    ]);
    const debtMap = new Map<string, { patientId: string; name: string; phone: string | null; amount: number }>();
    for (const inv of invoices) {
      const rest = Number(inv.totalAmount) - Number(inv.paidAmount);
      if (rest <= 0) continue;
      const row = debtMap.get(inv.patientId) ?? {
        patientId: inv.patientId,
        name: `${inv.patient.lastName} ${inv.patient.firstName}`,
        phone: inv.patient.phone,
        amount: 0,
      };
      row.amount += rest;
      debtMap.set(inv.patientId, row);
    }
    return {
      visits: appointments.map((a) => ({
        id: a.id,
        startsAt: a.startsAt,
        status: a.status,
        patientId: a.patientId,
        patient: `${a.patient.lastName} ${a.patient.firstName}`,
        doctor: a.doctor ? `${a.doctor.lastName} ${a.doctor.firstName[0]}.` : '—',
        cabinet: a.cabinet?.name ?? '—',
        service: a.service?.name ?? 'Приём',
        alerts: this.alerts(a.patient, 0).slice(0, 2),
      })),
      debts: [...debtMap.values()].sort((a, b) => b.amount - a.amount).slice(0, 8),
      waitlist: waitlist.map((w) => ({
        id: w.id,
        patientId: w.patientId,
        patient: `${w.patient.lastName} ${w.patient.firstName}`,
        phone: w.patient.phone,
        service: 'Лист ожидания',
      })),
    };
  }

  private async bookedMinutes(orgId: string, start: Date, end: Date) {
    const rows = await this.prisma.appointment.findMany({
      where: { organizationId: orgId, startsAt: { gte: start, lt: end }, status: { notIn: ['CANCELLED', 'NO_SHOW'] } },
      select: { startsAt: true, endsAt: true },
    });
    return rows.reduce((s, r) => s + Math.max(0, (r.endsAt.getTime() - r.startsAt.getTime()) / 60000), 0);
  }

  /** What the patient owes: issued invoices less discount and payments, the same rule as the cash desk. */
  private async debtOf(patientId: string) {
    const invoices = await this.prisma.invoice.findMany({
      where: { patientId, status: { in: ['ISSUED', 'PARTIAL'] } },
    });
    return invoices.reduce((s, i) => s + Math.max(0, kopecks(i.totalAmount) - kopecks(i.discountAmount) - kopecks(i.paidAmount)), 0) / 100;
  }

  private async debts(ids: string[]) {
    const map = new Map<string, number>();
    if (!ids.length) return map;
    const invoices = await this.prisma.invoice.findMany({
      where: { patientId: { in: ids }, status: { in: ['ISSUED', 'PARTIAL'] } },
    });
    for (const i of invoices) {
      map.set(i.patientId, (map.get(i.patientId) ?? 0) + Math.max(0, Number(i.totalAmount) - Number(i.paidAmount)));
    }
    return map;
  }

  private alerts(
    patient: { allergies: string[]; anxiety: string; pregnant: boolean; anticoagulant: boolean; contraindications: string | null },
    debt: number,
  ) {
    const rows: { tone: 'danger' | 'warning' | 'info'; text: string }[] = [];
    for (const a of patient.allergies) rows.push({ tone: 'danger', text: `Аллергия: ${a}` });
    if (patient.anticoagulant) rows.push({ tone: 'danger', text: 'Антикоагулянты' });
    if (patient.contraindications) rows.push({ tone: 'danger', text: patient.contraindications });
    if (patient.pregnant) rows.push({ tone: 'warning', text: 'Беременность' });
    if (patient.anxiety === 'HIGH') rows.push({ tone: 'warning', text: 'Выраженный страх лечения' });
    else if (patient.anxiety === 'MILD') rows.push({ tone: 'info', text: 'Тревожность' });
    if (debt > 0) rows.push({ tone: 'warning', text: `Долг ${this.money(debt)}` });
    return rows;
  }

  private patientDto(patient: {
    id: string;
    firstName: string;
    lastName: string;
    middleName: string | null;
    birthDate: Date | null;
    phone: string | null;
    email: string | null;
    gender: string | null;
    allergies: string[];
    chronicConditions: string | null;
    medications: string | null;
    contraindications: string | null;
    anamnesis: string | null;
    anxiety: string;
    pregnant: boolean;
    anticoagulant: boolean;
    source: string | null;
    tags: string[];
    notes?: string | null;
    clientType?: string | null;
  }) {
    return {
      id: patient.id,
      firstName: patient.firstName,
      lastName: patient.lastName,
      middleName: patient.middleName,
      birthDate: patient.birthDate,
      phone: patient.phone,
      email: patient.email,
      gender: patient.gender,
      allergies: patient.allergies,
      chronicConditions: patient.chronicConditions,
      medications: patient.medications,
      contraindications: patient.contraindications,
      anamnesis: patient.anamnesis,
      anxiety: patient.anxiety,
      pregnant: patient.pregnant,
      anticoagulant: patient.anticoagulant,
      source: patient.source,
      tags: patient.tags,
      notes: patient.notes ?? null,
      clientType: patient.clientType ?? null,
    };
  }

  private groupFamilies(
    plans: {
      id: string;
      familyKey: string | null;
      title: string;
      tier: string | null;
      status: string;
      totalPrice: Prisma.Decimal;
      discountPercent: Prisma.Decimal;
      guaranteeMonths: number;
      durationWeeks: number;
      installmentMonths: number;
      showBreakdown: boolean;
      signedAt: Date | null;
      signedName: string | null;
      abandonedAt: Date | null;
      createdAt: Date;
      phases: { id: string; title: string; sortOrder: number; specialty: string | null; healingDays: number; dependsOnId: string | null; dependsOn?: { title: string; healingDays: number } | null }[];
      items: { id: string; title: string; toothNum: number | null; surfaces: string[]; price: Prisma.Decimal; listPrice: Prisma.Decimal | null; discountPercent: Prisma.Decimal; phase: number; phaseId: string | null; status: string; durationMin: number; service?: { code: string | null } | null }[];
    }[],
  ) {
    const order = ['ECONOM', 'OPTIMUM', 'PREMIUM'];
    const map = new Map<string, typeof plans>();
    for (const plan of plans) {
      const key = plan.familyKey ?? plan.id;
      map.set(key, [...(map.get(key) ?? []), plan]);
    }
    return [...map.entries()].map(([key, list]) => ({
      key,
      title: list[0].title.replace(/ · (Эконом|Оптимум|Премиум)$/, ''),
      plans: list
        .slice()
        .sort((a, b) => order.indexOf(a.tier ?? '') - order.indexOf(b.tier ?? ''))
        .map((p) => {
          const subtotal = p.items.filter((i) => i.status !== 'REJECTED').reduce((s, i) => s + Number(i.price), 0);
          const total = round2(subtotal * (1 - Number(p.discountPercent) / 100));
          return {
            id: p.id,
            tier: p.tier,
            tierLabel: p.tier ? TIER_LABEL[p.tier] : 'План',
            title: p.title,
            status: p.status,
            total,
            discountPercent: Number(p.discountPercent),
            guaranteeMonths: p.guaranteeMonths,
            durationWeeks: p.durationWeeks,
            installmentMonths: p.installmentMonths,
            showBreakdown: p.showBreakdown,
            signedAt: p.signedAt,
            signedName: p.signedName,
            abandonedAt: p.abandonedAt,
            phases: p.phases.map((ph) => ({
              id: ph.id,
              title: ph.title,
              sortOrder: ph.sortOrder,
              specialty: ph.specialty,
              healingDays: ph.healingDays,
              dependsOnId: ph.dependsOnId,
              dependsOnTitle: ph.dependsOn?.title ?? null,
              waitDays: ph.dependsOn?.healingDays ?? 0,
              items: p.items
                .filter((i) => i.phaseId === ph.id)
                .map((i) => this.itemDto(i)),
            })),
            // Lines outside any phase still show, even in a phased plan.
            looseItems: p.items.filter((i) => !i.phaseId || !p.phases.some((ph) => ph.id === i.phaseId)).map((i) => this.itemDto(i)),
            explanation: explain(p),
          };
        }),
    }));
  }

  private itemDto(i: {
    id: string;
    title: string;
    toothNum: number | null;
    surfaces: string[];
    price: Prisma.Decimal;
    listPrice: Prisma.Decimal | null;
    discountPercent: Prisma.Decimal;
    status: string;
    durationMin: number;
    service?: { code: string | null } | null;
  }) {
    return {
      id: i.id,
      title: i.title,
      toothNum: i.toothNum,
      surfaces: i.surfaces,
      price: Number(i.price),
      listPrice: i.listPrice == null ? null : Number(i.listPrice),
      discountPercent: Number(i.discountPercent),
      status: i.status,
      durationMin: i.durationMin,
      result: plannedResult(i.title, i.service?.code),
    };
  }

  private summarize(conditions: string[]): ToothCondition {
    const rank = ['MISSING', 'TO_EXTRACT', 'IMPLANT', 'CROWN', 'ROOT_CANAL', 'CARIES', 'FILLED', 'OTHER', 'HEALTHY'];
    for (const name of rank) {
      if (conditions.includes(name)) return name as ToothCondition;
    }
    return 'HEALTHY';
  }

  private async writeTier(
    tx: Prisma.TransactionClient,
    input: {
      orgId: string;
      patientId: string;
      doctorId?: string;
      familyKey: string;
      title: string;
      tier: 'ECONOM' | 'OPTIMUM' | 'PREMIUM';
      guaranteeMonths: number;
      durationWeeks: number;
      installmentMonths: number;
      discountPercent: number;
      phases: { sort: number; title: string; specialty: string; healingDays: number; dependsOnSort?: number; items: ReturnType<typeof item>[] }[];
    },
  ) {
    const plan = await tx.treatmentPlan.create({
      data: {
        organizationId: input.orgId,
        patientId: input.patientId,
        doctorId: input.doctorId,
        title: input.title,
        status: 'PROPOSED',
        tier: input.tier,
        familyKey: input.familyKey,
        guaranteeMonths: input.guaranteeMonths,
        durationWeeks: input.durationWeeks,
        installmentMonths: input.installmentMonths,
        discountPercent: input.discountPercent,
        presentedAt: new Date(),
      },
    });
    const phaseIds = new Map<number, string>();
    let total = 0;
    for (const phase of input.phases) {
      const created = await tx.planPhase.create({
        data: {
          planId: plan.id,
          title: phase.title,
          sortOrder: phase.sort,
          specialty: phase.specialty,
          healingDays: phase.healingDays,
          dependsOnId: phase.dependsOnSort ? phaseIds.get(phase.dependsOnSort) : undefined,
        },
      });
      phaseIds.set(phase.sort, created.id);
      for (const line of phase.items) {
        total += line.price;
        await tx.treatmentPlanItem.create({
          data: {
            planId: plan.id,
            phaseId: created.id,
            phase: phase.sort,
            serviceId: line.serviceId,
            toothNum: line.toothNum ?? undefined,
            surfaces: line.surfaces,
            title: line.title,
            price: line.price,
            listPrice: line.listPrice,
            discountPercent: line.discountPercent,
            durationMin: line.durationMin,
            sortOrder: line.sortOrder,
            status: 'PROPOSED',
          },
        });
      }
    }
    await tx.treatmentPlan.update({ where: { id: plan.id }, data: { totalPrice: total } });
    return plan.id;
  }

  private async findSlot(
    tx: Prisma.TransactionClient,
    doctorId: string | null,
    cabinetIds: string[],
    from: Date,
    minutes: number,
  ) {
    let cursor = new Date(from);
    for (let step = 0; step < 40; step++) {
      if (cursor.getHours() >= 19) {
        cursor = addDays(cursor, 1);
        cursor.setHours(10, 0, 0, 0);
      }
      const endsAt = new Date(cursor.getTime() + minutes * 60_000);
      const doctorClash = doctorId
        ? await tx.appointment.findFirst({
            where: {
              doctorId,
              status: { notIn: ['CANCELLED', 'NO_SHOW'] },
              startsAt: { lt: endsAt },
              endsAt: { gt: cursor },
            },
          })
        : null;
      if (doctorClash) {
        cursor = new Date(doctorClash.endsAt);
        continue;
      }
      for (const cabinetId of cabinetIds.length ? cabinetIds : [undefined]) {
        if (!cabinetId) return { startsAt: cursor, endsAt, cabinetId: undefined };
        const cabClash = await tx.appointment.findFirst({
          where: {
            cabinetId,
            status: { notIn: ['CANCELLED', 'NO_SHOW'] },
            startsAt: { lt: endsAt },
            endsAt: { gt: cursor },
          },
        });
        if (!cabClash) return { startsAt: new Date(cursor), endsAt, cabinetId };
      }
      cursor = new Date(cursor.getTime() + 30 * 60_000);
    }
    const endsAt = new Date(cursor.getTime() + minutes * 60_000);
    return { startsAt: cursor, endsAt, cabinetId: cabinetIds[0] };
  }

  private money(n: Prisma.Decimal | number) {
    return `${Math.round(Number(n)).toLocaleString('ru-RU')} ₽`;
  }

  private statusRu(status: string) {
    const map: Record<string, string> = {
      SCHEDULED: 'запланирован',
      CONFIRMED: 'подтверждён',
      WAITING: 'ожидает',
      IN_PROGRESS: 'идёт приём',
      COMPLETED: 'завершён',
      CANCELLED: 'отменён',
      NO_SHOW: 'неявка',
      DRAFT: 'черновик',
      PROPOSED: 'предложен',
      ACCEPTED: 'принят',
      REJECTED: 'отклонён',
    };
    return map[status] ?? status;
  }

  private channelRu(channel: string) {
    const map: Record<string, string> = {
      PHONE: 'Звонок',
      TELEGRAM: 'Telegram',
      WHATSAPP: 'WhatsApp',
      SMS: 'SMS',
      EMAIL: 'Почта',
      VK: 'ВКонтакте',
    };
    return map[channel] ?? channel;
  }

  private conditionRu(condition: string) {
    const map: Record<string, string> = {
      CARIES: 'кариес',
      FILLED: 'пломба',
      CROWN: 'коронка',
      MISSING: 'отсутствует',
      IMPLANT: 'имплант',
      ROOT_CANAL: 'каналы',
      TO_EXTRACT: 'к удалению',
      HEALTHY: 'здоров',
    };
    return map[condition] ?? condition;
  }
}

function item(
  service: { id: string; name: string; price: number; durationMin: number },
  toothNum: number | null,
  surfaces: string[],
  phase: number,
  sortOrder: number,
  discountPercent = 0,
) {
  const price = round2(service.price * (1 - discountPercent / 100));
  return {
    serviceId: service.id,
    title: service.name,
    toothNum,
    surfaces,
    phase,
    sortOrder,
    price,
    listPrice: service.price,
    discountPercent,
    durationMin: service.durationMin,
  };
}

function plannedResult(title: string, code?: string | null) {
  const t = `${code ?? ''} ${title}`.toLowerCase();
  if (t.includes('extract') || t.includes('удал')) return 'MISSING';
  if (t.includes('implant') || t.includes('имплант')) return 'IMPLANT';
  if (t.includes('crown') || t.includes('корон')) return 'CROWN';
  if (t.includes('endo') || t.includes('канал')) return 'ROOT_CANAL';
  if (t.includes('whitening') || t.includes('отбел')) return 'HEALTHY';
  return 'FILLED';
}

function explain(plan: {
  tier: string | null;
  guaranteeMonths: number;
  durationWeeks: number;
  installmentMonths: number;
  items: { title: string; toothNum: number | null; surfaces: string[] }[];
  phases: { title: string; healingDays: number; dependsOnId: string | null; dependsOn?: { title: string; healingDays: number } | null }[];
}) {
  const teeth = [...new Set(plan.items.map((i) => i.toothNum).filter((n): n is number => n != null))];
  const where = teeth.length ? `Затрагиваем ${teeth.map((t) => `зуб ${t}`).join(', ')}.` : 'Работа без привязки к зубу.';
  const steps = plan.phases.length
    ? plan.phases
        .map((p) => {
          if (p.dependsOn && (p.dependsOn.healingDays || 0) > 0) {
            return `${p.title.toLowerCase()} после заживления ${p.dependsOn.healingDays} дн.`;
          }
          return p.title.toLowerCase();
        })
        .join(', затем ')
    : plan.items.map((i) => i.title.toLowerCase()).join(', ');
  const pay = plan.installmentMonths >= 2 ? ` Оплата равными частями за ${plan.installmentMonths} мес.` : ' Оплата сразу.';
  return `${TIER_LABEL[plan.tier ?? ''] ?? 'План'}. ${where} Ход: ${steps}. Срок около ${plan.durationWeeks} нед., гарантия ${plan.guaranteeMonths} мес.${pay}`;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function nextMorning() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(10, 0, 0, 0);
  return d;
}

function splitInstallment(total: number, months: number) {
  const base = Math.floor((total / months) * 100) / 100;
  const parts: { dueDate: Date; amount: number }[] = [];
  let spent = 0;
  for (let i = 0; i < months; i++) {
    const amount = i === months - 1 ? round2(total - spent) : base;
    spent += amount;
    const due = new Date();
    due.setMonth(due.getMonth() + i + 1);
    parts.push({ dueDate: due, amount });
  }
  return parts;
}

/** The shape every schedule view reads a visit in. */
function boardVisit(a: Prisma.AppointmentGetPayload<{ include: { patient: true; doctor: true; service: true; cabinet: true } }>) {
  return {
    id: a.id,
    startsAt: a.startsAt,
    endsAt: a.endsAt,
    status: a.status,
    cabinetId: a.cabinetId,
    doctorId: a.doctorId,
    patientId: a.patientId,
    patient: `${a.patient.lastName} ${a.patient.firstName}`,
    doctor: a.doctor ? `${a.doctor.lastName} ${a.doctor.firstName[0]}.` : 'Без врача',
    cabinet: a.cabinet?.name ?? 'Без кресла',
    service: a.service?.name ?? 'Приём',
    allergies: a.patient.allergies,
  };
}
