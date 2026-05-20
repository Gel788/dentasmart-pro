import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ClinicalService {
  constructor(private readonly prisma: PrismaService) {}

  listPlans(orgId: string, patientId?: string) {
    return this.prisma.treatmentPlan.findMany({
      where: { organizationId: orgId, ...(patientId ? { patientId } : {}) },
      include: { items: true, patient: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    });
  }

  createPlan(orgId: string, data: { patientId: string; title: string; doctorId?: string; appointmentId?: string }) {
    return this.prisma.treatmentPlan.create({
      data: { organizationId: orgId, ...data },
      include: { items: true },
    });
  }

  async createPlanFromAppointment(orgId: string, appointmentId: string) {
    const appt = await this.prisma.appointment.findFirst({
      where: { id: appointmentId, organizationId: orgId },
      include: { service: true },
    });
    if (!appt) throw new NotFoundException('Запись не найдена');

    const existing = await this.prisma.treatmentPlan.findFirst({
      where: { appointmentId, status: { notIn: ['CANCELLED', 'COMPLETED'] } },
    });
    if (existing) return existing;

    const title = appt.service?.name
      ? `Лечение: ${appt.service.name}`
      : `План после приёма ${new Date(appt.startsAt).toLocaleDateString('ru-RU')}`;

    const plan = await this.prisma.treatmentPlan.create({
      data: {
        organizationId: orgId,
        patientId: appt.patientId,
        doctorId: appt.doctorId ?? undefined,
        appointmentId,
        title,
        status: 'IN_PROGRESS',
      },
      include: { items: true },
    });

    if (appt.service) {
      const price = Number(appt.service.basePrice);
      await this.prisma.treatmentPlanItem.create({
        data: {
          planId: plan.id,
          title: appt.service.name,
          price,
          serviceId: appt.service.id,
          sortOrder: 0,
        },
      });
      await this.recalcPlanTotal(plan.id);
    }

    return this.getPlan(plan.id);
  }

  listImaging(patientId: string) {
    return this.prisma.imagingStudy.findMany({
      where: { patientId },
      orderBy: { takenAt: 'desc' },
    });
  }

  listConsents(orgId: string, patientId?: string) {
    return this.prisma.patientConsent.findMany({
      where: { organizationId: orgId, ...(patientId ? { patientId } : {}) },
      orderBy: { id: 'desc' },
      take: 50,
    });
  }

  async getToothChart(patientId: string) {
    const patient = await this.prisma.patient.findUnique({ where: { id: patientId } });
    if (!patient) throw new NotFoundException();
    return this.prisma.toothRecord.findMany({
      where: { patientId },
      orderBy: [{ formula: 'asc' }, { toothNum: 'asc' }],
    });
  }

  upsertTooth(patientId: string, data: { toothNum: number; formula: 'ADULT' | 'CHILD'; condition: string; diagnosis?: string }) {
    return this.prisma.toothRecord.upsert({
      where: {
        patientId_formula_toothNum: {
          patientId,
          formula: data.formula,
          toothNum: data.toothNum,
        },
      },
      create: { patientId, ...data, condition: data.condition as never },
      update: { condition: data.condition as never, diagnosis: data.diagnosis },
    });
  }

  addPlanItem(planId: string, data: { title: string; toothNum?: number; price?: number; serviceId?: string }) {
    return this.prisma.treatmentPlanItem.create({
      data: { planId, title: data.title, toothNum: data.toothNum, price: data.price ?? 0, serviceId: data.serviceId },
    });
  }

  addDiaryEntry(planId: string, notes: string, toothNum?: number) {
    return this.prisma.treatmentDiaryEntry.create({ data: { planId, notes, toothNum } });
  }

  addImaging(patientId: string, data: { type: string; fileUrl: string; title?: string; toothNum?: number }) {
    return this.prisma.imagingStudy.create({
      data: { patientId, type: data.type as never, fileUrl: data.fileUrl, title: data.title, toothNum: data.toothNum },
    });
  }

  signConsent(orgId: string, data: { patientId: string; type: string }) {
    return this.prisma.patientConsent.create({
      data: {
        organizationId: orgId,
        patientId: data.patientId,
        type: data.type as never,
        status: 'SIGNED',
        signedAt: new Date(),
      },
    });
  }

  async updatePlanStatus(planId: string, status: string) {
    const plan = await this.prisma.treatmentPlan.update({
      where: { id: planId },
      data: { status: status as never },
      include: { items: true },
    });
    return plan;
  }

  async togglePlanItem(itemId: string, isCompleted: boolean) {
    return this.prisma.treatmentPlanItem.update({
      where: { id: itemId },
      data: { isCompleted },
    });
  }

  async recalcPlanTotal(planId: string) {
    const items = await this.prisma.treatmentPlanItem.findMany({ where: { planId } });
    const total = items.reduce((s, i) => s + Number(i.price), 0);
    return this.prisma.treatmentPlan.update({
      where: { id: planId },
      data: { totalPrice: total },
      include: { items: true, patient: true },
    });
  }

  getPlan(planId: string) {
    return this.prisma.treatmentPlan.findUniqueOrThrow({
      where: { id: planId },
      include: {
        items: { orderBy: { sortOrder: 'asc' } },
        diaryEntries: { orderBy: { createdAt: 'desc' } },
        patient: true,
        doctor: true,
      },
    });
  }

  async reorderPlanItems(planId: string, itemIds: string[]) {
    await Promise.all(
      itemIds.map((id, index) =>
        this.prisma.treatmentPlanItem.update({
          where: { id },
          data: { sortOrder: index },
        }),
      ),
    );
    return this.getPlan(planId);
  }

  async createAlternativePlan(orgId: string, parentPlanId: string, title: string) {
    const parent = await this.prisma.treatmentPlan.findUniqueOrThrow({ where: { id: parentPlanId } });
    return this.prisma.treatmentPlan.create({
      data: {
        organizationId: orgId,
        patientId: parent.patientId,
        doctorId: parent.doctorId,
        title,
        isAlternative: true,
        parentPlanId,
      },
      include: { items: true, alternatives: true },
    });
  }

  async completePlanItemWithMaterials(
    orgId: string,
    itemId: string,
    branchId: string,
    isCompleted: boolean,
  ) {
    const item = await this.prisma.treatmentPlanItem.update({
      where: { id: itemId },
      data: { isCompleted },
      include: { service: true, plan: true },
    });
    if (isCompleted && item.serviceId) {
      const norms = await this.prisma.serviceMaterialNorm.findMany({
        where: { organizationId: orgId, serviceId: item.serviceId },
      });
      for (const norm of norms) {
        await this.prisma.stockMovement.create({
          data: {
            organizationId: orgId,
            itemId: norm.itemId,
            branchId,
            type: 'TREATMENT_USE',
            quantity: norm.quantity,
            notes: `Списание по услуге: ${item.title}`,
          },
        });
        const batch = await this.prisma.stockBatch.findFirst({
          where: { itemId: norm.itemId, branchId },
        });
        if (batch) {
          const next = Math.max(0, Number(batch.quantity) - Number(norm.quantity));
          await this.prisma.stockBatch.update({ where: { id: batch.id }, data: { quantity: next } });
        }
      }
    }
    return item;
  }

  addDiaryWithPhoto(planId: string, notes: string, photoUrl?: string, toothNum?: number) {
    return this.prisma.treatmentDiaryEntry.create({
      data: { planId, notes, photoUrl, toothNum },
    });
  }

  listPhotoPairs(patientId: string) {
    return this.prisma.imagingStudy.findMany({
      where: { patientId, type: 'PHOTO' },
      orderBy: { takenAt: 'desc' },
    });
  }
}
