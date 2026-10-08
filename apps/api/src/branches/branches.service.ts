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

  async overview(orgId: string) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const [branches, visits, shifts] = await Promise.all([
      this.findAll(orgId),
      this.prisma.appointment.groupBy({
        by: ['branchId'],
        where: { organizationId: orgId, startsAt: { gte: start, lt: end }, status: { not: 'CANCELLED' } },
        _count: { _all: true },
      }),
      this.prisma.cashShift.findMany({
        where: { organizationId: orgId, status: 'OPEN' },
        select: { branchId: true },
      }),
    ]);
    const visitCount = new Map(visits.map((row) => [row.branchId, row._count._all]));
    const openCash = new Set(shifts.map((row) => row.branchId));
    return branches.map((branch) => ({
      ...branch,
      visitsToday: visitCount.get(branch.id) ?? 0,
      cashOpen: openCash.has(branch.id),
      sharedPatients: true,
    }));
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
