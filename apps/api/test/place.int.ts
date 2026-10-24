/** A visit cannot be booked or moved onto another clinic's branch, doctor, chair or service. */
import assert from 'node:assert/strict';
import { PrismaClient } from '@dentasmart/database';
import { assertPlace } from '../src/common/clinic-place';
import type { PrismaService } from '../src/prisma/prisma.service';

const prisma = new PrismaClient();
const db = prisma as unknown as PrismaService;
const stamp = Date.now().toString(36);

async function main() {
  const mine = await prisma.organization.create({ data: { name: 'Своя', slug: `place-${stamp}` } });
  const theirs = await prisma.organization.create({ data: { name: 'Чужая', slug: `place-other-${stamp}` } });
  try {
    const branch = await prisma.branch.create({ data: { organizationId: mine.id, name: 'Главный' } });
    const second = await prisma.branch.create({ data: { organizationId: mine.id, name: 'Второй' } });
    const chair = await prisma.cabinet.create({ data: { branchId: branch.id, name: 'Кресло 1' } });
    const farChair = await prisma.cabinet.create({ data: { branchId: second.id, name: 'Кресло 2' } });
    const foreignBranch = await prisma.branch.create({ data: { organizationId: theirs.id, name: 'Их' } });
    const foreignChair = await prisma.cabinet.create({ data: { branchId: foreignBranch.id, name: 'Их кресло' } });
    const user = await prisma.user.create({ data: { organizationId: theirs.id, email: `d-${stamp}@t.local`, passwordHash: 'x' } });
    const foreignDoctor = await prisma.employee.create({ data: { userId: user.id, firstName: 'Чужой', lastName: 'Врач' } });

    await assertPlace(db, mine.id, { branchId: branch.id, cabinetId: chair.id });
    await assert.rejects(assertPlace(db, mine.id, { branchId: foreignBranch.id }), /Филиал не найден/);
    await assert.rejects(assertPlace(db, mine.id, { cabinetId: foreignChair.id }), /Кресло не найдено/);
    await assert.rejects(assertPlace(db, mine.id, { doctorId: foreignDoctor.id }), /Врач не найден/);
    await assert.rejects(assertPlace(db, mine.id, { branchId: branch.id, cabinetId: farChair.id }), /другом филиале/);
    console.log('place ok');
  } finally {
    for (const org of [mine.id, theirs.id]) {
      await prisma.employee.deleteMany({ where: { user: { organizationId: org } } });
      await prisma.user.deleteMany({ where: { organizationId: org } });
      await prisma.cabinet.deleteMany({ where: { branch: { organizationId: org } } });
      await prisma.branch.deleteMany({ where: { organizationId: org } });
      await prisma.organization.delete({ where: { id: org } });
    }
  }
}

main().finally(() => prisma.$disconnect());
