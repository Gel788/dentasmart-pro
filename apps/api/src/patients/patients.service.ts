import { Injectable, NotFoundException } from '@nestjs/common';
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
      include: { toothRecords: { orderBy: { toothNum: 'asc' } } },
    });
    if (!patient) throw new NotFoundException('Пациент не найден');
    return patient;
  }

  async create(user: AuthUser, dto: CreatePatientDto) {
    const { birthDate, ...rest } = dto;
    const patient = await this.prisma.patient.create({
      data: {
        ...rest,
        birthDate: birthDate ? new Date(birthDate) : undefined,
        organizationId: user.organizationId,
      },
    });

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
        treatmentPlans: { include: { items: true }, orderBy: { updatedAt: 'desc' }, take: 10 },
        appointments: { orderBy: { startsAt: 'desc' }, take: 10, include: { service: true, doctor: true } },
        invoices: { orderBy: { createdAt: 'desc' }, take: 10 },
        imagingStudies: { orderBy: { takenAt: 'desc' }, take: 20 },
        consents: { orderBy: { id: 'desc' } },
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

    const activePlan = patient.treatmentPlans.find((p) =>
      ['ACCEPTED', 'IN_PROGRESS', 'PROPOSED'].includes(p.status),
    );

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
    const { birthDate, ...rest } = dto;
    const patient = await this.prisma.patient.update({
      where: { id },
      data: {
        ...rest,
        ...(birthDate !== undefined
          ? { birthDate: birthDate ? new Date(birthDate) : null }
          : {}),
      },
    });
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
}
