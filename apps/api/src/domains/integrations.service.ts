import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class IntegrationsService {
  constructor(private readonly prisma: PrismaService) {}

  list(orgId: string) {
    return this.prisma.integrationConfig.findMany({ where: { organizationId: orgId } });
  }

  webhooks(orgId: string) {
    return this.prisma.webhookEndpoint.findMany({ where: { organizationId: orgId } });
  }

  blockchainAudit(orgId: string) {
    return this.prisma.medicalRecordHash.findMany({
      where: { organizationId: orgId },
      orderBy: { chainedAt: 'desc' },
      take: 50,
    });
  }

  upsertConfig(orgId: string, data: { provider: string; configJson: object; isActive?: boolean }) {
    return this.prisma.integrationConfig.upsert({
      where: {
        organizationId_provider: { organizationId: orgId, provider: data.provider as never },
      },
      create: {
        organizationId: orgId,
        provider: data.provider as never,
        configJson: data.configJson,
        isActive: data.isActive ?? false,
      },
      update: { configJson: data.configJson, isActive: data.isActive ?? false },
    });
  }

  journal(orgId: string) {
    return this.prisma.integrationLog.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: 'desc' },
      take: 40,
    });
  }

  async dispatch(orgId: string, data: { provider: string; action: string }) {
    const config = await this.prisma.integrationConfig.findUnique({
      where: { organizationId_provider: { organizationId: orgId, provider: data.provider as never } },
    });
    const blocked = data.provider === 'ATOL' || data.provider === 'EGISZ';
    const status = !config?.isActive || blocked ? 'SKIPPED' : 'QUEUED';
    const message = !config?.isActive
      ? 'Провайдер выключен. Во внешнюю систему ничего не ушло.'
      : blocked
        ? data.provider === 'ATOL'
          ? 'Касса 54-ФЗ не подключена к оператору. Чек не отправлен, запись только в журнале.'
          : 'ЕГИСЗ не подключена. Документ не выгружен, запись только в журнале.'
        : 'Поставлено в очередь. Внешний API не вызывался.';
    return this.prisma.integrationLog.create({
      data: {
        organizationId: orgId,
        provider: data.provider as never,
        action: data.action,
        status: status as never,
        message,
      },
    });
  }

  createWebhook(orgId: string, data: { url: string; events: string[]; secret: string }) {
    return this.prisma.webhookEndpoint.create({
      data: { organizationId: orgId, url: data.url, events: data.events, secret: data.secret },
    });
  }

  async chainMedicalRecord(orgId: string, data: { patientId: string; recordType: string; recordId: string; content: string }) {
    const crypto = await import('crypto');
    const contentHash = crypto.createHash('sha256').update(data.content).digest('hex');
    const prev = await this.prisma.medicalRecordHash.findFirst({
      where: { organizationId: orgId, patientId: data.patientId },
      orderBy: { chainedAt: 'desc' },
    });
    const prevHash = prev?.contentHash ?? null;
    const chained = crypto.createHash('sha256').update((prevHash ?? '') + contentHash).digest('hex');
    return this.prisma.medicalRecordHash.create({
      data: {
        organizationId: orgId,
        patientId: data.patientId,
        recordType: data.recordType,
        recordId: data.recordId,
        contentHash: chained,
        prevHash,
      },
    });
  }
}
