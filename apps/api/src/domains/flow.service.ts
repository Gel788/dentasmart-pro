import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { clinicianWhere } from './clinicians';
import { PrismaService } from '../prisma/prisma.service';
import { DocumentsService } from './documents';
import { formatRub, fromKopecks, kopecks } from '@dentasmart/shared';
import { inputKopecks, isUniqueViolation, paymentByKey, recordPayment } from './invoice-ledger';
import { consumeForVisit } from '../route/route-chain';
import { ClinicConfigService } from './clinic-config.service';
import { ClinicalService } from './clinical.service';
import { FinanceService } from './finance.service';
import { medicalView } from '../patients/patients.service';
import { medicalReviewDue } from '@dentasmart/shared';

export const PHOTO_SLOTS = [
  { code: 'FACE_SMILE', label: 'Лицо, улыбка' },
  { code: 'FACE_REST', label: 'Лицо, покой' },
  { code: 'FACE_PROFILE', label: 'Профиль' },
  { code: 'RETRACT_FRONT', label: 'С ретрактором, анфас' },
  { code: 'RETRACT_RIGHT', label: 'С ретрактором, справа' },
  { code: 'RETRACT_LEFT', label: 'С ретрактором, слева' },
  { code: 'OCCLUSAL_UPPER', label: 'Окклюзия верх' },
  { code: 'OCCLUSAL_LOWER', label: 'Окклюзия низ' },
  { code: 'TOOTH', label: 'Крупный план зуба' },
] as const;

const NEXT: Record<string, string[]> = {
  SCHEDULED: ['confirm', 'check-in', 'start', 'no-show'],
  CONFIRMED: ['check-in', 'remind', 'start', 'no-show'],
  WAITING: ['start', 'no-show'],
  IN_PROGRESS: ['complete'],
  COMPLETED: ['pay'],
  NO_SHOW: ['rebook'],
  CANCELLED: [],
};

@Injectable()
export class FlowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ClinicConfigService,
    private readonly clinical: ClinicalService,
    private readonly finance: FinanceService,
    private readonly documents: DocumentsService,
  ) {}

  async visit(orgId: string, id: string) {
    const appointment = await this.prisma.appointment.findFirst({
      where: { id, organizationId: orgId },
      include: {
        patient: true,
        doctor: true,
        service: true,
        cabinet: true,
        visitNote: true,
        reminders: { orderBy: { createdAt: 'desc' }, take: 5 },
        invoices: { include: { items: true } },
        prescriptions: { orderBy: { createdAt: 'desc' } },
        followUps: { orderBy: { dueAt: 'asc' } },
      },
    });
    if (!appointment) throw new NotFoundException('Визит не найден');
    const [debtInvoices, imaging] = await Promise.all([
      this.prisma.invoice.findMany({
        where: { patientId: appointment.patientId, status: { in: ['ISSUED', 'PARTIAL', 'DRAFT'] } },
      }),
      this.imaging(orgId, appointment.patientId),
    ]);
    const debt =
      debtInvoices.reduce(
        (sum, invoice) => sum + Math.max(0, kopecks(invoice.totalAmount) - kopecks(invoice.discountAmount) - kopecks(invoice.paidAmount)),
        0,
      ) / 100;
    const patient = appointment.patient;
    const [medical, today] = await Promise.all([medicalView(this.prisma, patient), this.todayLines(orgId, appointment.patientId, id)]);
    return {
      id: appointment.id,
      status: appointment.status,
      startsAt: appointment.startsAt,
      endsAt: appointment.endsAt,
      noShowReason: appointment.noShowReason,
      branchId: appointment.branchId,
      service: appointment.service?.name ?? 'Приём',
      servicePrice: appointment.service ? Number(appointment.service.basePrice) : 0,
      doctor: appointment.doctor ? `${appointment.doctor.lastName} ${appointment.doctor.firstName}` : null,
      cabinet: appointment.cabinet?.name ?? null,
      actions: NEXT[appointment.status] ?? [],
      patient: {
        id: patient.id,
        firstName: patient.firstName,
        lastName: patient.lastName,
        phone: patient.phone,
        allergies: patient.allergies,
        anxiety: patient.anxiety,
        pregnant: patient.pregnant,
        anticoagulant: patient.anticoagulant,
        contraindications: patient.contraindications,
      },
      debt,
      medical,
      today,
      note: appointment.visitNote,
      reminders: appointment.reminders.map((reminder) => ({
        id: reminder.id,
        channel: reminder.channel,
        status: reminder.status,
        message: reminder.message,
        scheduledAt: reminder.scheduledAt,
      })),
      prescriptions: appointment.prescriptions,
      followUps: appointment.followUps,
      invoices: appointment.invoices.map((invoice) => ({
        id: invoice.id,
        number: invoice.number,
        status: invoice.status,
        total: Number(invoice.totalAmount),
        paid: Number(invoice.paidAmount),
      })),
      imaging,
    };
  }

  async confirm(orgId: string, id: string) {
    const appointment = await this.must(orgId, id);
    this.assert(appointment.status, 'confirm');
    await this.prisma.appointment.update({ where: { id }, data: { status: 'CONFIRMED' } });
    const when = new Date(appointment.startsAt);
    when.setDate(when.getDate() - 1);
    when.setHours(10, 0, 0, 0);
    await this.prisma.reminder.create({
      data: {
        organizationId: orgId,
        patientId: appointment.patientId,
        appointmentId: id,
        channel: 'TELEGRAM',
        message: `Седракович Дент: ждём вас ${appointment.startsAt.toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}. Ответьте «да», чтобы подтвердить.`,
        scheduledAt: when,
        // No messenger is connected yet: the reminder waits in the queue, it is not «sent».
        status: 'PENDING',
      },
    });
    return this.visit(orgId, id);
  }

  async checkIn(orgId: string, id: string) {
    const appointment = await this.must(orgId, id);
    this.assert(appointment.status, 'check-in');
    const existing = await this.prisma.receptionQueueItem.findFirst({
      where: { appointmentId: id, status: { in: ['WAITING', 'CALLED', 'IN_CHAIR'] } },
    });
    if (!existing) {
      const maxPos = await this.prisma.receptionQueueItem.aggregate({
        where: { organizationId: orgId, branchId: appointment.branchId, status: { in: ['WAITING', 'CALLED', 'IN_CHAIR'] } },
        _max: { position: true },
      });
      await this.prisma.receptionQueueItem.create({
        data: {
          organizationId: orgId,
          branchId: appointment.branchId,
          patientId: appointment.patientId,
          appointmentId: id,
          position: (maxPos._max.position ?? 0) + 1,
          status: 'WAITING',
        },
      });
    }
    await this.prisma.appointment.update({ where: { id }, data: { status: 'WAITING' } });
    return this.visit(orgId, id);
  }

  /**
   * What can be done in this visit: lines booked onto it first, then the open lines of the patient's
   * accepted plans, or of the recommended variant of the latest proposal when nothing is accepted yet.
   */
  private async todayLines(orgId: string, patientId: string, appointmentId: string) {
    const plans = await this.prisma.treatmentPlan.findMany({
      where: { organizationId: orgId, patientId, status: { notIn: ['REJECTED', 'CANCELLED', 'COMPLETED'] } },
      include: { items: { orderBy: [{ phase: 'asc' }, { sortOrder: 'asc' }] } },
      orderBy: { createdAt: 'desc' },
    });
    const accepted = plans.filter((plan) => ['ACCEPTED', 'IN_PROGRESS'].includes(plan.status));
    const latest = plans[0]?.familyKey ? plans.filter((plan) => plan.familyKey === plans[0].familyKey) : plans.slice(0, 1);
    const pool = accepted.length ? accepted : [latest.find((plan) => plan.tier === 'OPTIMUM') ?? latest[0]].filter(Boolean);
    const lines = pool.flatMap((plan) =>
      plan.items
        .filter((item) => item.appointmentId === appointmentId || item.status === 'PROPOSED' || item.status === 'ACCEPTED' || item.status === 'DONE')
        .map((item) => ({
          id: item.id,
          planId: plan.id,
          planTitle: plan.title,
          title: item.title,
          toothNum: item.toothNum,
          surfaces: item.surfaces,
          price: Number(item.price),
          status: item.status,
          booked: item.appointmentId === appointmentId,
          doneHere: item.status === 'DONE' && item.appointmentId === appointmentId,
        })),
    );
    return lines
      .filter((line) => line.status !== 'DONE' || line.doneHere)
      .sort((a, b) => Number(b.booked) - Number(a.booked));
  }

  /**
   * A service done in the chair that the plan didn't have: it joins the patient's current plan (the
   * accepted one, else the recommended variant of the latest proposal, else a new draft), priced from
   * the list, agreed and tied to this visit so closing the visit bills it.
   */
  async addVisitItem(orgId: string, id: string, body: { serviceId: string; toothNum?: number | null }, doctorId?: string) {
    const appointment = await this.must(orgId, id);
    if (appointment.status !== 'IN_PROGRESS') throw new BadRequestException('Добавить услугу можно во время приёма');
    const plans = await this.prisma.treatmentPlan.findMany({
      where: { organizationId: orgId, patientId: appointment.patientId, status: { notIn: ['REJECTED', 'CANCELLED', 'COMPLETED'] } },
      orderBy: { createdAt: 'desc' },
    });
    const accepted = plans.find((plan) => plan.status === 'ACCEPTED' || plan.status === 'IN_PROGRESS');
    const latest = plans[0]?.familyKey ? plans.filter((plan) => plan.familyKey === plans[0].familyKey) : plans.slice(0, 1);
    let plan = accepted ?? latest.find((row) => row.tier === 'OPTIMUM') ?? latest[0];
    if (!plan) plan = await this.clinical.createPlan(orgId, { patientId: appointment.patientId, title: 'План лечения', doctorId: doctorId ?? appointment.doctorId ?? undefined });
    const item = await this.clinical.addPlanItem(orgId, plan.id, { serviceId: body.serviceId, toothNum: body.toothNum ?? undefined });
    await this.prisma.treatmentPlanItem.update({ where: { id: item.id }, data: { appointmentId: id, status: 'ACCEPTED' } });
    return this.visit(orgId, id);
  }

  async start(orgId: string, id: string, options: { userId?: string; skipDocumentsReason?: string } = {}) {
    const appointment = await this.must(orgId, id);
    this.assert(appointment.status, 'start');
    const patient = await this.prisma.patient.findFirst({ where: { id: appointment.patientId, organizationId: orgId } });
    if (patient && medicalReviewDue(patient.medicalConfirmedAt)) {
      throw new BadRequestException('Перед приёмом уточните анамнез у пациента и подтвердите медкарту');
    }
    // No treatment before the patient has signed the contract and the consents for this visit.
    const unsigned = await this.documents.blockers(orgId, id);
    if (unsigned.length) {
      const reason = (options.skipDocumentsReason ?? '').trim();
      if (reason.length < 10) throw new BadRequestException(`Пациент не подписал: ${unsigned.map((doc) => doc.title).join('; ')}`);
      await this.prisma.auditLog.create({ data: { organizationId: orgId, userId: options.userId, entityType: 'Appointment', entityId: id, action: 'UPDATE', changes: { startedWithoutDocuments: unsigned.map((doc) => doc.number), reason: reason.slice(0, 500) } } });
    }
    await this.prisma.appointment.update({ where: { id }, data: { status: 'IN_PROGRESS' } });
    await this.prisma.receptionQueueItem.updateMany({
      where: { appointmentId: id, status: { in: ['WAITING', 'CALLED'] } },
      data: { status: 'IN_CHAIR' },
    });
    return this.visit(orgId, id);
  }

  async noShow(orgId: string, id: string, reason: string) {
    const appointment = await this.must(orgId, id);
    this.assert(appointment.status, 'no-show');
    const text = reason?.trim();
    if (!text) throw new BadRequestException('Укажите причину неявки');
    await this.prisma.appointment.update({ where: { id }, data: { status: 'NO_SHOW', noShowReason: text } });
    await this.prisma.followUp.create({
      data: {
        organizationId: orgId,
        patientId: appointment.patientId,
        sourceAppointmentId: id,
        dueAt: new Date(),
        reason: `Неявка: ${text}. Перезвонить и записать снова.`,
      },
    });
    return this.visit(orgId, id);
  }

  async remind(orgId: string, id: string) {
    const appointment = await this.must(orgId, id);
    this.assert(appointment.status, 'remind');
    await this.prisma.reminder.create({
      data: {
        organizationId: orgId,
        patientId: appointment.patientId,
        appointmentId: id,
        channel: 'WHATSAPP',
        message: 'Седракович Дент: напоминаем о визите сегодня. Если планы изменились, ответьте на это сообщение.',
        scheduledAt: new Date(),
        // No messenger is connected yet: the reminder waits in the queue, it is not «sent».
        status: 'PENDING',
      },
    });
    return this.visit(orgId, id);
  }

  async saveNote(
    orgId: string,
    id: string,
    userId: string,
    body: { complaints?: string; anamnesis?: string; objective?: string; diagnosis?: string; treatment?: string; recommendations?: string; reason?: string },
  ) {
    const appointment = await this.must(orgId, id);
    if (appointment.status === 'COMPLETED') {
      const policy = await this.config.policy(userId);
      if (!policy.editClosedVisits) throw new ForbiddenException('Закрытый визит правит только роль с этим правом');
      if (!body.reason || body.reason.trim().length < 3) throw new BadRequestException('Укажите причину правки закрытого визита');
      await this.prisma.auditLog.create({
        data: {
          organizationId: orgId,
          userId,
          entityType: 'Appointment',
          entityId: id,
          action: 'UPDATE',
          changes: { reason: body.reason.trim(), diagnosis: body.diagnosis ?? '' },
        },
      });
    }
    const { reason: _reason, ...note } = body;
    await this.prisma.visitNote.upsert({
      where: { appointmentId: id },
      create: { appointmentId: id, ...note },
      update: note,
    });
    return this.visit(orgId, id);
  }

  async complete(orgId: string, id: string, body: { followUpDate?: string; followUpReason?: string; doneItemIds?: string[] }) {
    const appointment = await this.must(orgId, id);
    this.assert(appointment.status, 'complete');
    const note = await this.prisma.visitNote.findUnique({ where: { appointmentId: id } });
    if (!note?.diagnosis?.trim()) throw new BadRequestException('Сначала запишите диагноз — без него визит не закрывается');
    if (!note.treatment?.trim()) throw new BadRequestException('Опишите, что сделали на приёме');
    if (body.followUpDate && Number.isNaN(+new Date(body.followUpDate))) throw new BadRequestException('Некорректная дата контроля');
    // Only this patient's open plan lines in this clinic can be marked done by this visit.
    const ids = [...new Set((body.doneItemIds ?? []).filter((value) => typeof value === 'string'))].slice(0, 100);
    const done = ids.length
      ? await this.prisma.treatmentPlanItem.findMany({
          where: { id: { in: ids }, status: { in: ['PROPOSED', 'ACCEPTED'] }, plan: { organizationId: orgId, patientId: appointment.patientId } },
        })
      : [];
    if (done.length !== ids.length) throw new BadRequestException('Часть услуг уже выполнена или не из плана этого пациента. Обновите страницу');
    const closed = await this.prisma.appointment.updateMany({ where: { id, organizationId: orgId, status: 'IN_PROGRESS' }, data: { status: 'COMPLETED' } });
    if (!closed.count) throw new BadRequestException('Визит уже закрыт или ещё не начат. Обновите страницу');
    await consumeForVisit(this.prisma, orgId, id);
    for (const item of done) {
      await this.prisma.treatmentPlanItem.update({ where: { id: item.id }, data: { appointmentId: item.appointmentId ?? id } });
      await this.clinical.completePlanItemWithMaterials(orgId, item.id, appointment.branchId, true);
    }
    const byPlan = new Map<string, string[]>();
    for (const item of done) byPlan.set(item.planId, [...(byPlan.get(item.planId) ?? []), item.id]);
    for (const [planId, itemIds] of byPlan) {
      await this.finance.createInvoiceFromPlan(orgId, planId, { itemIds, appointmentId: id });
    }
    await this.prisma.receptionQueueItem.updateMany({
      where: { appointmentId: id },
      data: { status: 'DONE' },
    });
    await this.documents.afterVisit(orgId, id).catch(() => undefined);
    if (body.followUpDate) {
      const dueAt = new Date(body.followUpDate);
      await this.prisma.followUp.create({
        data: {
          organizationId: orgId,
          patientId: appointment.patientId,
          sourceAppointmentId: id,
          dueAt,
          reason: body.followUpReason?.trim() || 'Контрольный визит',
        },
      });
    }
    return this.visit(orgId, id);
  }

  async prescribe(orgId: string, id: string, body: { drug: string; dose: string; sig: string; days?: number }, doctorId?: string) {
    const appointment = await this.must(orgId, id);
    if (!body.drug?.trim() || !body.dose?.trim() || !body.sig?.trim()) {
      throw new BadRequestException('Нужны препарат, доза и как принимать');
    }
    await this.prisma.prescription.create({
      data: {
        organizationId: orgId,
        patientId: appointment.patientId,
        appointmentId: id,
        doctorId: doctorId ?? appointment.doctorId,
        drug: body.drug.trim(),
        dose: body.dose.trim(),
        sig: body.sig.trim(),
        days: body.days && body.days > 0 ? body.days : 5,
      },
    });
    return this.visit(orgId, id);
  }

  async pay(orgId: string, id: string, body: { amount: number | string; method: string }, actor: { userId?: string; idempotencyKey?: string } = {}) {
    const appointment = await this.must(orgId, id);
    const amount = inputKopecks(body.amount);
    if (amount <= 0) throw new BadRequestException('Укажите сумму');
    const method = body.method === 'CASH' ? 'CASH' : 'CARD';
    if (!(await paymentByKey(this.prisma, orgId, actor.idempotencyKey))) {
      try {
        await this.prisma.$transaction(async (tx) => {
          let invoice = await tx.invoice.findFirst({
            where: { organizationId: orgId, patientId: appointment.patientId, status: { in: ['ISSUED', 'PARTIAL', 'DRAFT'] } },
            orderBy: { createdAt: 'desc' },
          });
          if (!invoice) {
            invoice = await tx.invoice.create({
              data: {
                organizationId: orgId,
                patientId: appointment.patientId,
                appointmentId: id,
                number: `SD-${Date.now().toString().slice(-8)}`,
                status: 'ISSUED',
                totalAmount: fromKopecks(amount),
                items: { create: [{ title: appointment.serviceId ? 'Приём' : 'Оплата на стойке', price: fromKopecks(amount) }] },
              },
            });
          }
          const due = kopecks(invoice.totalAmount) - kopecks(invoice.discountAmount) - kopecks(invoice.paidAmount);
          if (amount > Math.max(0, due)) throw new BadRequestException(`К оплате ${formatRub(Math.max(0, due))}`);
          await recordPayment(tx, {
            organizationId: orgId,
            patientId: appointment.patientId,
            invoiceId: invoice.id,
            amountKopecks: amount,
            method,
            createdById: actor.userId,
            idempotencyKey: actor.idempotencyKey,
          });
        });
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
      }
    }
    return this.visit(orgId, id);
  }

  async caller(orgId: string, phone: string) {
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 4) return [];
    const patients = await this.prisma.patient.findMany({
      where: { organizationId: orgId, isActive: true },
      take: 80,
      orderBy: { updatedAt: 'desc' },
    });
    return patients
      .filter((patient) => (patient.phone ?? '').replace(/\D/g, '').includes(digits))
      .slice(0, 6)
      .map((patient) => ({ id: patient.id, firstName: patient.firstName, lastName: patient.lastName, phone: patient.phone }));
  }

  async imaging(orgId: string, patientId: string) {
    const patient = await this.prisma.patient.findFirst({ where: { id: patientId, organizationId: orgId } });
    if (!patient) throw new NotFoundException('Пациент не найден');
    const [protocols, studies] = await Promise.all([
      this.prisma.photoProtocol.findMany({
        where: { patientId },
        include: { shots: true, phase: true },
        orderBy: { takenAt: 'asc' },
      }),
      this.prisma.imagingStudy.findMany({
        where: { patientId },
        include: { annotations: true },
        orderBy: [{ seriesKey: 'asc' }, { sliceIndex: 'asc' }, { takenAt: 'desc' }],
      }),
    ]);
    const smile = (moment: string) =>
      protocols.find((protocol) => protocol.moment === moment)?.shots.find((shot) => shot.slot === 'FACE_SMILE')?.fileUrl ?? null;
    return {
      slots: PHOTO_SLOTS,
      compare: { before: smile('BEFORE'), after: smile('AFTER') },
      protocols: protocols.map((protocol) => ({
        id: protocol.id,
        moment: protocol.moment,
        title: protocol.title,
        phase: protocol.phase?.title ?? null,
        takenAt: protocol.takenAt,
        shots: PHOTO_SLOTS.map((slot) => {
          const shot = protocol.shots.find((item) => item.slot === slot.code);
          return { slot: slot.code, label: slot.label, fileUrl: shot?.fileUrl ?? null, toothNum: shot?.toothNum ?? null };
        }),
      })),
      studies: studies.map((study) => ({
        id: study.id,
        type: study.type,
        title: study.title,
        fileUrl: study.fileUrl,
        toothNum: study.toothNum,
        takenAt: study.takenAt,
        seriesKey: study.seriesKey,
        sliceIndex: study.sliceIndex,
        appointmentId: study.appointmentId,
        annotations: study.annotations.map((mark) => ({
          id: mark.id,
          toothNum: mark.toothNum,
          kind: mark.kind,
          source: mark.source,
          label: mark.label,
          confidence: mark.confidence,
          sliceIndex: mark.sliceIndex,
          x: mark.x,
          y: mark.y,
          w: mark.w,
          h: mark.h,
        })),
      })),
    };
  }

  async addStudy(
    orgId: string,
    patientId: string,
    body: { type: string; fileUrl: string; title?: string; toothNum?: number; appointmentId?: string; phaseId?: string; seriesKey?: string; sliceIndex?: number },
  ) {
    const patient = await this.prisma.patient.findFirst({ where: { id: patientId, organizationId: orgId } });
    if (!patient) throw new NotFoundException('Пациент не найден');
    if (!body.fileUrl) throw new BadRequestException('Нет файла');
    const allowed = ['OPG', 'CT', 'INTRAORAL', 'STL', 'PLY', 'DICOM', 'PHOTO'];
    if (!allowed.includes(body.type)) throw new BadRequestException('Неизвестный тип снимка');
    await this.prisma.imagingStudy.create({
      data: {
        patientId,
        type: body.type as 'OPG',
        fileUrl: body.fileUrl,
        title: body.title,
        toothNum: body.toothNum,
        appointmentId: body.appointmentId,
        phaseId: body.phaseId,
        seriesKey: body.seriesKey,
        sliceIndex: body.sliceIndex,
      },
    });
    return this.imaging(orgId, patientId);
  }

  async annotate(studyId: string, body: { toothNum?: number; kind: string; label: string; x: number; y: number; w: number; h: number; sliceIndex?: number; source?: string; confidence?: number }) {
    const study = await this.prisma.imagingStudy.findUnique({ where: { id: studyId } });
    if (!study) throw new NotFoundException('Снимок не найден');
    if (!body.label?.trim()) throw new BadRequestException('Подпишите находку');
    await this.prisma.imagingAnnotation.create({
      data: {
        studyId,
        toothNum: body.toothNum ?? study.toothNum,
        kind: body.kind || 'NOTE',
        source: body.source === 'AI' ? 'AI' : 'CLINICIAN',
        label: body.label.trim(),
        confidence: body.confidence,
        sliceIndex: body.sliceIndex ?? study.sliceIndex,
        x: body.x,
        y: body.y,
        w: body.w,
        h: body.h,
      },
    });
    return { ok: true };
  }

  private async markOf(orgId: string, id: string) {
    const mark = await this.prisma.imagingAnnotation.findFirst({ where: { id, study: { patient: { organizationId: orgId } } } });
    if (!mark) throw new NotFoundException('Отметка не найдена');
    return mark;
  }

  async acceptMark(orgId: string, id: string) {
    await this.markOf(orgId, id);
    await this.prisma.imagingAnnotation.update({ where: { id }, data: { source: 'CLINICIAN' } });
    return { ok: true };
  }

  async hideMark(orgId: string, id: string) {
    await this.markOf(orgId, id);
    await this.prisma.imagingAnnotation.delete({ where: { id } });
    return { ok: true };
  }

  async addShot(orgId: string, patientId: string, body: { moment: string; slot: string; fileUrl: string; toothNum?: number; phaseId?: string; appointmentId?: string }) {
    const patient = await this.prisma.patient.findFirst({ where: { id: patientId, organizationId: orgId } });
    if (!patient) throw new NotFoundException('Пациент не найден');
    if (!PHOTO_SLOTS.some((slot) => slot.code === body.slot)) throw new BadRequestException('Нет такого слота протокола');
    const moment = body.moment === 'AFTER' ? 'AFTER' : 'BEFORE';
    let protocol = await this.prisma.photoProtocol.findFirst({ where: { patientId, moment } });
    if (!protocol) {
      protocol = await this.prisma.photoProtocol.create({
        data: {
          organizationId: orgId,
          patientId,
          moment,
          title: moment === 'BEFORE' ? 'До лечения' : 'После лечения',
          phaseId: body.phaseId,
          appointmentId: body.appointmentId,
        },
      });
    }
    await this.prisma.photoShot.upsert({
      where: { protocolId_slot: { protocolId: protocol.id, slot: body.slot } },
      create: { protocolId: protocol.id, slot: body.slot, fileUrl: body.fileUrl, toothNum: body.toothNum },
      update: { fileUrl: body.fileUrl, toothNum: body.toothNum },
    });
    return this.imaging(orgId, patientId);
  }

  async retention(orgId: string) {
    const soon = new Date();
    soon.setDate(soon.getDate() + 14);
    const [followUps, patients, plans] = await Promise.all([
      this.prisma.followUp.findMany({
        where: { organizationId: orgId, status: 'OPEN', dueAt: { lte: soon } },
        include: { patient: true },
        orderBy: { dueAt: 'asc' },
        take: 12,
      }),
      this.prisma.patient.findMany({
        where: { organizationId: orgId, isActive: true },
        include: { appointments: { where: { status: 'COMPLETED' }, orderBy: { startsAt: 'desc' }, take: 1 } },
        take: 60,
      }),
      this.prisma.treatmentPlan.findMany({
        where: { organizationId: orgId, doctorId: { not: null } },
        select: { doctorId: true, status: true, familyKey: true, id: true },
      }),
    ]);
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const doctors = await this.prisma.employee.findMany({
      where: clinicianWhere(orgId),
      include: {
        appointments: { where: { startsAt: { gte: monthStart } }, select: { status: true } },
      },
    });
    const byDoctor = new Map<string, { accepted: number; presented: number }>();
    const seen = new Set<string>();
    for (const plan of plans) {
      const key = `${plan.doctorId}:${plan.familyKey ?? plan.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const row = byDoctor.get(plan.doctorId!) ?? { accepted: 0, presented: 0 };
      const siblings = plans.filter((item) => (item.familyKey ?? item.id) === (plan.familyKey ?? plan.id));
      row.presented += 1;
      if (siblings.some((item) => ['ACCEPTED', 'IN_PROGRESS', 'COMPLETED'].includes(item.status))) row.accepted += 1;
      byDoctor.set(plan.doctorId!, row);
      seen.add(key);
    }
    const recallCutoff = new Date();
    recallCutoff.setDate(recallCutoff.getDate() - 180);
    const recall = patients
      .filter((patient) => {
        const last = patient.appointments[0]?.startsAt;
        return !!last && last < recallCutoff;
      })
      .slice(0, 6)
      .map((patient) => ({
        patientId: patient.id,
        patient: `${patient.lastName} ${patient.firstName}`,
        phone: patient.phone,
        lastVisit: patient.appointments[0]?.startsAt ?? null,
      }));
    const birthdays = patients
      .filter((patient) => patient.birthDate && birthdaySoon(patient.birthDate))
      .map((patient) => ({ patientId: patient.id, patient: `${patient.lastName} ${patient.firstName}`, when: patient.birthDate }));
    return {
      doctors: doctors.map((doctor) => {
        const done = doctor.appointments.filter((item) => item.status === 'COMPLETED').length;
        const missed = doctor.appointments.filter((item) => item.status === 'NO_SHOW').length;
        const plansRow = byDoctor.get(doctor.id) ?? { accepted: 0, presented: 0 };
        return {
          id: doctor.id,
          name: `${doctor.lastName} ${doctor.firstName}`,
          visits: done,
          noShows: missed,
          conversion: plansRow.presented ? Math.round((plansRow.accepted / plansRow.presented) * 100) : 0,
        };
      }),
      followUps: followUps.map((item) => ({
        id: item.id,
        patientId: item.patientId,
        patient: `${item.patient.lastName} ${item.patient.firstName}`,
        phone: item.patient.phone,
        dueAt: item.dueAt,
        reason: item.reason,
      })),
      recall,
      birthdays,
    };
  }

  private async must(orgId: string, id: string) {
    const appointment = await this.prisma.appointment.findFirst({ where: { id, organizationId: orgId } });
    if (!appointment) throw new NotFoundException('Визит не найден');
    return appointment;
  }

  private assert(status: string, action: string) {
    if (!(NEXT[status] ?? []).includes(action)) {
      throw new BadRequestException(`Сейчас визит в статусе «${status}». Это действие уже недоступно.`);
    }
  }
}

function birthdaySoon(date: Date) {
  const now = new Date();
  for (let i = 0; i < 7; i++) {
    const day = new Date(now);
    day.setDate(now.getDate() + i);
    if (day.getMonth() === date.getMonth() && day.getDate() === date.getDate()) return true;
  }
  return false;
}
