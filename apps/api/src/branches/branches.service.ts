import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BranchesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(orgId: string) {
    return this.prisma.branch.findMany({
      where: { organizationId: orgId, isActive: true },
      include: {
        cabinets: { where: { isActive: true }, orderBy: { name: 'asc' } },
        _count: { select: { employees: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  createBranch(orgId: string, data: { name: string; address?: string; phone?: string }) {
    return this.prisma.branch.create({ data: { organizationId: orgId, ...data } });
  }

  createCabinet(branchId: string, orgId: string, data: { name: string; number?: string; purpose?: string }) {
    return this.prisma.branch.findFirst({ where: { id: branchId, organizationId: orgId } }).then((b) => {
      if (!b) throw new NotFoundException();
      return this.prisma.cabinet.create({
        data: {
          branchId,
          name: data.name,
          number: data.number,
          purpose: (data.purpose as never) ?? 'UNIVERSAL',
        },
      });
    });
  }
}
