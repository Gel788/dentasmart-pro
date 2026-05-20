import { Injectable } from '@nestjs/common';
import { AuditAction, Prisma } from '@dentasmart/database';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(params: {
    organizationId: string;
    userId?: string;
    entityType: string;
    entityId?: string;
    action: AuditAction;
    changes?: Prisma.InputJsonValue;
    ipAddress?: string;
    userAgent?: string;
  }) {
    return this.prisma.auditLog.create({ data: params });
  }
}
