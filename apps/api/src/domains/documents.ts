import { BadRequestException, Body, Controller, Get, Injectable, NotFoundException, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@dentasmart/database';
import {
  AuthUser,
  BLOCKING_KINDS,
  DOCUMENT_TITLES,
  TOPIC_TITLES,
  VALID_DAYS,
  kopecks,
  topicsOf,
  type DocumentKind,
  type InterventionTopic,
} from '@dentasmart/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { CurrentUser } from '../common/current-user.decorator';
import { OrgId } from '../common/org.decorator';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Patient documents. A visit gets its papers on its own: the first visit brings the contract, the
 * personal-data consent, the health form and the general consent; every visit brings a consent for
 * each kind of intervention it holds; a finished visit brings its act. What a document says is frozen
 * in it when it is issued, so the printed and signed paper never changes; a mistake is voided.
 */
const DAY = 86400000;
type Db = PrismaService | Prisma.TransactionClient;

export type ClinicRequisites = {
  name: string; legalName: string | null; inn: string | null; ogrn: string | null; kpp: string | null; address: string | null;
  phone: string | null; email: string | null; website: string | null; licenseNumber: string | null; licenseDate: string | null;
  licenseIssuer: string | null; licenseWorks: string | null; directorName: string | null; bankName: string | null; bankAccount: string | null; bik: string | null;
};

@Injectable()
export class DocumentsService {
  constructor(private readonly prisma: PrismaService) {}

  async clinic(orgId: string): Promise<ClinicRequisites> {
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
    return {
      name: org.name, legalName: org.legalName, inn: org.inn, ogrn: org.ogrn, kpp: org.kpp, address: org.address, phone: org.phone, email: org.email,
      website: org.website, licenseNumber: org.licenseNumber, licenseDate: org.licenseDate?.toISOString() ?? null, licenseIssuer: org.licenseIssuer,
      licenseWorks: org.licenseWorks, directorName: org.directorName, bankName: org.bankName, bankAccount: org.bankAccount, bik: org.bik,
    };
  }

  async saveClinic(orgId: string, userId: string, body: Partial<ClinicRequisites>) {
    const text = (value: unknown) => (typeof value === 'string' ? value.trim().slice(0, 2000) || null : undefined);
    const date = body.licenseDate ? new Date(body.licenseDate) : null;
    if (date && Number.isNaN(+date)) throw new BadRequestException('Неверная дата лицензии');
    await this.prisma.organization.update({
      where: { id: orgId },
      data: {
        legalName: text(body.legalName), inn: text(body.inn), ogrn: text(body.ogrn), kpp: text(body.kpp), address: text(body.address), phone: text(body.phone),
        email: text(body.email), website: text(body.website), licenseNumber: text(body.licenseNumber), licenseDate: body.licenseDate === undefined ? undefined : date,
        licenseIssuer: text(body.licenseIssuer), licenseWorks: text(body.licenseWorks), directorName: text(body.directorName),
        bankName: text(body.bankName), bankAccount: text(body.bankAccount), bik: text(body.bik),
      },
    });
    await this.prisma.auditLog.create({ data: { organizationId: orgId, userId, entityType: 'Organization', entityId: orgId, action: 'UPDATE', changes: { documents: 'requisites' } } });
    return this.clinic(orgId);
  }

  /** What the clinic still has to fill in before its papers are complete. */
  missingRequisites(clinic: ClinicRequisites) {
    const need: [keyof ClinicRequisites, string][] = [
      ['legalName', 'полное наименование'], ['inn', 'ИНН'], ['ogrn', 'ОГРН'], ['address', 'адрес'], ['licenseNumber', 'номер лицензии'],
      ['licenseDate', 'дата лицензии'], ['licenseIssuer', 'кем выдана лицензия'], ['licenseWorks', 'перечень работ по лицензии'], ['directorName', 'руководитель'],
    ];
    return need.filter(([key]) => !clinic[key]).map(([, label]) => label);
  }

  /** Makes sure a visit has every paper it needs and returns them, with the ones still to sign. */
  async forVisit(orgId: string, visitId: string, userId?: string) {
    const visit = await this.prisma.appointment.findFirst({
      where: { id: visitId, organizationId: orgId },
      include: {
        patient: true,
        doctor: true,
        service: { include: { parent: { select: { name: true } } } },
      },
    });
    if (!visit) throw new NotFoundException('Визит не найден');
    const items = await this.prisma.treatmentPlanItem.findMany({
      where: { appointmentId: visitId, plan: { organizationId: orgId } },
      include: { service: { include: { parent: { select: { name: true } } } } },
    });
    const topics = new Set<InterventionTopic>([
      ...(visit.service ? topicsOf(visit.service.name, visit.service.parent?.name) : []),
      ...items.flatMap((item) => topicsOf(item.title, item.service?.name, item.service?.parent?.name)),
    ]);
    const services = [
      ...(visit.service ? [{ name: visit.service.name, code: visit.service.code, toothNum: null as number | null, price: Number(visit.service.basePrice) }] : []),
      ...items.map((item) => ({ name: item.title, code: item.service?.code ?? null, toothNum: item.toothNum, price: Number(item.price) })),
    ];

    const base = await this.snapshot(orgId, visit);
    // Two screens opening the visit at once must not issue the same paper twice.
    await this.prisma.$transaction(async (tx) => {
      await lockDocuments(tx, orgId);
      const existing = await tx.clinicDocument.findMany({ where: { organizationId: orgId, patientId: visit.patientId, status: { not: 'VOID' } }, orderBy: { createdAt: 'desc' } });
      const covering = (kind: DocumentKind) => {
        const days = VALID_DAYS[kind];
        return existing.find((doc) => doc.kind === kind && days !== undefined && +visit.startsAt - +doc.createdAt < days * DAY);
      };
      const wanted: { kind: DocumentKind; topic?: InterventionTopic; extra?: Record<string, unknown> }[] = [];
      for (const kind of ['CONTRACT', 'PD_CONSENT', 'HEALTH_FORM', 'IDS_GENERAL'] as DocumentKind[]) if (!covering(kind)) wanted.push({ kind });
      for (const topic of topics) {
        const kind: DocumentKind = topic === 'xray' ? 'XRAY_CONSENT' : 'IDS_INTERVENTION';
        if (!existing.some((doc) => doc.appointmentId === visitId && doc.kind === kind && doc.topic === topic)) {
          wanted.push({ kind, topic, extra: { services: services.filter((row) => topicsOf(row.name).includes(topic)) } });
        }
      }
      for (const want of wanted) {
        await this.issue(orgId, visit.patientId, want.kind, {
          appointmentId: visitId,
          topic: want.topic,
          userId,
          data: { ...base, topic: want.topic ?? null, topicTitle: want.topic ? TOPIC_TITLES[want.topic] : null, ...(want.kind === 'CONTRACT' ? { services } : {}), ...want.extra },
        }, tx);
      }
    }, { timeout: 20_000 });

    const fresh = await this.prisma.clinicDocument.findMany({ where: { organizationId: orgId, patientId: visit.patientId, status: { not: 'VOID' } }, orderBy: { createdAt: 'asc' } });
    const coveringFresh = (kind: DocumentKind) => {
      const days = VALID_DAYS[kind];
      const rows = fresh.filter((doc) => doc.kind === kind && days !== undefined && +visit.startsAt - +doc.createdAt < days * DAY);
      return rows.find((doc) => doc.status === 'SIGNED') ?? rows.at(-1);
    };
    const documents = [
      ...(['CONTRACT', 'PD_CONSENT', 'HEALTH_FORM', 'IDS_GENERAL'] as DocumentKind[]).map(coveringFresh).filter((doc): doc is NonNullable<typeof doc> => !!doc),
      ...fresh.filter((doc) => doc.appointmentId === visitId && !['CONTRACT', 'PD_CONSENT', 'HEALTH_FORM', 'IDS_GENERAL'].includes(doc.kind)),
    ];
    const unique = [...new Map(documents.map((doc) => [doc.id, doc])).values()];
    const unsigned = unique.filter((doc) => BLOCKING_KINDS.includes(doc.kind as DocumentKind) && doc.status !== 'SIGNED');
    return { documents: unique.map(view), unsigned: unsigned.map(view), requisitesMissing: this.missingRequisites(base.clinic) };
  }

  /** Papers that still stop this visit from starting. */
  async blockers(orgId: string, visitId: string) {
    return (await this.forVisit(orgId, visitId)).unsigned;
  }

  /** After a visit: the act of services rendered and the doctor's recommendations. */
  async afterVisit(orgId: string, visitId: string, userId?: string) {
    const visit = await this.prisma.appointment.findFirst({ where: { id: visitId, organizationId: orgId }, include: { patient: true, doctor: true, service: true } });
    if (!visit) return;
    const already = await this.prisma.clinicDocument.findMany({ where: { appointmentId: visitId, kind: { in: ['ACT', 'RECOMMENDATIONS'] }, status: { not: 'VOID' } } });
    const base = await this.snapshot(orgId, visit);
    if (!already.some((doc) => doc.kind === 'ACT')) {
      const invoiceItems = await this.prisma.invoiceItem.findMany({ where: { invoice: { appointmentId: visitId, organizationId: orgId, status: { not: 'CANCELLED' } } } });
      const codes = new Map((await this.prisma.service.findMany({ where: { id: { in: invoiceItems.map((item) => item.serviceId).filter((value): value is string => !!value) } }, select: { id: true, code: true } })).map((row) => [row.id, row.code]));
      const services = invoiceItems.length
        ? invoiceItems.map((item) => ({ name: item.title, code: (item.serviceId && codes.get(item.serviceId)) || null, toothNum: item.toothNum, price: Number(item.price) }))
        : visit.service ? [{ name: visit.service.name, code: visit.service.code, toothNum: null, price: Number(visit.service.basePrice) }] : [];
      const total = services.reduce((sum, row) => sum + kopecks(row.price), 0);
      const contract = await this.prisma.clinicDocument.findFirst({ where: { patientId: visit.patientId, kind: 'CONTRACT', status: { not: 'VOID' } }, orderBy: { createdAt: 'desc' }, select: { number: true, createdAt: true } });
      await this.issue(orgId, visit.patientId, 'ACT', { appointmentId: visitId, userId, data: { ...base, services, total: total / 100, contract: contract ? { number: contract.number, date: contract.createdAt.toISOString() } : null } });
    }
    const note = await this.prisma.visitNote.findUnique({ where: { appointmentId: visitId } });
    if (note?.recommendations.trim() && !already.some((doc) => doc.kind === 'RECOMMENDATIONS')) {
      await this.issue(orgId, visit.patientId, 'RECOMMENDATIONS', { appointmentId: visitId, userId, data: { ...base, recommendations: note.recommendations.trim(), diagnosis: note.diagnosis.trim() } });
    }
  }

  /** The estimate for a treatment plan: its open lines with prices. */
  async estimate(orgId: string, userId: string, planId: string) {
    const plan = await this.prisma.treatmentPlan.findFirst({
      where: { id: planId, organizationId: orgId },
      include: { patient: true, items: { where: { status: { in: ['PROPOSED', 'ACCEPTED'] } }, orderBy: [{ phase: 'asc' }, { sortOrder: 'asc' }], include: { service: { select: { code: true } } } } },
    });
    if (!plan) throw new NotFoundException('План не найден');
    if (!plan.items.length) throw new BadRequestException('В плане нет услуг для сметы');
    const base = await this.snapshot(orgId, { patient: plan.patient, doctor: null, startsAt: new Date() });
    const services = plan.items.map((item) => ({ name: item.title, code: item.service?.code ?? null, toothNum: item.toothNum, price: Number(item.price), phase: item.phase }));
    const total = services.reduce((sum, row) => sum + kopecks(row.price), 0);
    const contract = await this.prisma.clinicDocument.findFirst({ where: { patientId: plan.patientId, kind: 'CONTRACT', status: { not: 'VOID' } }, orderBy: { createdAt: 'desc' }, select: { number: true, createdAt: true } });
    const doc = await this.issue(orgId, plan.patientId, 'ESTIMATE', { treatmentPlanId: planId, userId, data: { ...base, services, total: total / 100, planTitle: plan.title ?? null, contract: contract ? { number: contract.number, date: contract.createdAt.toISOString() } : null } });
    return view(doc);
  }

  /** A refusal of an intervention, issued when the patient declines. */
  async refusal(orgId: string, userId: string, visitId: string, body: { what?: string; risks?: string }) {
    const what = String(body?.what ?? '').trim().slice(0, 500);
    if (!what) throw new BadRequestException('Укажите, от какого вмешательства отказывается пациент');
    const visit = await this.prisma.appointment.findFirst({ where: { id: visitId, organizationId: orgId }, include: { patient: true, doctor: true } });
    if (!visit) throw new NotFoundException('Визит не найден');
    const base = await this.snapshot(orgId, visit);
    return view(await this.issue(orgId, visit.patientId, 'REFUSAL', { appointmentId: visitId, userId, data: { ...base, what, risks: String(body?.risks ?? '').trim().slice(0, 2000) } }));
  }

  /** The tax office certificate of paid medical services for one calendar year. */
  async taxCertificate(orgId: string, userId: string, patientId: string, body: { year?: number; payerName?: string; payerInn?: string; payerIsPatient?: boolean }) {
    const year = Number(body?.year) || new Date().getFullYear() - 1;
    const patient = await this.prisma.patient.findFirst({ where: { id: patientId, organizationId: orgId } });
    if (!patient) throw new NotFoundException('Пациент не найден');
    const payments = await this.prisma.payment.findMany({
      where: { organizationId: orgId, patientId, paidAt: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) }, method: { notIn: ['DMS', 'BONUS'] } },
      select: { amount: true },
    });
    const total = payments.reduce((sum, row) => sum + kopecks(row.amount), 0);
    if (total <= 0) throw new BadRequestException(`За ${year} год оплат нет`);
    const base = await this.snapshot(orgId, { patient, doctor: null, startsAt: new Date() });
    const payerIsPatient = body?.payerIsPatient !== false;
    return view(await this.issue(orgId, patientId, 'TAX_CERT', {
      userId,
      data: { ...base, year, total: total / 100, payerIsPatient, payerName: payerIsPatient ? null : String(body?.payerName ?? '').trim().slice(0, 200), payerInn: String(body?.payerInn ?? '').replace(/\D/g, '').slice(0, 12) || null, serviceCode: 1 },
    }));
  }

  async list(orgId: string, query: { status?: string; patientId?: string; kind?: string; take?: number }) {
    const waiting = query.status === 'waiting';
    const rows = await this.prisma.clinicDocument.findMany({
      where: {
        organizationId: orgId,
        ...(waiting ? { status: { in: ['CREATED', 'PRINTED'] } } : query.status ? { status: query.status as never } : {}),
        ...(query.patientId ? { patientId: query.patientId } : {}),
        ...(query.kind ? { kind: query.kind as never } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(300, Number(query.take) || 150),
      include: { patient: { select: { id: true, firstName: true, lastName: true } }, appointment: { select: { id: true, startsAt: true } } },
    });
    return rows.map((row) => ({ ...view(row), patient: { id: row.patient.id, name: `${row.patient.lastName} ${row.patient.firstName}` }, visit: row.appointment ? { id: row.appointment.id, startsAt: row.appointment.startsAt.toISOString() } : null }));
  }

  async get(orgId: string, id: string) {
    const doc = await this.prisma.clinicDocument.findFirst({ where: { id, organizationId: orgId } });
    if (!doc) throw new NotFoundException('Документ не найден');
    return { ...view(doc), data: doc.data };
  }

  async mark(orgId: string, userId: string, id: string, state: 'printed' | 'signed', scanUrl?: string) {
    const doc = await this.prisma.clinicDocument.findFirst({ where: { id, organizationId: orgId } });
    if (!doc) throw new NotFoundException('Документ не найден');
    if (doc.status === 'VOID') throw new BadRequestException('Документ аннулирован');
    const scan = typeof scanUrl === 'string' && /^\/uploads\/imaging\/[\w-]+\/[\w.-]+$/.test(scanUrl) ? scanUrl : undefined;
    const data: Prisma.ClinicDocumentUpdateInput =
      state === 'printed'
        ? { printedAt: doc.printedAt ?? new Date(), status: doc.status === 'CREATED' ? 'PRINTED' : doc.status }
        : { status: 'SIGNED', signedAt: doc.signedAt ?? new Date(), signedById: doc.signedById ?? userId, ...(scan ? { scanUrl: scan } : {}) };
    const row = await this.prisma.clinicDocument.update({ where: { id }, data });
    await this.prisma.auditLog.create({ data: { organizationId: orgId, userId, entityType: 'ClinicDocument', entityId: id, action: 'UPDATE', changes: { state, number: doc.number, scan: Boolean(scan) } } });
    return view(row);
  }

  async void(orgId: string, userId: string, id: string, reason: string) {
    const why = String(reason ?? '').trim();
    if (why.length < 5) throw new BadRequestException('Укажите причину аннулирования');
    const doc = await this.prisma.clinicDocument.findFirst({ where: { id, organizationId: orgId } });
    if (!doc) throw new NotFoundException('Документ не найден');
    const row = await this.prisma.clinicDocument.update({ where: { id }, data: { status: 'VOID', voidReason: why.slice(0, 500) } });
    await this.prisma.auditLog.create({ data: { organizationId: orgId, userId, entityType: 'ClinicDocument', entityId: id, action: 'UPDATE', changes: { state: 'void', number: doc.number } } });
    return view(row);
  }

  /** What every paper carries: the clinic, the patient, the doctor and the date, as of issuing. */
  private async snapshot(
    orgId: string,
    visit: { patient: { lastName: string; firstName: string; middleName: string | null; birthDate: Date | null; phone: string | null; email: string | null }; doctor: { lastName: string; firstName: string; middleName: string | null; specialization: string | null } | null; startsAt: Date },
  ) {
    const clinic = await this.clinic(orgId);
    const p = visit.patient;
    return {
      clinic,
      patient: { name: [p.lastName, p.firstName, p.middleName].filter(Boolean).join(' '), birthDate: p.birthDate?.toISOString() ?? null, phone: p.phone, email: p.email },
      doctor: visit.doctor ? { name: [visit.doctor.lastName, visit.doctor.firstName, visit.doctor.middleName].filter(Boolean).join(' '), specialization: visit.doctor.specialization } : null,
      visitAt: visit.startsAt.toISOString(),
      issuedAt: new Date().toISOString(),
    };
  }

  private async issue(orgId: string, patientId: string, kind: DocumentKind, input: { appointmentId?: string; treatmentPlanId?: string; topic?: string; userId?: string; data: Record<string, unknown> }, tx?: Prisma.TransactionClient) {
    const title = input.topic && kind === 'IDS_INTERVENTION' ? `${DOCUMENT_TITLES[kind]}: ${TOPIC_TITLES[input.topic as InterventionTopic]}` : DOCUMENT_TITLES[kind];
    const run = async (db: Prisma.TransactionClient) => {
      await lockDocuments(db, orgId);
      const number = await nextNumber(db, orgId);
      return db.clinicDocument.create({
        data: { organizationId: orgId, patientId, appointmentId: input.appointmentId, treatmentPlanId: input.treatmentPlanId, kind, topic: input.topic, number, title, data: input.data as Prisma.InputJsonValue, createdById: input.userId },
      });
    };
    return tx ? run(tx) : this.prisma.$transaction(run);
  }
}

/** One clinic issues one paper at a time, so numbers never collide and nothing is issued twice. */
async function lockDocuments(db: Prisma.TransactionClient, orgId: string) {
  await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`documents:${orgId}`}))`;
}

/** Numbers run per clinic per year: 2026-000001. */
async function nextNumber(db: Db, orgId: string) {
  const year = new Date().getFullYear();
  const last = await db.clinicDocument.findFirst({ where: { organizationId: orgId, number: { startsWith: `${year}-` } }, orderBy: { number: 'desc' }, select: { number: true } });
  const next = (last ? Number(last.number.split('-')[1]) : 0) + 1;
  return `${year}-${String(next).padStart(6, '0')}`;
}

function view(doc: { id: string; kind: string; topic: string | null; number: string; title: string; status: string; createdAt: Date; printedAt: Date | null; signedAt: Date | null; scanUrl: string | null; voidReason: string | null; appointmentId: string | null; patientId: string }) {
  return {
    id: doc.id, kind: doc.kind, topic: doc.topic, number: doc.number, title: doc.title, status: doc.status, createdAt: doc.createdAt.toISOString(),
    printedAt: doc.printedAt?.toISOString() ?? null, signedAt: doc.signedAt?.toISOString() ?? null, scanUrl: doc.scanUrl, voidReason: doc.voidReason,
    appointmentId: doc.appointmentId, patientId: doc.patientId, blocking: BLOCKING_KINDS.includes(doc.kind as DocumentKind),
  };
}

@ApiTags('documents')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get()
  @RequirePermissions('patient.read')
  list(@OrgId() orgId: string, @Query() query: { status?: string; patientId?: string; kind?: string; take?: number }) {
    return this.documents.list(orgId, query);
  }

  @Get('clinic')
  @RequirePermissions('patient.read')
  async clinic(@OrgId() orgId: string) {
    const clinic = await this.documents.clinic(orgId);
    return { ...clinic, missing: this.documents.missingRequisites(clinic) };
  }

  @Put('clinic')
  @RequirePermissions('org.manage')
  saveClinic(@OrgId() orgId: string, @CurrentUser() user: AuthUser, @Body() body: Partial<ClinicRequisites>) {
    return this.documents.saveClinic(orgId, user.id, body);
  }

  @Post('visit/:id')
  @RequirePermissions('patient.read')
  visit(@OrgId() orgId: string, @CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.documents.forVisit(orgId, id, user.id);
  }

  @Post('visit/:id/refusal')
  @RequirePermissions('medical.write')
  refusal(@OrgId() orgId: string, @CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: { what?: string; risks?: string }) {
    return this.documents.refusal(orgId, user.id, id, body);
  }

  @Post('plan/:id/estimate')
  @RequirePermissions('patient.write')
  estimate(@OrgId() orgId: string, @CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.documents.estimate(orgId, user.id, id);
  }

  @Post('patient/:id/tax')
  @RequirePermissions('finance.read')
  tax(@OrgId() orgId: string, @CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: { year?: number; payerName?: string; payerInn?: string; payerIsPatient?: boolean }) {
    return this.documents.taxCertificate(orgId, user.id, id, body);
  }

  @Get(':id')
  @RequirePermissions('patient.read')
  get(@OrgId() orgId: string, @Param('id') id: string) {
    return this.documents.get(orgId, id);
  }

  @Post(':id/printed')
  @RequirePermissions('patient.read')
  printed(@OrgId() orgId: string, @CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.documents.mark(orgId, user.id, id, 'printed');
  }

  @Post(':id/signed')
  @RequirePermissions('patient.write')
  signed(@OrgId() orgId: string, @CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: { scanUrl?: string }) {
    return this.documents.mark(orgId, user.id, id, 'signed', body?.scanUrl);
  }

  @Post(':id/void')
  @RequirePermissions('patient.write')
  void(@OrgId() orgId: string, @CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: { reason?: string }) {
    return this.documents.void(orgId, user.id, id, body?.reason ?? '');
  }
}
