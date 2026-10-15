import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WorkspaceService } from './workspace.service';

const num = (value: { toString(): string } | number | null | undefined) => Number(value ?? 0);

function dayWindow(date = new Date()) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

function monthWindow(date = new Date()) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 1);
  return { start, end };
}

function checkCode(id: string) {
  return id.replace(/[^a-z0-9]/gi, '').slice(-6).toUpperCase();
}

function dayKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

const KITS: Record<string, string[]> = {
  filling: ['Карпула артикаина', 'Коффердам', 'Протравка', 'Бонд', 'Композит A2', 'Матрица', 'Полир', 'Перчатки'],
  endo: ['Артикаин ×2', 'Коффердам', 'Файлы NiTi', 'Гипохлорит', 'Гуттаперча', 'Силер'],
  implant: ['Хирургический набор', 'Имплант', 'Формирователь', 'Шовный материал', 'Артикаин ×2'],
  crown: ['Ретракционная нить', 'Слепочная масса', 'Временная коронка'],
  hygiene: ['Порошок Air Flow', 'Паста', 'Фторлак', 'Перчатки'],
  extract: ['Артикаин', 'Щипцы', 'Марля', 'Шов при необходимости'],
};

@Injectable()
export class ShowcaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspace: WorkspaceService,
  ) {}

  async patients(orgId: string) {
    const rows = await this.prisma.patient.findMany({
      where: { organizationId: orgId, isActive: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      select: { id: true, firstName: true, lastName: true, phone: true },
      take: 40,
    });
    return rows.map((row) => ({ ...row, code: checkCode(row.id) }));
  }

  async briefing(orgId: string, permissions: string[], employeeId?: string) {
    const role = this.workspace.roleOf(permissions);
    const { start, end } = dayWindow();
    const month = monthWindow();
    const doctorId = role === 'doctor' ? employeeId : undefined;
    const appointments = await this.prisma.appointment.findMany({
      where: {
        organizationId: orgId,
        startsAt: { gte: start, lt: end },
        status: { notIn: ['CANCELLED'] },
        ...(doctorId ? { doctorId } : {}),
      },
      include: { patient: true, service: true, cabinet: true, doctor: true },
      orderBy: { startsAt: 'asc' },
    });
    const patientIds = [...new Set(appointments.map((row) => row.patientId))];
    const [debts, plans, payments, cabinets] = await Promise.all([
      this.debts(patientIds),
      this.prisma.treatmentPlan.findMany({
        where: { organizationId: orgId, patientId: { in: patientIds.length ? patientIds : ['none'] }, status: { in: ['DRAFT', 'PROPOSED'] } },
        select: { patientId: true, title: true, totalPrice: true, tier: true, familyKey: true },
      }),
      this.prisma.payment.findMany({
        where: { organizationId: orgId, paidAt: { gte: month.start, lt: month.end } },
        select: { amount: true },
      }),
      this.prisma.cabinet.findMany({
        where: { branch: { organizationId: orgId }, isActive: true },
        orderBy: { name: 'asc' },
      }),
    ]);
    const openByPatient = new Map<string, { title: string; total: number }>();
    for (const plan of plans) {
      if (plan.tier && plan.tier !== 'OPTIMUM') continue;
      const prev = openByPatient.get(plan.patientId);
      const total = num(plan.totalPrice);
      if (!prev || total > prev.total) openByPatient.set(plan.patientId, { title: plan.title, total });
    }
    const cards = appointments.map((row) => {
      const risks: { tone: 'danger' | 'warning' | 'info'; text: string }[] = [];
      for (const allergy of row.patient.allergies) risks.push({ tone: 'danger', text: `Аллергия: ${allergy}` });
      if (row.patient.anticoagulant) risks.push({ tone: 'danger', text: 'Антикоагулянты' });
      if (row.patient.pregnant) risks.push({ tone: 'warning', text: 'Беременность' });
      const debt = debts.get(row.patientId) ?? 0;
      if (debt > 0) risks.push({ tone: 'warning', text: `Долг ${Math.round(debt)} ₽` });
      const open = openByPatient.get(row.patientId);
      if (open) risks.push({ tone: 'info', text: `План не принят: ${open.title}` });
      return {
        id: row.id,
        startsAt: row.startsAt,
        patientId: row.patientId,
        patient: `${row.patient.lastName} ${row.patient.firstName}`,
        service: row.service?.name ?? 'Приём',
        price: num(row.service?.basePrice),
        cabinet: row.cabinet?.name ?? 'Кресло',
        doctor: row.doctor ? `${row.doctor.lastName} ${row.doctor.firstName}` : null,
        status: row.status,
        risks,
      };
    });
    const forecast = cards.filter((card) => card.status !== 'NO_SHOW').reduce((sum, card) => sum + card.price, 0);
    const slots = this.emptySlots(cabinets.map((cabinet) => cabinet.name), appointments.map((row) => ({
      cabinet: row.cabinet?.name ?? '',
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      status: row.status,
    })));
    const revenue = payments.reduce((sum, row) => sum + num(row.amount), 0);
    return {
      role,
      date: start.toISOString(),
      forecast,
      revenueMonth: revenue,
      patients: cards,
      risks: cards.reduce((sum, card) => sum + card.risks.length, 0),
      slots,
    };
  }

  async pulse(orgId: string) {
    const now = new Date();
    const { start, end } = dayWindow(now);
    const month = monthWindow(now);
    const [cabinets, appointments, payments, plans] = await Promise.all([
      this.prisma.cabinet.findMany({
        where: { branch: { organizationId: orgId }, isActive: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.appointment.findMany({
        where: { organizationId: orgId, startsAt: { gte: start, lt: end }, status: { notIn: ['CANCELLED'] } },
        include: { patient: true, service: true, cabinet: true },
        orderBy: { startsAt: 'asc' },
      }),
      this.prisma.payment.findMany({
        where: { organizationId: orgId, paidAt: { gte: month.start, lt: month.end } },
        orderBy: { paidAt: 'desc' },
      }),
      this.prisma.treatmentPlan.findMany({
        where: { organizationId: orgId },
        select: { id: true, patientId: true, status: true, totalPrice: true, tier: true, familyKey: true, abandonedAt: true, title: true },
      }),
    ]);
    const chairs = cabinets.map((cabinet) => {
      const rows = appointments.filter((row) => row.cabinetId === cabinet.id && row.status !== 'NO_SHOW');
      const current = rows.find((row) => row.status === 'IN_PROGRESS')
        ?? rows.find((row) => row.startsAt <= now && row.endsAt > now && !['COMPLETED', 'NO_SHOW'].includes(row.status));
      const late = rows.find((row) => ['SCHEDULED', 'CONFIRMED', 'WAITING'].includes(row.status) && row.startsAt.getTime() < now.getTime() - 10 * 60_000 && row.endsAt > now);
      const row = current ?? late;
      const status = current ? 'busy' : late ? 'late' : 'free';
      return {
        id: cabinet.id,
        name: cabinet.name,
        status,
        patient: row ? `${row.patient.lastName} ${row.patient.firstName}` : null,
        service: row?.service?.name ?? null,
        minutesLate: late && !current ? Math.round((now.getTime() - late.startsAt.getTime()) / 60000) : 0,
      };
    });
    const payers = payments.length
      ? await this.prisma.patient.findMany({
        where: { id: { in: [...new Set(payments.map((row) => row.patientId))] } },
        select: { id: true, firstName: true, lastName: true },
      })
      : [];
    const payerName = new Map(payers.map((row) => [row.id, `${row.lastName} ${row.firstName}`]));
    const todayPayments = payments.filter((row) => row.paidAt >= start);
    const families = new Map<string, typeof plans>();
    for (const plan of plans) {
      const key = plan.familyKey ?? plan.id;
      families.set(key, [...(families.get(key) ?? []), plan]);
    }
    let accepted = 0;
    let open = 0;
    let abandoned = 0;
    let moneyLeft = 0;
    const callIds = new Map<string, { reason: string; amount: number }>();
    for (const group of families.values()) {
      if (group.some((plan) => plan.status === 'ACCEPTED' || plan.status === 'IN_PROGRESS' || plan.status === 'COMPLETED')) {
        accepted += 1;
        continue;
      }
      const chosen = group.find((plan) => plan.tier === 'OPTIMUM') ?? group[0];
      if (!chosen) continue;
      if (chosen.abandonedAt || chosen.status === 'REJECTED' || chosen.status === 'CANCELLED') {
        abandoned += 1;
        moneyLeft += num(chosen.totalPrice);
        callIds.set(chosen.patientId, { reason: 'Брошенный план', amount: num(chosen.totalPrice) });
      } else {
        open += 1;
        moneyLeft += num(chosen.totalPrice);
        callIds.set(chosen.patientId, { reason: 'План не принят', amount: num(chosen.totalPrice) });
      }
    }
    const debtMap = await this.debts([...callIds.keys()]);
    for (const [patientId, debt] of debtMap) {
      if (debt > 0) {
        const prev = callIds.get(patientId);
        callIds.set(patientId, { reason: prev ? `${prev.reason} · долг` : 'Долг', amount: Math.max(prev?.amount ?? 0, debt) });
      }
    }
    const people = callIds.size
      ? await this.prisma.patient.findMany({
        where: { id: { in: [...callIds.keys()] }, organizationId: orgId },
        select: { id: true, firstName: true, lastName: true, phone: true },
      })
      : [];
    return {
      updatedAt: now.toISOString(),
      chairs,
      revenueToday: todayPayments.reduce((sum, row) => sum + num(row.amount), 0),
      revenueMonth: payments.reduce((sum, row) => sum + num(row.amount), 0),
      ticker: payments.slice(0, 8).map((row) => ({
        id: `${row.patientId}-${row.paidAt.toISOString()}`,
        name: payerName.get(row.patientId) ?? 'Оплата',
        amount: num(row.amount),
        paidAt: row.paidAt,
      })),
      funnel: { accepted, open, abandoned, rate: accepted + open + abandoned ? Math.round((accepted / (accepted + open + abandoned)) * 100) : 0 },
      moneyLeft,
      calls: people.map((person) => ({
        patientId: person.id,
        name: `${person.lastName} ${person.firstName}`,
        phone: person.phone,
        ...(callIds.get(person.id) ?? { reason: 'Связаться', amount: 0 }),
      })).sort((a, b) => b.amount - a.amount),
    };
  }

  async kpis(orgId: string) {
    const month = monthWindow();
    const doctors = await this.prisma.employee.findMany({
      where: { user: { organizationId: orgId }, status: 'ACTIVE' },
      select: { id: true, firstName: true, lastName: true, specialization: true },
    });
    const [appointments, plans] = await Promise.all([
      this.prisma.appointment.findMany({
        where: { organizationId: orgId, doctorId: { not: null }, startsAt: { gte: new Date(Date.now() - 1000 * 60 * 60 * 24 * 60) } },
        select: { doctorId: true, startsAt: true, status: true, service: { select: { basePrice: true } } },
      }),
      this.prisma.treatmentPlan.findMany({
        where: { organizationId: orgId, doctorId: { not: null } },
        select: { doctorId: true, status: true, totalPrice: true, tier: true },
      }),
    ]);
    const goal = 22;
    const rows = doctors.map((doctor) => {
      const visits = appointments.filter((row) => row.doctorId === doctor.id && row.startsAt >= month.start && row.startsAt < month.end);
      const done = visits.filter((row) => row.status === 'COMPLETED');
      const noShows = visits.filter((row) => row.status === 'NO_SHOW').length;
      const revenue = done.reduce((sum, row) => sum + num(row.service?.basePrice), 0);
      const ownPlans = plans.filter((plan) => plan.doctorId === doctor.id && (!plan.tier || plan.tier === 'OPTIMUM'));
      const accepted = ownPlans.filter((plan) => ['ACCEPTED', 'IN_PROGRESS', 'COMPLETED'].includes(plan.status)).length;
      const proposed = ownPlans.filter((plan) => ['DRAFT', 'PROPOSED', 'REJECTED', 'CANCELLED'].includes(plan.status)).length;
      const conversion = accepted + proposed ? Math.round((accepted / (accepted + proposed)) * 100) : 0;
      const days = new Set(
        appointments
          .filter((row) => row.doctorId === doctor.id && row.status === 'COMPLETED')
          .map((row) => dayKey(row.startsAt)),
      );
      let streak = 0;
      const cursor = new Date();
      cursor.setHours(12, 0, 0, 0);
      if (!days.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
      while (days.has(dayKey(cursor))) {
        streak += 1;
        cursor.setDate(cursor.getDate() - 1);
      }
      return {
        id: doctor.id,
        name: `${doctor.lastName} ${doctor.firstName}`,
        specialty: doctor.specialization ?? 'Врач',
        done: done.length,
        scheduled: visits.length,
        noShows,
        revenue,
        conversion,
        accepted,
        streak,
        goal,
        progress: Math.min(100, Math.round((done.length / goal) * 100)),
      };
    }).sort((a, b) => b.conversion - a.conversion || b.revenue - a.revenue);
    return { goal, month: month.start.toISOString(), doctors: rows };
  }

  async retention(orgId: string) {
    const now = new Date();
    const horizon = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
    const abandonBefore = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const [patients, visits, plans, sent] = await Promise.all([
      this.prisma.patient.findMany({
        where: { organizationId: orgId, isActive: true },
        select: { id: true, firstName: true, lastName: true, phone: true, birthDate: true },
      }),
      this.prisma.appointment.findMany({
        where: { organizationId: orgId, status: 'COMPLETED' },
        include: { service: { select: { name: true, code: true } } },
        orderBy: { startsAt: 'desc' },
      }),
      this.prisma.treatmentPlan.findMany({
        where: { organizationId: orgId, status: { in: ['DRAFT', 'PROPOSED', 'REJECTED'] } },
        select: { id: true, patientId: true, title: true, totalPrice: true, tier: true, abandonedAt: true, presentedAt: true, createdAt: true },
      }),
      this.prisma.reminder.findMany({
        where: { organizationId: orgId, message: { startsWith: '[автопилот]' } },
        orderBy: { createdAt: 'desc' },
        take: 40,
      }),
    ]);
    const byPatient = new Map(patients.map((patient) => [patient.id, patient]));
    const lastVisit = new Map<string, Date>();
    const lastHygiene = new Map<string, Date>();
    for (const visit of visits) {
      if (!lastVisit.has(visit.patientId)) lastVisit.set(visit.patientId, visit.startsAt);
      const name = `${visit.service?.name ?? ''} ${visit.service?.code ?? ''}`.toLowerCase();
      if ((name.includes('гигиен') || name.includes('hygiene')) && !lastHygiene.has(visit.patientId)) lastHygiene.set(visit.patientId, visit.startsAt);
    }
    type QueueItem = {
      id: string;
      patientId: string;
      name: string;
      phone: string | null;
      rule: 'hygiene' | 'abandoned' | 'birthday';
      channel: 'TELEGRAM' | 'WHATSAPP';
      message: string;
      status: 'queued' | 'sent';
    };
    const queue: QueueItem[] = [];
    for (const patient of patients) {
      const hygieneAt = lastHygiene.get(patient.id) ?? lastVisit.get(patient.id);
      if (hygieneAt && hygieneAt < horizon) {
        queue.push({
          id: `hygiene:${patient.id}`,
          patientId: patient.id,
          name: `${patient.lastName} ${patient.firstName}`,
          phone: patient.phone,
          rule: 'hygiene',
          channel: 'WHATSAPP',
          message: `${patient.firstName}, пора на профессиональную гигиену. В Седракович Дент есть окно на этой неделе.`,
          status: 'queued',
        });
      }
      if (patient.birthDate && this.birthdaySoon(patient.birthDate, now)) {
        queue.push({
          id: `birthday:${patient.id}`,
          patientId: patient.id,
          name: `${patient.lastName} ${patient.firstName}`,
          phone: patient.phone,
          rule: 'birthday',
          channel: 'TELEGRAM',
          message: `${patient.firstName}, с днём рождения. В клинике для вас осмотр и гигиена в подарок к записи.`,
          status: 'queued',
        });
      }
    }
    const seenPlan = new Set<string>();
    for (const plan of plans) {
      const when = plan.abandonedAt ?? plan.presentedAt ?? plan.createdAt;
      const abandoned = Boolean(plan.abandonedAt) || when < abandonBefore;
      if (!abandoned || (plan.tier && plan.tier !== 'OPTIMUM')) continue;
      if (seenPlan.has(plan.patientId)) continue;
      seenPlan.add(plan.patientId);
      const patient = byPatient.get(plan.patientId);
      if (!patient) continue;
      queue.push({
        id: `abandoned:${plan.id}`,
        patientId: patient.id,
        name: `${patient.lastName} ${patient.firstName}`,
        phone: patient.phone,
        rule: 'abandoned',
        channel: 'TELEGRAM',
        message: `${patient.firstName}, план «${plan.title}» всё ещё открыт. Можем коротко созвониться и оставить только нужный этап.`,
        status: 'queued',
      });
    }
    const sentToday = sent.filter((row) => row.sentAt && row.sentAt >= dayWindow(now).start).length;
    return {
      demo: true,
      rules: [
        { id: 'hygiene', title: 'Гигиена через 6 месяцев', text: 'Если с последней чистки прошло больше полугода', count: queue.filter((row) => row.rule === 'hygiene').length },
        { id: 'abandoned', title: 'План молчит 14 дней', text: 'Предложенный или брошенный план без согласия', count: queue.filter((row) => row.rule === 'abandoned').length },
        { id: 'birthday', title: 'День рождения', text: 'За 7 дней до даты — тёплое сообщение', count: queue.filter((row) => row.rule === 'birthday').length },
      ],
      queue,
      sent: sent.map((row) => ({
        id: row.id,
        patientId: row.patientId,
        channel: row.channel,
        message: row.message.replace(/^\[автопилот\]\s*/, ''),
        sentAt: row.sentAt,
        status: row.status,
      })),
      stats: { queued: queue.length, sentToday, sentMonth: sent.filter((row) => row.sentAt && row.sentAt >= monthWindow(now).start).length },
    };
  }

  async sendRetention(orgId: string, ids: string[]) {
    const snapshot = await this.retention(orgId);
    const chosen = snapshot.queue.filter((row) => !ids.length || ids.includes(row.id));
    if (!chosen.length) throw new BadRequestException('В очереди нет таких сообщений');
    const created: { id: string; channel: string; name: string; demo: boolean }[] = [];
    for (const row of chosen) {
      const reminder = await this.prisma.reminder.create({
        data: {
          organizationId: orgId,
          patientId: row.patientId,
          channel: row.channel,
          message: `[автопилот] ${row.message}`,
          scheduledAt: new Date(),
          sentAt: new Date(),
          status: 'SENT',
        },
      });
      created.push({ id: reminder.id, channel: row.channel, name: row.name, demo: true });
    }
    return { demo: true, sent: created.length, items: created };
  }

  async copilot(orgId: string, patientId: string, note = '') {
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, organizationId: orgId },
      include: { toothSurfaces: true },
    });
    if (!patient) throw new NotFoundException('Пациент не найден');
    const text = note.toLowerCase();
    const findings = patient.toothSurfaces.filter((row) => row.condition !== 'HEALTHY' && row.layer === 'PATHOLOGY');
    const diagnoses: { code: string; title: string; why: string }[] = [];
    const caries = findings.filter((row) => row.condition === 'CARIES');
    if (caries.length || text.includes('кариес') || text.includes('сладк')) {
      diagnoses.push({ code: 'K02.1', title: 'Кариес дентина', why: caries.length ? `Полости: ${[...new Set(caries.map((row) => row.toothNum))].join(', ')}` : 'Жалоба в записи' });
    }
    if (findings.some((row) => row.condition === 'ROOT_CANAL') || text.includes('ночн') || text.includes('боль')) {
      diagnoses.push({ code: 'K04.0', title: 'Пульпит', why: 'Боль или следы эндодонтии в формуле' });
    }
    if (findings.some((row) => row.condition === 'TO_EXTRACT') || text.includes('удал')) {
      diagnoses.push({ code: 'K08.1', title: 'Потеря зуба / удаление', why: 'Зуб отмечен к удалению' });
    }
    if (findings.some((row) => row.condition === 'MISSING' || row.condition === 'IMPLANT')) {
      diagnoses.push({ code: 'K08.1', title: 'Отсутствует зуб', why: 'В формуле есть отсутствующий зуб или имплант' });
    }
    if (!diagnoses.length) diagnoses.push({ code: 'Z01.2', title: 'Стоматологический осмотр', why: 'Острых находок в формуле нет' });
    const variants = [
      { tier: 'Эконом', title: 'Закрыть полости', price: Math.max(5500, caries.length * 5500), kit: KITS.filling, note: 'Только то, что болит' },
      { tier: 'Оптимум', title: caries.length ? 'Пломбы и коронка на самый слабый зуб' : 'Осмотр и гигиена', price: caries.length ? 11000 + 25200 : 4500, kit: [...KITS.filling, ...KITS.crown], note: 'Рекомендуемый путь' },
      { tier: 'Премиум', title: 'Канал, коронка, отбеливание', price: 12000 + 32200 + 18000, kit: [...KITS.endo, ...KITS.crown, ...KITS.hygiene], note: 'Если зуб уже болит ночью' },
    ];
    const teeth = [...new Set(caries.map((row) => row.toothNum))];
    const explanation = teeth.length
      ? `${patient.firstName}, на зубах ${teeth.join(' и ')} есть полости. Сначала убираем кариес, потом, если стенка тонкая, закрываем зуб коронкой. Это не срочная операция, но откладывать до боли не стоит.`
      : `${patient.firstName}, по формуле сейчас спокойно. Имеет смысл осмотр и гигиена, а план соберём, если появится жалоба.`;
    return {
      demo: true,
      label: 'Демо-модель. Это не медицинское заключение и не замена осмотру.',
      patient: `${patient.lastName} ${patient.firstName}`,
      diagnoses,
      variants,
      explanation,
    };
  }

  async portal(orgId: string, patientId: string) {
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, organizationId: orgId },
    });
    if (!patient) throw new NotFoundException('Пациент не найден');
    const [plans, appointments, invoices, studies, reminders, thread, services, cabinets] = await Promise.all([
      this.prisma.treatmentPlan.findMany({
        where: { organizationId: orgId, patientId, OR: [{ tier: 'OPTIMUM' }, { tier: null }] },
        include: { phases: { include: { items: true }, orderBy: { sortOrder: 'asc' } }, items: true },
        orderBy: { updatedAt: 'desc' },
        take: 2,
      }),
      this.prisma.appointment.findMany({
        where: { organizationId: orgId, patientId },
        include: { service: true, doctor: true, cabinet: true },
        orderBy: { startsAt: 'desc' },
        take: 8,
      }),
      this.prisma.invoice.findMany({
        where: { organizationId: orgId, patientId },
        orderBy: { createdAt: 'desc' },
        take: 6,
      }),
      this.prisma.imagingStudy.findMany({
        where: { patientId },
        orderBy: { takenAt: 'desc' },
        take: 6,
        select: { id: true, type: true, fileUrl: true, takenAt: true },
      }),
      this.prisma.reminder.findMany({
        where: { organizationId: orgId, patientId },
        orderBy: { scheduledAt: 'desc' },
        take: 5,
      }),
      this.prisma.communicationThread.findFirst({
        where: { organizationId: orgId, patientId, subject: 'Портал пациента' },
        include: { messages: { orderBy: { sentAt: 'asc' }, take: 20 } },
      }),
      this.prisma.service.findMany({
        where: { organizationId: orgId, isActive: true, parentId: { not: null } },
        orderBy: { sortOrder: 'asc' },
        take: 8,
        select: { id: true, name: true, basePrice: true, durationMin: true },
      }),
      this.prisma.cabinet.findMany({ where: { branch: { organizationId: orgId }, isActive: true }, take: 1 }),
    ]);
    const slots = await this.portalSlots(orgId, cabinets[0]?.id);
    const plan = plans[0];
    return {
      demoChat: true,
      code: checkCode(patient.id),
      patient: {
        id: patient.id,
        firstName: patient.firstName,
        lastName: patient.lastName,
        phone: patient.phone,
        allergies: patient.allergies,
      },
      plan: plan ? {
        id: plan.id,
        title: plan.title,
        status: plan.status,
        total: num(plan.totalPrice),
        phases: plan.phases.map((phase) => ({ id: phase.id, title: phase.title, items: phase.items.map((item) => item.title) })),
      } : null,
      appointments: appointments.map((row) => ({
        id: row.id,
        startsAt: row.startsAt,
        status: row.status,
        service: row.service?.name ?? 'Приём',
        doctor: row.doctor ? `${row.doctor.lastName} ${row.doctor.firstName}` : null,
        cabinet: row.cabinet?.name ?? null,
      })),
      payments: invoices.map((row) => ({
        id: row.id,
        number: row.number,
        status: row.status,
        total: num(row.totalAmount),
        paid: num(row.paidAmount),
        left: Math.max(0, num(row.totalAmount) - num(row.paidAmount)),
      })),
      photos: studies,
      reminders: reminders.map((row) => ({ id: row.id, channel: row.channel, message: row.message.replace(/^\[автопилот\]\s*/, ''), status: row.status, scheduledAt: row.scheduledAt })),
      messages: thread?.messages.map((row) => ({ id: row.id, direction: row.direction, body: row.body, sentAt: row.sentAt })) ?? [],
      services: services.map((row) => ({ id: row.id, name: row.name, price: num(row.basePrice), durationMin: row.durationMin })),
      slots,
    };
  }

  async bookPortal(orgId: string, patientId: string, startsAt: string, serviceId?: string) {
    const cabinet = await this.prisma.cabinet.findFirst({ where: { branch: { organizationId: orgId }, isActive: true } });
    const doctor = await this.prisma.employee.findFirst({ where: { user: { organizationId: orgId }, status: 'ACTIVE' }, orderBy: { createdAt: 'asc' } });
    const appointment = await this.workspace.book(orgId, {
      patientId,
      startsAt,
      durationMin: 30,
      cabinetId: cabinet?.id,
      doctorId: doctor?.id,
      serviceId,
    });
    return appointment;
  }

  async chat(orgId: string, patientId: string, body: string) {
    const text = body.trim();
    if (!text) throw new BadRequestException('Пустое сообщение');
    const patient = await this.prisma.patient.findFirst({ where: { id: patientId, organizationId: orgId } });
    if (!patient) throw new NotFoundException('Пациент не найден');
    let thread = await this.prisma.communicationThread.findFirst({
      where: { organizationId: orgId, patientId, subject: 'Портал пациента' },
    });
    if (!thread) {
      thread = await this.prisma.communicationThread.create({
        data: { organizationId: orgId, patientId, channel: 'TELEGRAM', subject: 'Портал пациента' },
      });
    }
    await this.prisma.communicationMessage.create({ data: { threadId: thread.id, direction: 'in', body: text } });
    const reply = await this.prisma.communicationMessage.create({
      data: {
        threadId: thread.id,
        direction: 'out',
        body: 'Демо-чат: сообщение увидит администратор на стойке. Это не отправка в Telegram.',
      },
    });
    await this.prisma.communicationThread.update({ where: { id: thread.id }, data: { lastMessageAt: new Date() } });
    return { demo: true, id: reply.id };
  }

  async checkIn(orgId: string, code: string) {
    const token = code.trim().toUpperCase();
    if (!token) throw new BadRequestException('Нужен код с карточки');
    const patients = await this.prisma.patient.findMany({
      where: { organizationId: orgId, isActive: true },
      select: { id: true, firstName: true, lastName: true },
    });
    const patient = patients.find((row) => checkCode(row.id) === token || row.id === code.trim());
    if (!patient) throw new NotFoundException('Такого кода нет');
    const { start, end } = dayWindow();
    const appointment = await this.prisma.appointment.findFirst({
      where: {
        organizationId: orgId,
        patientId: patient.id,
        startsAt: { gte: start, lt: end },
        status: { in: ['SCHEDULED', 'CONFIRMED', 'WAITING'] },
      },
      orderBy: { startsAt: 'asc' },
    });
    if (!appointment) throw new BadRequestException('На сегодня записи нет');
    const updated = await this.prisma.appointment.update({
      where: { id: appointment.id },
      data: { status: 'WAITING' },
    });
    return {
      ok: true,
      appointmentId: updated.id,
      patient: `${patient.lastName} ${patient.firstName}`,
      startsAt: updated.startsAt,
      status: updated.status,
    };
  }

  async onboarding(orgId: string) {
    const org = await this.prisma.organization.findUnique({ where: { id: orgId } });
    if (!org) throw new NotFoundException('Клиника не найдена');
    const [branches, cabinets, doctors, services] = await Promise.all([
      this.prisma.branch.count({ where: { organizationId: orgId } }),
      this.prisma.cabinet.count({ where: { branch: { organizationId: orgId }, isActive: true } }),
      this.prisma.employee.count({ where: { user: { organizationId: orgId }, status: 'ACTIVE' } }),
      this.prisma.service.count({ where: { organizationId: orgId, isActive: true } }),
    ]);
    return {
      name: org.name,
      phone: org.phone,
      email: org.email,
      inn: org.inn,
      branches,
      cabinets,
      doctors,
      services,
    };
  }

  async saveOnboarding(orgId: string, body: { name?: string; phone?: string; email?: string; inn?: string }) {
    const data: { name?: string; phone?: string; email?: string; inn?: string } = {};
    if (body.name?.trim()) data.name = body.name.trim();
    if (body.phone !== undefined) data.phone = body.phone.trim();
    if (body.email !== undefined) data.email = body.email.trim();
    if (body.inn !== undefined) data.inn = body.inn.trim();
    const org = await this.prisma.organization.update({ where: { id: orgId }, data });
    return { name: org.name, phone: org.phone, email: org.email, inn: org.inn };
  }

  async importRows(orgId: string, source: string, rows: { firstName?: string; lastName?: string; middleName?: string; phone?: string; email?: string; birthDate?: string }[]) {
    let created = 0;
    let skipped = 0;
    const items: { id: string; name: string }[] = [];
    for (const row of rows.slice(0, 200)) {
      const firstName = row.firstName?.trim();
      const lastName = row.lastName?.trim();
      if (!firstName || !lastName) {
        skipped += 1;
        continue;
      }
      const phone = row.phone?.trim() || null;
      const existing = await this.prisma.patient.findFirst({
        where: {
          organizationId: orgId,
          OR: [
            ...(phone ? [{ phone }] : []),
            { firstName: { equals: firstName, mode: 'insensitive' }, lastName: { equals: lastName, mode: 'insensitive' } },
          ],
        },
      });
      if (existing) {
        skipped += 1;
        continue;
      }
      const email = row.email?.includes('@') ? row.email.trim() : null;
      const birth = row.birthDate ? new Date(row.birthDate) : null;
      const patient = await this.prisma.patient.create({
        data: {
          organizationId: orgId,
          firstName,
          lastName,
          middleName: row.middleName?.trim() || null,
          phone,
          email,
          birthDate: birth && !Number.isNaN(+birth) ? birth : null,
          source: source === 'DENTAL4WINDOWS' ? 'Dental4Windows' : 'IDENT',
          notes: 'Импорт, демо-мастер',
        },
      });
      created += 1;
      items.push({ id: patient.id, name: `${patient.lastName} ${patient.firstName}` });
    }
    return { created, skipped, items, source };
  }

  private async debts(ids: string[]) {
    const map = new Map<string, number>();
    if (!ids.length) return map;
    const invoices = await this.prisma.invoice.findMany({
      where: { patientId: { in: ids }, status: { in: ['ISSUED', 'PARTIAL'] } },
    });
    for (const invoice of invoices) {
      map.set(invoice.patientId, (map.get(invoice.patientId) ?? 0) + Math.max(0, num(invoice.totalAmount) - num(invoice.paidAmount)));
    }
    return map;
  }

  private emptySlots(cabinets: string[], appointments: { cabinet: string; startsAt: Date; endsAt: Date; status: string }[]) {
    const slots: { cabinet: string; startsAt: string }[] = [];
    const start = dayWindow().start;
    for (const cabinet of cabinets) {
      for (let hour = 9; hour <= 18; hour += 1) {
        const at = new Date(start);
        at.setHours(hour, 0, 0, 0);
        const endAt = new Date(at.getTime() + 60 * 60_000);
        const busy = appointments.some((row) => row.cabinet === cabinet && row.status !== 'NO_SHOW' && row.startsAt < endAt && row.endsAt > at);
        if (!busy) slots.push({ cabinet, startsAt: at.toISOString() });
      }
    }
    return slots.slice(0, 8);
  }

  private birthdaySoon(birth: Date, now: Date) {
    const next = new Date(now.getFullYear(), birth.getMonth(), birth.getDate());
    if (next < dayWindow(now).start) next.setFullYear(now.getFullYear() + 1);
    const diff = (next.getTime() - dayWindow(now).start.getTime()) / 86_400_000;
    return diff >= 0 && diff <= 7;
  }

  private async portalSlots(orgId: string, cabinetId?: string) {
    const slots: { startsAt: string; label: string }[] = [];
    const start = dayWindow();
    for (let day = 1; day <= 4 && slots.length < 6; day += 1) {
      for (const hour of [10, 13, 16, 18]) {
        const at = new Date(start.start);
        at.setDate(at.getDate() + day);
        at.setHours(hour, 0, 0, 0);
        const endAt = new Date(at.getTime() + 30 * 60_000);
        const clash = await this.prisma.appointment.findFirst({
          where: {
            organizationId: orgId,
            status: { notIn: ['CANCELLED', 'NO_SHOW'] },
            startsAt: { lt: endAt },
            endsAt: { gt: at },
            ...(cabinetId ? { cabinetId } : {}),
          },
        });
        if (!clash) {
          slots.push({
            startsAt: at.toISOString(),
            label: at.toLocaleString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
          });
        }
        if (slots.length >= 6) break;
      }
    }
    return slots;
  }
}
