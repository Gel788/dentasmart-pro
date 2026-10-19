import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@dentasmart/database';
import {
  AuthUser,
  DORMANT_DAYS,
  fromKopecks,
  kopecks,
  MEDICAL_KEYS,
  medicalDiff,
  medicalReviewDue,
  normalizeMedical,
  type MedicalFields,
  patientSegments,
  phoneNeedle,
  searchTerms,
  SEGMENTS,
  type PatientSegment,
} from '@dentasmart/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { CreatePatientDto } from './dto/create-patient.dto';
import { MedicalDto } from './dto/medical.dto';

export type PatientSort = 'name' | 'lastVisit' | 'nextVisit' | 'debt' | 'recent';
export type PatientListQuery = { search?: string; page?: number; pageSize?: number; segment?: string; sort?: string };

type RegistryRow = {
  id: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  birthDate: Date | null;
  gender: string | null;
  phone: string | null;
  email: string | null;
  clientType: string | null;
  allergies: string[];
  anticoagulant: boolean;
  pregnant: boolean;
  anxiety: string;
  tags: string[];
  createdAt: Date;
  lastVisit: Date | null;
  nextVisit: Date | null;
  debt: Prisma.Decimal;
  deposit: Prisma.Decimal;
};

const UPPER = 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯABCDEFGHIJKLMNOPQRSTUVWXYZё';
const LOWER = 'абвгдеежзийклмнопрстуфхцчшщъыьэюяabcdefghijklmnopqrstuvwxyzе';

/** Lower case with ё → е, spelled out so it does not depend on the database locale. */
const folded = (expr: Prisma.Sql) => Prisma.sql`translate(${expr}, ${UPPER}, ${LOWER})`;

const SEGMENT_IDS = new Set<string>(SEGMENTS.map((item) => item.id).filter((id) => id !== 'all'));

const SEGMENT_SQL: Record<PatientSegment, Prisma.Sql> = {
  declined: Prisma.sql`declined`,
  phone: Prisma.sql`NOT declined AND has_phone`,
  debt: Prisma.sql`NOT declined AND debt > 0`,
  upcoming: Prisma.sql`NOT declined AND "nextVisit" IS NOT NULL`,
  dormant: Prisma.sql`NOT declined AND idle`,
};

const SORTS: Record<PatientSort, Prisma.Sql> = {
  // Cyrillic names first, names typed in Latin letters after them.
  name: Prisma.sql`("lastName" ~ '^[A-Za-z]'), ${folded(Prisma.sql`"lastName"`)}, ${folded(Prisma.sql`"firstName"`)}`,
  lastVisit: Prisma.sql`"lastVisit" DESC NULLS LAST`,
  nextVisit: Prisma.sql`"nextVisit" ASC NULLS LAST`,
  debt: Prisma.sql`debt DESC`,
  recent: Prisma.sql`"createdAt" DESC`,
};

type MedicalPatient = MedicalFields & { medicalVersion: number; medicalConfirmedAt: Date | null; medicalConfirmedById: string | null };

/** The medical history with who last confirmed it and whether it is due for review. Shared with the card. */
export async function medicalView(prisma: Pick<PrismaService, 'user'>, patient: MedicalPatient) {
  const by = patient.medicalConfirmedById
    ? await prisma.user.findUnique({ where: { id: patient.medicalConfirmedById }, include: { employee: true } })
    : null;
  return {
    version: patient.medicalVersion,
    fields: Object.fromEntries(MEDICAL_KEYS.map((key) => [key, patient[key]])) as MedicalFields,
    confirmedAt: patient.medicalConfirmedAt,
    confirmedBy: by ? (by.employee ? `${by.employee.lastName} ${by.employee.firstName}` : by.email) : null,
    reviewDue: medicalReviewDue(patient.medicalConfirmedAt),
  };
}

@Injectable()
export class PatientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * The registry: search by any part of the name or by phone digits, segment counters that follow the search,
   * one segment as a filter, sorting and paging. Segment rules mirror `patientSegments` in shared.
   */
  async findAll(orgId: string, query: PatientListQuery = {}) {
    const page = Math.max(1, Math.floor(query.page ?? 1));
    const pageSize = Math.min(500, Math.max(1, Math.floor(query.pageSize ?? 20)));
    const segment = query.segment && query.segment !== 'all' && SEGMENT_IDS.has(query.segment) ? query.segment : null;
    const sort = query.sort && SORTS[query.sort] ? query.sort : 'name';
    const { words, digits } = searchTerms(query.search ?? '');
    const phone = phoneNeedle(digits);
    const storedDigits = Prisma.sql`regexp_replace(coalesce(p.phone, ''), '\\D', '', 'g')`;

    const match = [
      Prisma.sql`p."organizationId" = ${orgId}`,
      Prisma.sql`p."isActive"`,
      ...words.map(
        (word) =>
          Prisma.sql`${folded(Prisma.sql`p."lastName" || ' ' || p."firstName" || ' ' || coalesce(p."middleName", '')`)} LIKE ${`%${word}%`}`,
      ),
      ...(phone
        ? [
            phone.start
              ? Prisma.sql`(${storedDigits} LIKE ${`%${phone.anywhere}%`} OR ${storedDigits} LIKE ${`${phone.start}%`})`
              : Prisma.sql`${storedDigits} LIKE ${`%${phone.anywhere}%`}`,
          ]
        : []),
    ];
    const base = Prisma.sql`
      WITH base AS (
        SELECT p.id, p."firstName", p."lastName", p."middleName", p."birthDate", p.gender, p.phone, p.email,
               p."clientType", p.allergies, p.anticoagulant, p.pregnant, p.anxiety, p.tags, p."createdAt",
               (SELECT max(a."startsAt") FROM appointments a
                 WHERE a."patientId" = p.id AND a.status = 'COMPLETED') AS "lastVisit",
               (SELECT min(a."startsAt") FROM appointments a
                 WHERE a."patientId" = p.id AND a."startsAt" >= now()
                   AND a.status NOT IN ('COMPLETED', 'CANCELLED', 'NO_SHOW')) AS "nextVisit",
               coalesce((SELECT sum(greatest(i."totalAmount" - i."discountAmount" - i."paidAmount", 0)) FROM invoices i
                 WHERE i."patientId" = p.id AND i.status IN ('ISSUED', 'PARTIAL')), 0) AS debt,
               coalesce(d.balance, 0) AS deposit
        FROM patients p
        LEFT JOIN patient_deposits d ON d."patientId" = p.id
        WHERE ${Prisma.join(match, ' AND ')}
      ), seg AS (
        SELECT base.*,
               ltrim(${folded(Prisma.sql`coalesce("clientType", '')`)}) LIKE 'отказ%' AS declined,
               length(regexp_replace(coalesce(phone, ''), '\\D', '', 'g')) >= 10 AS has_phone,
               "nextVisit" IS NULL AND ("lastVisit" IS NULL OR "lastVisit" < now() - interval '${Prisma.raw(String(DORMANT_DAYS))} days') AS idle
        FROM base
      )`;
    const where = segment ? SEGMENT_SQL[segment] : Prisma.sql`TRUE`;

    const [rows, counts] = await Promise.all([
      this.prisma.$queryRaw<RegistryRow[]>`${base}
        SELECT * FROM seg WHERE ${where}
        ORDER BY ${SORTS[sort]}, "lastName", "firstName", id
        LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
      this.prisma.$queryRaw<Record<string, bigint>[]>`${base}
        SELECT count(*) AS "all",
               count(*) FILTER (WHERE ${SEGMENT_SQL.phone}) AS phone,
               count(*) FILTER (WHERE ${SEGMENT_SQL.debt}) AS debt,
               count(*) FILTER (WHERE ${SEGMENT_SQL.upcoming}) AS upcoming,
               count(*) FILTER (WHERE ${SEGMENT_SQL.dormant}) AS dormant,
               count(*) FILTER (WHERE ${SEGMENT_SQL.declined}) AS declined
        FROM seg`,
    ]);

    const segments = Object.fromEntries(Object.entries(counts[0] ?? {}).map(([key, value]) => [key, Number(value)])) as Record<
      PatientSegment | 'all',
      number
    >;
    const now = new Date();
    const items = rows.map((row) => {
      const debtKopecks = kopecks(row.debt);
      const lastVisit = row.lastVisit?.toISOString() ?? null;
      const nextVisit = row.nextVisit?.toISOString() ?? null;
      return {
        id: row.id,
        firstName: row.firstName,
        lastName: row.lastName,
        middleName: row.middleName,
        birthDate: row.birthDate,
        gender: row.gender,
        phone: row.phone,
        email: row.email,
        clientType: row.clientType,
        allergies: row.allergies,
        anticoagulant: row.anticoagulant,
        pregnant: row.pregnant,
        anxiety: row.anxiety,
        tags: row.tags,
        createdAt: row.createdAt,
        lastVisit,
        nextVisit,
        debt: fromKopecks(debtKopecks),
        deposit: fromKopecks(kopecks(row.deposit)),
        segments: patientSegments({ phone: row.phone, lastVisit, nextVisit, debtKopecks, clientType: row.clientType }, now),
      };
    });
    const total = segment ? segments[segment] : segments.all;
    return { items, total, page, pageSize, segment: segment ?? 'all', sort, segments };
  }

  async findOne(orgId: string, id: string) {
    const patient = await this.prisma.patient.findFirst({
      where: { id, organizationId: orgId },
      include: {
        toothRecords: { orderBy: { toothNum: 'asc' } },
        insurancePolicies: { include: { insurer: true }, orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
    if (!patient) throw new NotFoundException('Пациент не найден');
    return patient;
  }

  async create(user: AuthUser, dto: CreatePatientDto) {
    if (dto.consentPd === false) throw new BadRequestException('Нужно согласие на обработку персональных данных (152-ФЗ)');
    await this.assertPhoneFree(user.organizationId, dto.phone);
    const { birthDate, consentPd, dmsInsurer, dmsNumber, isActive, ...rest } = dto;
    const patient = await this.prisma.patient.create({
      data: {
        ...rest,
        birthDate: birthDate ? new Date(birthDate) : undefined,
        organizationId: user.organizationId,
        ...(isActive === undefined ? {} : { isActive }),
      },
    });
    if (consentPd) await this.signConsent(user.organizationId, patient.id);
    if (dmsInsurer && dmsNumber) await this.savePolicy(user.organizationId, patient.id, dmsInsurer, dmsNumber);

    await this.audit.log({
      organizationId: user.organizationId,
      userId: user.id,
      entityType: 'Patient',
      entityId: patient.id,
      action: 'CREATE',
      changes: { ...dto } as object,
    });

    return patient;
  }

  async findFull(orgId: string, id: string) {
    const patient = await this.prisma.patient.findFirst({
      where: { id, organizationId: orgId },
      include: {
        toothRecords: { orderBy: [{ formula: 'asc' }, { toothNum: 'asc' }] },
        treatmentPlans: {
          include: {
            items: {
              orderBy: { sortOrder: 'asc' },
              include: {
                service: { select: { id: true, name: true, basePrice: true, code: true } },
                invoiceItem: { select: { id: true } },
              },
            },
          },
          orderBy: { updatedAt: 'desc' },
          take: 10,
        },
        appointments: { orderBy: { startsAt: 'desc' }, take: 10, include: { service: true, doctor: true, branch: { select: { name: true } } } },
        invoices: { orderBy: { createdAt: 'desc' }, take: 10 },
        imagingStudies: { orderBy: { takenAt: 'desc' }, take: 20 },
        consents: { orderBy: { id: 'desc' } },
        toothSurfaces: { orderBy: [{ toothNum: 'asc' }, { surface: 'asc' }] },
        toothEvents: { orderBy: { createdAt: 'desc' }, take: 60 },
        deposit: true,
        familyMembers: { include: { familyGroup: true } },
        installmentPlans: { include: { schedule: true }, orderBy: { createdAt: 'desc' }, take: 5 },
        loyaltyAccounts: true,
      },
    });
    if (!patient) throw new NotFoundException('Пациент не найден');

    const balanceDue = patient.invoices.reduce((sum, inv) => {
      if (inv.status === 'PAID' || inv.status === 'CANCELLED') return sum;
      return sum + Number(inv.totalAmount) - Number(inv.paidAmount);
    }, 0);

    const now = new Date();
    const nextAppointment =
      patient.appointments
        .filter(
          (a) => new Date(a.startsAt) >= now && !['CANCELLED', 'NO_SHOW', 'COMPLETED'].includes(a.status),
        )
        .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())[0] ?? null;

    const rank = (status: string, alternative: boolean) => {
      const base = { IN_PROGRESS: 0, ACCEPTED: 1, PROPOSED: 2, DRAFT: 3 }[status] ?? 9;
      return base + (alternative ? 20 : 0);
    };
    const activePlan = [...patient.treatmentPlans]
      .filter((plan) => ['ACCEPTED', 'IN_PROGRESS', 'PROPOSED', 'DRAFT'].includes(plan.status))
      .sort((a, b) => rank(a.status, a.isAlternative) - rank(b.status, b.isAlternative))[0];

    return {
      ...patient,
      summary: {
        balanceDue,
        depositBalance: Number(patient.deposit?.balance ?? 0),
        nextAppointment,
        activePlanId: activePlan?.id ?? null,
        activePlanTitle: activePlan?.title ?? null,
      },
    };
  }

  /** The medical history with who last confirmed it and whether it is due for review. */
  async medical(orgId: string, id: string) {
    const patient = await this.prisma.patient.findFirst({ where: { id, organizationId: orgId } });
    if (!patient) throw new NotFoundException('Пациент не найден');
    return this.medicalView(patient);
  }

  medicalView(patient: MedicalPatient) {
    return medicalView(this.prisma, patient);
  }

  /**
   * Saves the medical history only if nobody changed it since `dto.version` was read; otherwise 409 with
   * the current state, so the clinician sees what changed instead of overwriting it. Every save is audited
   * with the changed fields and their old values.
   */
  async saveMedical(user: AuthUser, id: string, dto: MedicalDto) {
    const orgId = user.organizationId;
    const patient = await this.prisma.patient.findFirst({ where: { id, organizationId: orgId } });
    if (!patient) throw new NotFoundException('Пациент не найден');
    const { version, confirm, ...input } = dto;
    if (patient.medicalVersion !== version) {
      throw new ConflictException({ message: 'Медкарту уже изменили. Посмотрите новую версию и внесите правку ещё раз', current: await this.medicalView(patient) });
    }
    const next = normalizeMedical(input as Partial<MedicalFields>);
    const changes = medicalDiff(patient, next);
    if (!changes.length && !confirm) return this.medicalView(patient);

    const now = new Date();
    const saved = await this.prisma.patient.updateMany({
      where: { id, organizationId: orgId, medicalVersion: version },
      data: {
        ...next,
        medicalVersion: { increment: 1 },
        ...(confirm ? { medicalConfirmedAt: now, medicalConfirmedById: user.id } : {}),
      },
    });
    if (!saved.count) {
      const fresh = await this.prisma.patient.findFirstOrThrow({ where: { id, organizationId: orgId } });
      throw new ConflictException({ message: 'Медкарту только что изменили. Посмотрите новую версию и внесите правку ещё раз', current: await this.medicalView(fresh) });
    }
    await this.audit.log({
      organizationId: orgId,
      userId: user.id,
      entityType: 'PatientMedical',
      entityId: id,
      action: 'UPDATE',
      changes: { version: version + 1, confirmed: Boolean(confirm), changes } as unknown as Prisma.InputJsonValue,
    });
    return this.medical(orgId, id);
  }

  async update(orgId: string, id: string, dto: Partial<CreatePatientDto>, userId: string) {
    const owned = await this.prisma.patient.count({ where: { id, organizationId: orgId } });
    if (!owned) throw new NotFoundException('Пациент не найден');
    if (dto.phone) await this.assertPhoneFree(orgId, dto.phone, id);
    const { birthDate, consentPd, dmsInsurer, dmsNumber, isActive, ...rest } = dto;
    const touchesMedical = MEDICAL_KEYS.some((key) => key in rest);
    const patient = await this.prisma.patient.update({
      where: { id },
      data: {
        ...rest,
        ...(touchesMedical ? { medicalVersion: { increment: 1 } } : {}),
        ...(isActive === undefined ? {} : { isActive }),
        ...(birthDate !== undefined
          ? { birthDate: birthDate ? new Date(birthDate) : null }
          : {}),
      },
    });
    if (consentPd) await this.signConsent(orgId, id);
    if (dmsInsurer && dmsNumber) await this.savePolicy(orgId, id, dmsInsurer, dmsNumber);
    await this.audit.log({
      organizationId: orgId,
      userId,
      entityType: 'Patient',
      entityId: id,
      action: 'UPDATE',
      changes: dto as object,
    });
    return patient;
  }

  async importBulk(user: AuthUser, rows: CreatePatientDto[]) {
    const items: Awaited<ReturnType<typeof this.create>>[] = [];
    for (const row of rows) {
      if (!row.firstName?.trim() || !row.lastName?.trim()) continue;
      items.push(await this.create(user, row));
    }
    return { created: items.length, items };
  }

  private async assertPhoneFree(orgId: string, phone: string | undefined, exceptId?: string) {
    const digits = phoneDigits(phone);
    if (digits.length < 10) return;
    const rows = await this.prisma.patient.findMany({
      where: { organizationId: orgId, isActive: true, phone: { not: null } },
      select: { id: true, phone: true, firstName: true, lastName: true },
      take: 1000,
    });
    const hit = rows.find((row) => row.id !== exceptId && phoneDigits(row.phone).slice(-10) === digits.slice(-10));
    if (hit) throw new BadRequestException(`Пациент с таким телефоном уже есть: ${hit.lastName} ${hit.firstName}`);
  }

  private async signConsent(orgId: string, patientId: string) {
    const existing = await this.prisma.patientConsent.findFirst({
      where: { patientId, organizationId: orgId, type: 'PD_PROCESSING', status: 'SIGNED' },
    });
    if (existing) return existing;
    return this.prisma.patientConsent.create({
      data: { organizationId: orgId, patientId, type: 'PD_PROCESSING', status: 'SIGNED', signedAt: new Date() },
    });
  }

  private async savePolicy(orgId: string, patientId: string, insurerName: string, number: string) {
    const name = insurerName.trim();
    const policyNumber = number.trim();
    if (!name || !policyNumber) return;
    const insurer = await this.prisma.insurer.upsert({
      where: { organizationId_name: { organizationId: orgId, name } },
      create: { organizationId: orgId, name },
      update: {},
    });
    const current = await this.prisma.insurancePolicy.findFirst({
      where: { organizationId: orgId, patientId, insurerId: insurer.id },
      orderBy: { createdAt: 'desc' },
    });
    if (current) {
      return this.prisma.insurancePolicy.update({ where: { id: current.id }, data: { number: policyNumber } });
    }
    return this.prisma.insurancePolicy.create({
      data: { organizationId: orgId, patientId, insurerId: insurer.id, number: policyNumber, limitAmount: 100000 },
    });
  }
}

function phoneDigits(value: string | null | undefined) {
  let digits = (value ?? '').replace(/\D/g, '');
  if (digits.startsWith('8')) digits = `7${digits.slice(1)}`;
  if (digits && !digits.startsWith('7')) digits = `7${digits}`;
  return digits.slice(0, 11);
}
