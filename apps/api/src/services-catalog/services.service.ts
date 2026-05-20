import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ServicesCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  list(orgId: string) {
    return this.prisma.service.findMany({
      where: { organizationId: orgId, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  create(orgId: string, data: { name: string; durationMin?: number; basePrice?: number; code?: string }) {
    return this.prisma.service.create({
      data: {
        organizationId: orgId,
        name: data.name,
        durationMin: data.durationMin ?? 30,
        basePrice: data.basePrice ?? 0,
        code: data.code,
      },
    });
  }
}
