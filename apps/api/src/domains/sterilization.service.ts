import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SterilizationService {
  constructor(private readonly prisma: PrismaService) {}

  list(orgId: string) {
    return this.prisma.sterilizationCycle.findMany({
      where: { organizationId: orgId },
      include: { branch: { select: { name: true } } },
      orderBy: { startedAt: 'desc' },
      take: 100,
    });
  }

  create(
    orgId: string,
    data: { branchId: string; autoclave: string; loadNote: string; result: 'PASS' | 'FAIL'; operatorName?: string },
  ) {
    return this.prisma.sterilizationCycle.create({
      data: { organizationId: orgId, ...data },
      include: { branch: { select: { name: true } } },
    });
  }
}
