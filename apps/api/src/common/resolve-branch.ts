import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export async function resolveBranchId(prisma: PrismaService, orgId: string, branchId?: string) {
  if (branchId) {
    const found = await prisma.branch.findFirst({
      where: { id: branchId, organizationId: orgId, isActive: true },
    });
    if (!found) throw new NotFoundException('Филиал не найден');
    return found.id;
  }
  const first = await prisma.branch.findFirst({
    where: { organizationId: orgId, isActive: true },
    orderBy: { name: 'asc' },
  });
  if (!first) throw new NotFoundException('Филиал не найден');
  return first.id;
}
