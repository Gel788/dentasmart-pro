import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const TRIGGER_TEXT: Record<string, string> = {
  NO_VISIT_6M: 'Давно не были в клинике. Запишитесь на осмотр.',
  NO_VISIT_12M: 'Год без визита. Пора проверить зубы.',
  BIRTHDAY: 'С днём рождения. Ждём вас на приём.',
  AFTER_TREATMENT: 'Как самочувствие после лечения? Напишите, если есть боль.',
  ABANDONED_BOOKING: 'Вы не пришли на приём. Можем перенести запись.',
};

const CLINIC_TRIGGERS = [
  { name: 'Давно не были', trigger: 'NO_VISIT_6M' },
  { name: 'Неявка', trigger: 'ABANDONED_BOOKING' },
  { name: 'После лечения', trigger: 'AFTER_TREATMENT' },
];

@Injectable()
export class MarketingService {
  constructor(private readonly prisma: PrismaService) {}

  listCampaigns(orgId: string) {
    return this.prisma.marketingCampaign.findMany({
      where: { organizationId: orgId },
      orderBy: { id: 'desc' },
    });
  }

  listChains(orgId: string) {
    return this.prisma.automationChain.findMany({ where: { organizationId: orgId } });
  }

  listSegments(orgId: string) {
    return this.prisma.patientSegment.findMany({
      where: { organizationId: orgId },
      include: { _count: { select: { members: true } } },
    });
  }

  listLoyalty(orgId: string) {
    return this.prisma.loyaltyProgram.findMany({
      where: { organizationId: orgId },
      include: { accounts: { take: 10 } },
    });
  }

  createCampaign(orgId: string, data: { name: string; channel: string }) {
    return this.prisma.marketingCampaign.create({
      data: { organizationId: orgId, name: data.name, channel: data.channel, status: 'DRAFT' },
    });
  }

  createChain(orgId: string, data: { name: string; trigger: string; stepsJson: object }) {
    return this.prisma.automationChain.create({
      data: { organizationId: orgId, name: data.name, trigger: data.trigger as never, stepsJson: data.stepsJson },
    });
  }

  async refreshSegment(orgId: string, segmentId: string) {
    const segment = await this.prisma.patientSegment.findFirst({
      where: { id: segmentId, organizationId: orgId },
    });
    if (!segment) return null;
    const rules = segment.rulesJson as { minVisits?: number; tag?: string };
    const patients = await this.prisma.patient.findMany({
      where: {
        organizationId: orgId,
        isActive: true,
        ...(rules.tag ? { tags: { has: rules.tag } } : {}),
      },
    });
    await this.prisma.patientSegmentMember.deleteMany({ where: { segmentId } });
    for (const p of patients) {
      await this.prisma.patientSegmentMember.create({ data: { segmentId, patientId: p.id } });
    }
    return this.prisma.patientSegment.findUnique({
      where: { id: segmentId },
      include: { _count: { select: { members: true } } },
    });
  }

  createSegment(orgId: string, data: { name: string; rulesJson: object; isDynamic?: boolean }) {
    return this.prisma.patientSegment.create({
      data: {
        organizationId: orgId,
        name: data.name,
        rulesJson: data.rulesJson,
        isDynamic: data.isDynamic ?? true,
      },
    });
  }

  async ensureClinicTriggers(orgId: string) {
    for (const item of CLINIC_TRIGGERS) {
      const existing = await this.prisma.automationChain.findFirst({
        where: { organizationId: orgId, name: item.name },
      });
      if (!existing) {
        await this.prisma.automationChain.create({
          data: { organizationId: orgId, name: item.name, trigger: item.trigger as never, stepsJson: { channel: 'SMS' } },
        });
      }
    }
    return this.listChains(orgId);
  }

  async runChain(orgId: string, chainId: string) {
    const chain = await this.prisma.automationChain.findFirst({
      where: { id: chainId, organizationId: orgId, isActive: true },
    });
    if (!chain) return { queued: 0, chain: '' };
    const patients = await this.audience(orgId, chain.trigger);
    const message = TRIGGER_TEXT[chain.trigger] ?? chain.name;
    let queued = 0;
    for (const patient of patients) {
      if (!patient.phone && !patient.email) continue;
      const already = await this.prisma.reminder.findFirst({
        where: { organizationId: orgId, patientId: patient.id, message, status: 'PENDING' },
      });
      if (already) continue;
      await this.prisma.reminder.create({
        data: {
          organizationId: orgId,
          patientId: patient.id,
          channel: patient.phone ? 'SMS' : 'EMAIL',
          message,
          scheduledAt: new Date(),
        },
      });
      queued++;
    }
    return { queued, matched: patients.length, chain: chain.name };
  }

  private async audience(orgId: string, trigger: string) {
    if (trigger === 'NO_VISIT_6M' || trigger === 'NO_VISIT_12M') {
      const border = new Date();
      border.setMonth(border.getMonth() - (trigger === 'NO_VISIT_12M' ? 12 : 6));
      const visits = await this.prisma.appointment.findMany({
        where: { organizationId: orgId, status: 'COMPLETED' },
        select: {
          patientId: true,
          startsAt: true,
          patient: { select: { id: true, phone: true, email: true } },
        },
        orderBy: { startsAt: 'desc' },
      });
      const last = new Map<string, (typeof visits)[number]>();
      for (const visit of visits) if (!last.has(visit.patientId)) last.set(visit.patientId, visit);
      return [...last.values()].filter((visit) => visit.startsAt < border).map((visit) => visit.patient);
    }
    if (trigger === 'BIRTHDAY') {
      const today = new Date();
      const patients = await this.prisma.patient.findMany({
        where: { organizationId: orgId, isActive: true, birthDate: { not: null } },
        select: { id: true, phone: true, email: true, birthDate: true },
      });
      return patients.filter((patient) => patient.birthDate
        && patient.birthDate.getDate() === today.getDate()
        && patient.birthDate.getMonth() === today.getMonth());
    }
    if (trigger === 'AFTER_TREATMENT') {
      const since = new Date();
      since.setDate(since.getDate() - 2);
      const visits = await this.prisma.appointment.findMany({
        where: { organizationId: orgId, status: 'COMPLETED', startsAt: { gte: since } },
        select: { patient: { select: { id: true, phone: true, email: true } } },
      });
      return uniquePatients(visits.map((visit) => visit.patient));
    }
    const since = new Date();
    since.setDate(since.getDate() - 14);
    const missed = await this.prisma.appointment.findMany({
      where: { organizationId: orgId, status: 'NO_SHOW', startsAt: { gte: since } },
      select: { patient: { select: { id: true, phone: true, email: true } } },
    });
    return uniquePatients(missed.map((visit) => visit.patient));
  }
}

function uniquePatients<T extends { id: string }>(patients: T[]) {
  const seen = new Set<string>();
  return patients.filter((patient) => {
    if (seen.has(patient.id)) return false;
    seen.add(patient.id);
    return true;
  });
}
