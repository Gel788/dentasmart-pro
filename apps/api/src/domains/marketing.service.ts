import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

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

  async runChain(orgId: string, chainId: string) {
    const chain = await this.prisma.automationChain.findFirst({
      where: { id: chainId, organizationId: orgId, isActive: true },
    });
    if (!chain) return { queued: 0 };
    const patients = await this.prisma.patient.findMany({
      where: { organizationId: orgId, isActive: true },
      take: 50,
    });
    let queued = 0;
    for (const p of patients) {
      if (!p.phone && !p.email) continue;
      await this.prisma.patientCommunication.create({
        data: {
          patientId: p.id,
          channel: 'SMS',
          summary: `[${chain.name}] автоцепочка ${chain.trigger}`,
        },
      });
      queued++;
    }
    return { queued, chain: chain.name };
  }
}
