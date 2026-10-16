import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthUser } from '@dentasmart/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { CreatePatientDto } from './dto/create-patient.dto';

@Injectable()
export class PatientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll(orgId: string, search?: string, page = 1, pageSize = 20) {
    const where = {
      organizationId: orgId,
      isActive: true,
      ...(search
        ? {
            OR: [
              { firstName: { contains: search, mode: 'insensitive' as const } },
              { lastName: { contains: search, mode: 'insensitive' as const } },
              { phone: { contains: search } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.patient.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.patient.count({ where }),
    ]);

    return { items, total, page, pageSize };
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

  async update(orgId: string, id: string, dto: Partial<CreatePatientDto>, userId: string) {
    if (dto.phone) await this.assertPhoneFree(orgId, dto.phone, id);
    const { birthDate, consentPd, dmsInsurer, dmsNumber, isActive, ...rest } = dto;
    const patient = await this.prisma.patient.update({
      where: { id },
      data: {
        ...rest,
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
