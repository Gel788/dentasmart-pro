import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CommunicationsService {
  constructor(private readonly prisma: PrismaService) {}

  listThreads(orgId: string) {
    return this.prisma.communicationThread.findMany({
      where: { organizationId: orgId },
      include: { messages: { take: 1, orderBy: { sentAt: 'desc' } } },
      orderBy: { lastMessageAt: 'desc' },
      take: 50,
    });
  }

  listCalls(orgId: string) {
    return this.prisma.callRecord.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  createThread(orgId: string, data: { patientId: string; channel: string; body: string }) {
    return this.prisma.communicationThread.create({
      data: {
        organizationId: orgId,
        patientId: data.patientId,
        channel: data.channel as never,
        messages: { create: { direction: 'out', body: data.body } },
      },
      include: { messages: true },
    });
  }

  addMessage(threadId: string, body: string, direction: 'in' | 'out' = 'out') {
    return this.prisma.communicationMessage.create({
      data: { threadId, body, direction },
    });
  }

  logCall(orgId: string, data: { phone: string; patientId?: string; durationSec?: number; transcript?: string }) {
    return this.prisma.callRecord.create({ data: { organizationId: orgId, ...data } });
  }
}
