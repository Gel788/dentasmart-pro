import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const SOURCES = ['Звонок', 'ПроДокторов', 'СберЗдоровье', 'Сайт', 'Рекомендация'];

function csv(rows: Record<string, string | number>[]) {
  const keys = rows[0] ? Object.keys(rows[0]) : ['пусто'];
  const body = rows.length
    ? rows.map((row) => keys.map((key) => `"${String(row[key] ?? '').replace(/"/g, '""')}"`).join(';'))
    : [];
  return `\uFEFF${[keys.join(';'), ...body].join('\n')}`;
}

@Injectable()
export class MarketService {
  constructor(private readonly prisma: PrismaService) {}

  private async orgReady(orgId: string) {
    const [patient, branch, doctor, service] = await Promise.all([
      this.prisma.patient.findFirst({ where: { organizationId: orgId }, orderBy: { createdAt: 'asc' } }),
      this.prisma.branch.findFirst({ where: { organizationId: orgId } }),
      this.prisma.employee.findFirst({ where: { user: { organizationId: orgId } } }),
      this.prisma.service.findFirst({ where: { organizationId: orgId, isActive: true } }),
    ]);
    return { patient, branch, doctor, service };
  }

  async seed(orgId: string) {
    const existing = await this.prisma.lead.count({ where: { organizationId: orgId } });
    if (existing > 0) {
      const bare = await this.prisma.labOrder.findFirst({ where: { organizationId: orgId, labName: null } });
      if (bare) {
        await this.prisma.labOrder.update({
          where: { id: bare.id },
          data: {
            labName: 'Циркон-Лаб',
            technician: 'Игорь Семёнов',
            costAmount: bare.costAmount ?? 8400,
            fittingAt: bare.fittingAt ?? new Date(Date.now() + 86_400_000),
          },
        });
      }
      return;
    }
    const { patient, branch, doctor, service } = await this.orgReady(orgId);
    if (!patient || !branch) return;
    const tomorrow = new Date(Date.now() + 86_400_000);
    const lead = await this.prisma.lead.create({
      data: {
        organizationId: orgId,
        name: 'Ольга Новикова',
        phone: '+79001112233',
        source: 'ПроДокторов',
        status: 'CALLBACK',
        callbackAt: new Date(Date.now() + 3_600_000),
      },
    });
    await this.prisma.callRecord.create({
      data: {
        organizationId: orgId,
        patientId: patient.id,
        phone: patient.phone || lead.phone,
        missed: true,
        durationSec: 0,
        transcript: 'Пропущенный звонок. Задача: перезвонить.',
        leadId: lead.id,
      },
    });
    await this.prisma.lead.createMany({
      data: [
        { organizationId: orgId, name: 'Игорь Панов', phone: '+79004445566', source: 'Звонок', status: 'REFUSED', refusalReason: 'Дорого' },
        { organizationId: orgId, name: 'Мария Соколова', phone: '+79007778899', source: 'Сайт', status: 'BOOKED', patientId: patient.id },
      ],
    });
    await this.prisma.warrantyCase.create({
      data: {
        organizationId: orgId,
        patientId: patient.id,
        title: 'Скол коронки',
        toothNum: 16,
        status: 'REDO',
        reason: 'Скол через 4 месяца, в гарантии',
        doctorName: doctor ? `${doctor.lastName} ${doctor.firstName}` : 'Врач',
        cost: 0,
      },
    });
    const insurer = await this.prisma.insurer.upsert({
      where: { organizationId_name: { organizationId: orgId, name: 'СОГАЗ' } },
      update: {},
      create: { organizationId: orgId, name: 'СОГАЗ' },
    });
    await this.prisma.insurancePolicy.create({
      data: {
        organizationId: orgId,
        patientId: patient.id,
        insurerId: insurer.id,
        number: 'ДМС-20481',
        letterNumber: 'ГП-1042',
        validTo: new Date(Date.now() + 180 * 86_400_000),
        limitAmount: 80000,
      },
    });
    await this.prisma.insurerBill.create({
      data: {
        organizationId: orgId,
        insurerId: insurer.id,
        patientName: `${patient.lastName} ${patient.firstName}`,
        number: 'РС-17',
        amount: 25200,
        status: 'DRAFT',
      },
    });
    await this.prisma.apiKey.upsert({
      where: { token: `sd_demo_${orgId.slice(0, 10)}` },
      update: {},
      create: { organizationId: orgId, name: 'Демо-ключ', token: `sd_demo_${orgId.slice(0, 10)}` },
    });
    if (doctor) {
      await this.prisma.patient.update({ where: { id: patient.id }, data: { curatorId: doctor.id, source: patient.source || 'Рекомендация' } });
    }
    await this.prisma.orthoChart.upsert({
      where: { patientId: patient.id },
      update: {},
      create: {
        organizationId: orgId,
        patientId: patient.id,
        classAngle: 'II',
        notes: 'Скученность фронта, элайнеры',
        monthlyFee: 12000,
        contractSigned: false,
      },
    });
    const labCount = await this.prisma.labOrder.count({ where: { organizationId: orgId } });
    if (!labCount) {
      await this.prisma.labOrder.create({
        data: {
          organizationId: orgId,
          patientId: patient.id,
          doctorId: doctor?.id,
          title: 'Коронка Zr, зуб 16',
          status: 'IN_PROGRESS',
          labName: 'Циркон-Лаб',
          technician: 'Игорь Семёнов',
          shade: 'A2',
          dueAt: tomorrow,
          fittingAt: tomorrow,
          costAmount: 8400,
        },
      });
    }
    const payment = await this.prisma.payment.findFirst({
      where: { organizationId: orgId },
      include: { invoice: { include: { items: true } }, allocations: true },
    });
    const item = payment?.invoice?.items[0];
    if (payment && item && payment.allocations.length === 0) {
      const share = Math.min(Number(payment.amount), Number(item.price));
      await this.prisma.paymentAllocation.create({
        data: { paymentId: payment.id, invoiceItemId: item.id, amount: share },
      });
    }
    const open = await this.prisma.appointment.findFirst({
      where: { organizationId: orgId, status: 'COMPLETED', OR: [{ visitNote: null }, { visitNote: { diagnosis: '' } }] },
    });
    if (!open && service && doctor) {
      const start = new Date(Date.now() - 3_600_000);
      const visit = await this.prisma.appointment.create({
        data: {
          organizationId: orgId,
          branchId: branch.id,
          doctorId: doctor.id,
          patientId: patient.id,
          serviceId: service.id,
          startsAt: start,
          endsAt: new Date(start.getTime() + 30 * 60_000),
          status: 'COMPLETED',
        },
      });
      await this.prisma.visitNote.create({
        data: { appointmentId: visit.id, complaints: 'Осмотр', diagnosis: '', treatment: '' },
      });
    }
  }

  async leads(orgId: string) {
    await this.seed(orgId);
    const rows = await this.prisma.lead.findMany({
      where: { organizationId: orgId },
      include: { calls: true, patient: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { createdAt: 'desc' },
    });
    const total = rows.length || 1;
    const booked = rows.filter((row) => row.status === 'BOOKED' || row.status === 'VISITED').length;
    const bySource = SOURCES.map((source) => {
      const slice = rows.filter((row) => row.source === source);
      const won = slice.filter((row) => row.status === 'BOOKED' || row.status === 'VISITED').length;
      return { source, total: slice.length, won, conversion: slice.length ? Math.round((won / slice.length) * 100) : 0 };
    });
    return { items: rows, conversion: Math.round((booked / total) * 100), bySource };
  }

  saveLead(orgId: string, body: { name: string; phone: string; source?: string; status?: string; refusalReason?: string; callbackAt?: string }) {
    if (!body.name?.trim() || !body.phone?.trim()) throw new BadRequestException('Нужны имя и телефон');
    return this.prisma.lead.create({
      data: {
        organizationId: orgId,
        name: body.name.trim(),
        phone: body.phone.trim(),
        source: body.source || 'Звонок',
        status: body.status || 'NEW',
        refusalReason: body.refusalReason || null,
        callbackAt: body.callbackAt ? new Date(body.callbackAt) : null,
      },
    });
  }

  async updateLead(orgId: string, id: string, body: { status?: string; refusalReason?: string; patientId?: string }) {
    const lead = await this.prisma.lead.findFirst({ where: { id, organizationId: orgId } });
    if (!lead) throw new NotFoundException('Лид не найден');
    if (body.status === 'REFUSED' && !body.refusalReason && !lead.refusalReason) {
      throw new BadRequestException('Укажите причину отказа');
    }
    return this.prisma.lead.update({
      where: { id },
      data: {
        status: body.status || undefined,
        refusalReason: body.refusalReason,
        patientId: body.patientId,
      },
    });
  }

  async missedCall(orgId: string, body: { phone: string; name?: string }) {
    if (!body.phone?.trim()) throw new BadRequestException('Нужен телефон');
    const patient = await this.prisma.patient.findFirst({
      where: { organizationId: orgId, phone: { contains: body.phone.replace(/\D/g, '').slice(-10) } },
    });
    const lead = await this.prisma.lead.create({
      data: {
        organizationId: orgId,
        name: body.name?.trim() || patient?.lastName || 'Неизвестный номер',
        phone: body.phone.trim(),
        source: 'Звонок',
        status: 'CALLBACK',
        patientId: patient?.id,
        callbackAt: new Date(Date.now() + 15 * 60_000),
      },
    });
    const call = await this.prisma.callRecord.create({
      data: {
        organizationId: orgId,
        patientId: patient?.id,
        phone: body.phone.trim(),
        missed: true,
        durationSec: 0,
        transcript: 'Пропущенный звонок. Создана задача перезвонить.',
        leadId: lead.id,
      },
    });
    return { lead, call, patientId: patient?.id ?? null };
  }

  async warranty(orgId: string) {
    await this.seed(orgId);
    const items = await this.prisma.warrantyCase.findMany({
      where: { organizationId: orgId },
      include: { patient: { select: { firstName: true, lastName: true } } },
      orderBy: { openedAt: 'desc' },
    });
    const byDoctor = new Map<string, { doctor: string; open: number; cost: number }>();
    for (const row of items) {
      const key = row.doctorName || 'Без врача';
      const bucket = byDoctor.get(key) ?? { doctor: key, open: 0, cost: 0 };
      if (row.status !== 'CLOSED') bucket.open += 1;
      bucket.cost += Number(row.cost);
      byDoctor.set(key, bucket);
    }
    return { items, byDoctor: [...byDoctor.values()] };
  }

  saveWarranty(orgId: string, body: { patientId: string; title: string; toothNum?: number; reason: string; doctorName?: string; cost?: number; status?: string }) {
    if (!body.patientId || !body.title?.trim()) throw new BadRequestException('Нужны пациент и работа');
    return this.prisma.warrantyCase.create({
      data: {
        organizationId: orgId,
        patientId: body.patientId,
        title: body.title.trim(),
        toothNum: body.toothNum,
        reason: body.reason || 'Гарантийный случай',
        doctorName: body.doctorName,
        cost: body.cost ?? 0,
        status: body.status || 'OPEN',
      },
    });
  }

  async insurance(orgId: string) {
    await this.seed(orgId);
    const [insurers, policies, bills] = await Promise.all([
      this.prisma.insurer.findMany({ where: { organizationId: orgId }, orderBy: { name: 'asc' } }),
      this.prisma.insurancePolicy.findMany({
        where: { organizationId: orgId },
        include: { insurer: true, patient: { select: { firstName: true, lastName: true } } },
      }),
      this.prisma.insurerBill.findMany({ where: { organizationId: orgId }, include: { insurer: true }, orderBy: { createdAt: 'desc' } }),
    ]);
    return { insurers, policies, bills };
  }

  saveInsurer(orgId: string, name: string) {
    if (!name?.trim()) throw new BadRequestException('Нужно название компании');
    return this.prisma.insurer.upsert({
      where: { organizationId_name: { organizationId: orgId, name: name.trim() } },
      update: {},
      create: { organizationId: orgId, name: name.trim() },
    });
  }

  async savePolicy(orgId: string, body: { patientId: string; insurerId: string; number: string; letterNumber?: string; limitAmount?: number; validTo?: string }) {
    if (!body.patientId || !body.insurerId || !body.number) throw new BadRequestException('Нужны пациент, компания и номер полиса');
    return this.prisma.insurancePolicy.create({
      data: {
        organizationId: orgId,
        patientId: body.patientId,
        insurerId: body.insurerId,
        number: body.number,
        letterNumber: body.letterNumber,
        limitAmount: body.limitAmount ?? 0,
        validTo: body.validTo ? new Date(body.validTo) : undefined,
      },
    });
  }

  saveBill(orgId: string, body: { insurerId: string; patientName: string; amount: number }) {
    return this.prisma.insurerBill.create({
      data: {
        organizationId: orgId,
        insurerId: body.insurerId,
        patientName: body.patientName,
        number: `РС-${Date.now().toString().slice(-4)}`,
        amount: body.amount,
        status: 'DRAFT',
      },
    });
  }

  async billStatus(orgId: string, id: string, status: string) {
    const bill = await this.prisma.insurerBill.findFirst({ where: { id, organizationId: orgId } });
    if (!bill) throw new NotFoundException('Счёт страховой не найден');
    return this.prisma.insurerBill.update({ where: { id }, data: { status } });
  }

  async quality(orgId: string) {
    await this.seed(orgId);
    const [notes, payments, patients] = await Promise.all([
      this.prisma.appointment.findMany({
        where: {
          organizationId: orgId,
          status: 'COMPLETED',
          OR: [{ visitNote: null }, { visitNote: { diagnosis: '' } }, { visitNote: { treatment: '' } }],
        },
        include: { patient: true, visitNote: true, doctor: true },
        orderBy: { startsAt: 'desc' },
        take: 30,
      }),
      this.prisma.payment.findMany({
        where: { organizationId: orgId },
        include: { invoice: { include: { patient: true } } },
      }),
      this.prisma.patient.findMany({ where: { organizationId: orgId }, select: { id: true, source: true } }),
    ]);
    const sourceOf = new Map(patients.map((row) => [row.id, row.source || 'Не указан']));
    const money = new Map<string, number>();
    for (const payment of payments) {
      const source = sourceOf.get(payment.invoice?.patientId ?? payment.patientId) || 'Не указан';
      money.set(source, (money.get(source) ?? 0) + Number(payment.amount));
    }
    return {
      unfilled: notes.map((row) => ({
        id: row.id,
        at: row.startsAt,
        patient: `${row.patient.lastName} ${row.patient.firstName}`,
        doctor: row.doctor ? `${row.doctor.lastName} ${row.doctor.firstName}` : '—',
        missing: !row.visitNote?.diagnosis ? 'диагноз' : 'лечение',
      })),
      sources: [...money.entries()].map(([source, revenue]) => ({ source, revenue })).sort((a, b) => b.revenue - a.revenue),
    };
  }

  private async linkFaces(orgId: string, patientId: string) {
    const patient = await this.prisma.patient.findFirst({ where: { id: patientId, organizationId: orgId } });
    if (!patient) return;
    if (patient.phone) {
      await this.prisma.callRecord.updateMany({
        where: { organizationId: orgId, patientId: null, phone: patient.phone },
        data: { patientId },
      });
    }
    const showcase = await this.prisma.warrantyCase.findFirst({ where: { organizationId: orgId, patientId } });
    if (!showcase) return;
    const calls = await this.prisma.callRecord.count({ where: { patientId } });
    if (!calls) {
      await this.prisma.callRecord.create({
        data: {
          organizationId: orgId,
          patientId,
          phone: patient.phone || '+79000000000',
          durationSec: 84,
          missed: true,
          transcript: 'Пропущенный звонок. Задача перезвонить уже стоит в лидах.',
        },
      });
    }
    const allocated = await this.prisma.paymentAllocation.count({ where: { payment: { patientId } } });
    if (allocated) return;
    const item = await this.prisma.invoiceItem.findFirst({ where: { invoice: { patientId, organizationId: orgId } } });
    const payment = await this.prisma.payment.findFirst({ where: { patientId, organizationId: orgId } });
    if (!item || !payment) return;
    const share = Math.min(Number(payment.amount), Number(item.price));
    if (share <= 0) return;
    await this.prisma.paymentAllocation.create({ data: { paymentId: payment.id, invoiceItemId: item.id, amount: share } });
  }

  async patientDesk(orgId: string, patientId: string) {
    await this.seed(orgId);
    await this.linkFaces(orgId, patientId);
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, organizationId: orgId },
      include: { curator: true, orthoChart: true },
    });
    if (!patient) throw new NotFoundException('Пациент не найден');
    const [calls, allocations, threads, consents, employees, leads] = await Promise.all([
      this.prisma.callRecord.findMany({ where: { organizationId: orgId, OR: [{ patientId }, { phone: patient.phone ?? '—' }] }, orderBy: { createdAt: 'desc' }, take: 8 }),
      this.prisma.paymentAllocation.findMany({
        where: { payment: { patientId, organizationId: orgId } },
        include: { invoiceItem: true, payment: true },
        orderBy: { payment: { paidAt: 'desc' } },
      }),
      this.prisma.communicationThread.findMany({
        where: { organizationId: orgId, patientId },
        include: { messages: { orderBy: { sentAt: 'desc' }, take: 1 } },
      }),
      this.prisma.patientConsent.findMany({ where: { organizationId: orgId, patientId }, orderBy: { signedAt: 'desc' } }),
      this.prisma.employee.findMany({ where: { user: { organizationId: orgId }, status: 'ACTIVE' }, select: { id: true, firstName: true, lastName: true } }),
      this.prisma.lead.findMany({ where: { organizationId: orgId, OR: [{ patientId }, { phone: patient.phone ?? '—' }] }, take: 5 }),
    ]);
    return {
      curator: patient.curator ? { id: patient.curator.id, name: `${patient.curator.lastName} ${patient.curator.firstName}` } : null,
      source: patient.source,
      ortho: patient.orthoChart,
      calls,
      allocations: allocations.map((row) => ({
        id: row.id,
        amount: Number(row.amount),
        method: row.payment.method,
        paidAt: row.payment.paidAt,
        procedure: row.invoiceItem.title,
        toothNum: row.invoiceItem.toothNum,
      })),
      threads,
      consents,
      employees,
      leads,
    };
  }

  async setCurator(orgId: string, patientId: string, curatorId: string | null) {
    const patient = await this.prisma.patient.findFirst({ where: { id: patientId, organizationId: orgId } });
    if (!patient) throw new NotFoundException('Пациент не найден');
    await this.prisma.patient.update({ where: { id: patientId }, data: { curatorId } });
    return { ok: true };
  }

  saveOrtho(orgId: string, patientId: string, body: { classAngle?: string; notes?: string; monthlyFee?: number; contractSigned?: boolean }) {
    return this.prisma.orthoChart.upsert({
      where: { patientId },
      update: {
        classAngle: body.classAngle,
        notes: body.notes ?? '',
        monthlyFee: body.monthlyFee,
        contractSigned: body.contractSigned ?? false,
      },
      create: {
        organizationId: orgId,
        patientId,
        classAngle: body.classAngle,
        notes: body.notes ?? '',
        monthlyFee: body.monthlyFee,
        contractSigned: body.contractSigned ?? false,
      },
    });
  }

  async message(orgId: string, patientId: string, channel: string, body: string) {
    const allowed = ['WHATSAPP', 'TELEGRAM', 'VK', 'MAX', 'SMS', 'EMAIL', 'PHONE'];
    if (!allowed.includes(channel)) throw new BadRequestException('Неизвестный канал');
    const thread = await this.prisma.communicationThread.create({
      data: {
        organizationId: orgId,
        patientId,
        channel: channel as never,
        subject: channel === 'MAX' || channel === 'VK' ? `${channel} (демо, сообщение не отправлено наружу)` : channel,
        messages: { create: { direction: 'OUT', body: body || 'Напоминание о визите' } },
      },
    });
    return { demo: channel === 'MAX' || channel === 'VK', threadId: thread.id };
  }

  async esign(orgId: string, patientId: string) {
    const code = String(1000 + Math.floor(Math.random() * 9000));
    const consent = await this.prisma.patientConsent.create({
      data: {
        organizationId: orgId,
        patientId,
        type: 'MEDICAL_TREATMENT',
        status: 'PENDING',
        signatureHash: `PEP:${code}`,
        documentUrl: 'ИДС, простая электронная подпись по SMS (демо, SMS не отправлялась)',
      },
    });
    return { id: consent.id, demo: true, code, hint: 'Код показан только в демо. Во внешний SMS-шлюз ничего не ушло.' };
  }

  async confirmSign(orgId: string, id: string, code: string) {
    const consent = await this.prisma.patientConsent.findFirst({ where: { id, organizationId: orgId } });
    if (!consent || consent.signatureHash !== `PEP:${code}`) throw new BadRequestException('Код не совпал');
    return this.prisma.patientConsent.update({
      where: { id },
      data: { status: 'SIGNED', signedAt: new Date() },
    });
  }

  async allocate(orgId: string, body: { paymentId: string; invoiceItemId: string; amount: number }) {
    const payment = await this.prisma.payment.findFirst({ where: { id: body.paymentId, organizationId: orgId } });
    const item = await this.prisma.invoiceItem.findFirst({ where: { id: body.invoiceItemId, invoice: { organizationId: orgId } } });
    if (!payment || !item) throw new NotFoundException('Оплата или процедура не найдены');
    if (!body.amount || body.amount <= 0) throw new BadRequestException('Сумма должна быть больше нуля');
    return this.prisma.paymentAllocation.create({
      data: { paymentId: payment.id, invoiceItemId: item.id, amount: body.amount },
    });
  }

  async applyCopilot(orgId: string, patientId: string, userId: string) {
    const patient = await this.prisma.patient.findFirst({ where: { id: patientId, organizationId: orgId } });
    if (!patient) throw new NotFoundException('Пациент не найден');
    const [employee, service] = await Promise.all([
      this.prisma.employee.findFirst({ where: { userId } })
        .then((row) => row ?? this.prisma.employee.findFirst({ where: { user: { organizationId: orgId } } })),
      this.prisma.service.findFirst({ where: { organizationId: orgId, isActive: true }, orderBy: { basePrice: 'desc' } }),
    ]);
    if (!employee || !service) throw new BadRequestException('Нет врача или услуги, чтобы собрать план');
    const price = Number(service.basePrice);
    const plan = await this.prisma.treatmentPlan.create({
      data: {
        organizationId: orgId,
        patientId,
        doctorId: employee.id,
        title: 'План из подсказки',
        status: 'DRAFT',
        tier: 'OPTIMUM',
        familyKey: `ai-${patientId.slice(0, 6)}-${Date.now().toString().slice(-5)}`,
        totalPrice: price,
        items: { create: [{ title: service.name, serviceId: service.id, price, listPrice: price, toothNum: 16, status: 'PROPOSED' }] },
      },
      include: { items: true },
    });
    const invoice = await this.prisma.invoice.create({
      data: {
        organizationId: orgId,
        patientId,
        treatmentPlanId: plan.id,
        number: `AI-${Date.now().toString().slice(-6)}`,
        status: 'ISSUED',
        totalAmount: price,
        items: { create: [{ planItemId: plan.items[0].id, serviceId: service.id, toothNum: 16, title: service.name, price }] },
      },
    });
    return { demo: true, planId: plan.id, invoiceId: invoice.id, total: price, title: service.name };
  }

  async exchange(orgId: string) {
    await this.seed(orgId);
    const keys = await this.prisma.apiKey.findMany({ where: { organizationId: orgId }, orderBy: { createdAt: 'desc' } });
    return {
      keys: keys.map((key) => ({ id: key.id, name: key.name, token: key.token, createdAt: key.createdAt })),
      aggregators: [
        { id: 'prodoctorov', name: 'ПроДокторов', mode: 'заглушка' },
        { id: 'sber', name: 'СберЗдоровье', mode: 'заглушка' },
      ],
      onec: 'JSON-выгрузка продаж. В 1С ничего не отправляется.',
    };
  }

  createKey(orgId: string, name: string) {
    const token = `sd_${orgId.slice(0, 4)}_${Math.random().toString(36).slice(2, 12)}`;
    return this.prisma.apiKey.create({ data: { organizationId: orgId, name: name || 'Ключ', token } });
  }

  async aggregator(orgId: string, source: string, body: { name?: string; phone?: string }) {
    const label = source === 'sber' ? 'СберЗдоровье' : 'ПроДокторов';
    const lead = await this.prisma.lead.create({
      data: {
        organizationId: orgId,
        name: body.name?.trim() || `Заявка ${label}`,
        phone: body.phone?.trim() || '+79000000000',
        source: label,
        status: 'NEW',
      },
    });
    return { demo: true, stub: true, lead, note: 'Агрегатор не вызывался. Заявка создана локально.' };
  }

  async exportCsv(orgId: string, type: string) {
    await this.seed(orgId);
    const map: Record<string, () => Promise<Record<string, string | number>[]>> = {
      leads: async () => {
        const rows = await this.prisma.lead.findMany({ where: { organizationId: orgId } });
        return rows.map((row) => ({ имя: row.name, телефон: row.phone, источник: row.source, статус: row.status, отказ: row.refusalReason ?? '' }));
      },
      sources: async () => (await this.quality(orgId)).sources.map((row) => ({ источник: row.source, выручка: row.revenue })),
      unfilled: async () => (await this.quality(orgId)).unfilled.map((row) => ({ когда: new Date(row.at).toLocaleString('ru-RU'), пациент: row.patient, врач: row.doctor, не_заполнено: row.missing })),
      warranty: async () => {
        const rows = await this.prisma.warrantyCase.findMany({ where: { organizationId: orgId }, include: { patient: true } });
        return rows.map((row) => ({ пациент: `${row.patient.lastName} ${row.patient.firstName}`, работа: row.title, статус: row.status, причина: row.reason, стоимость: Number(row.cost) }));
      },
      lab: async () => {
        const rows = await this.prisma.labOrder.findMany({ where: { organizationId: orgId } });
        return rows.map((row) => ({ работа: row.title, лаборатория: row.labName ?? '', техник: row.technician ?? '', статус: row.status, себестоимость: Number(row.costAmount ?? 0) }));
      },
      insurance: async () => {
        const rows = await this.prisma.insurerBill.findMany({ where: { organizationId: orgId }, include: { insurer: true } });
        return rows.map((row) => ({ счёт: row.number, компания: row.insurer.name, пациент: row.patientName, сумма: Number(row.amount), статус: row.status }));
      },
      revenue: async () => {
        const rows = await this.prisma.payment.groupBy({ by: ['method'], where: { organizationId: orgId }, _sum: { amount: true }, _count: true });
        return rows.map((row) => ({ способ: row.method, сумма: Number(row._sum.amount ?? 0), платежей: row._count }));
      },
    };
    const build = map[type];
    if (!build) throw new NotFoundException('Нет такого отчёта');
    return { filename: `${type}.csv`, csv: csv(await build()) };
  }

  async export1c(orgId: string) {
    const payments = await this.prisma.payment.findMany({
      where: { organizationId: orgId },
      include: { invoice: { include: { patient: true } } },
      take: 50,
      orderBy: { paidAt: 'desc' },
    });
    return {
      demo: true,
      format: '1C-JSON-stub',
      note: 'Файл для загрузки в 1С:Бухгалтерию. Во внешнюю 1С ничего не отправлено.',
      documents: payments.map((row) => ({
        date: row.paidAt,
        number: row.id.slice(0, 8),
        amount: Number(row.amount),
        method: row.method,
        counterparty: row.invoice ? `${row.invoice.patient.lastName} ${row.invoice.patient.firstName}` : row.patientId,
      })),
    };
  }

  private async byKey(token: string) {
    if (!token) throw new UnauthorizedException('Нужен заголовок x-api-key');
    const key = await this.prisma.apiKey.findUnique({ where: { token } });
    if (!key) throw new UnauthorizedException('Ключ не найден');
    return key.organizationId;
  }

  async openPatients(token: string) {
    const orgId = await this.byKey(token);
    const items = await this.prisma.patient.findMany({
      where: { organizationId: orgId, isActive: true },
      select: { id: true, firstName: true, lastName: true, phone: true, source: true },
      take: 100,
    });
    return { items };
  }

  async openBook(token: string, source: string, body: { name?: string; phone?: string }) {
    const orgId = await this.byKey(token);
    return this.aggregator(orgId, source, body);
  }
}
