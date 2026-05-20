import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  getOrg(orgId: string) {
    return this.prisma.organization.findUniqueOrThrow({
      where: { id: orgId },
      include: { widgetConfigs: { take: 1 } },
    });
  }

  getWidget(orgId: string) {
    return this.prisma.widgetConfig.findFirst({ where: { organizationId: orgId } });
  }

  async upsertWidget(orgId: string, data: { primaryColor?: string; logoUrl?: string }) {
    const existing = await this.prisma.widgetConfig.findFirst({ where: { organizationId: orgId } });
    if (existing) {
      return this.prisma.widgetConfig.update({ where: { id: existing.id }, data });
    }
    return this.prisma.widgetConfig.create({ data: { organizationId: orgId, ...data } });
  }

  auditLog(orgId: string) {
    return this.prisma.auditLog.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { user: { select: { email: true } } },
    });
  }

  medicalAuditChain(orgId: string) {
    return this.prisma.medicalRecordHash.findMany({
      where: { organizationId: orgId },
      orderBy: { chainedAt: 'desc' },
      take: 50,
    });
  }
}
