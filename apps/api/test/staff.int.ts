/**
 * Staff settings against a real Postgres: a new login gets its own random password, archiving closes
 * the login, another clinic's employee is out of reach, and nobody archives themselves.
 */
import assert from 'node:assert/strict';
import * as bcrypt from 'bcryptjs';
import { PrismaClient } from '@dentasmart/database';
import { ClinicConfigService } from '../src/domains/clinic-config.service';
import type { PrismaService } from '../src/prisma/prisma.service';

const prisma = new PrismaClient();
const config = new ClinicConfigService(prisma as unknown as PrismaService);
const stamp = Date.now().toString(36);

async function main() {
  const clinic = await prisma.organization.create({ data: { name: 'Тест штата', slug: `staff-${stamp}` } });
  const other = await prisma.organization.create({ data: { name: 'Чужая', slug: `staff-other-${stamp}` } });
  try {
    const owner = await prisma.user.create({ data: { organizationId: clinic.id, email: `owner-${stamp}@t.local`, passwordHash: 'x' } });
    const ownerEmployee = await prisma.employee.create({ data: { userId: owner.id, firstName: 'Завен', lastName: 'Седракович' } });
    const strangerUser = await prisma.user.create({ data: { organizationId: other.id, email: `s-${stamp}@t.local`, passwordHash: 'x' } });
    const stranger = await prisma.employee.create({ data: { userId: strangerUser.id, firstName: 'Чужой', lastName: 'Врач' } });

    const created = await config.saveEmployee(clinic.id, owner.id, { firstName: 'Ольга', lastName: 'Козлова', email: `KOZLOVA-${stamp}@t.local` });
    assert.ok(created.password && created.password.length >= 10, 'выдан пароль');
    assert.equal(created.email, `kozlova-${stamp}@t.local`);
    const login = await prisma.user.findFirstOrThrow({ where: { organizationId: clinic.id, email: created.email } });
    assert.equal(await bcrypt.compare(created.password!, login.passwordHash), true, 'пароль подходит к учётке');
    assert.equal(await bcrypt.compare('demo12345', login.passwordHash), false, 'не демо-пароль');

    await prisma.refreshToken.create({ data: { userId: login.id, tokenHash: `t-${stamp}`, expiresAt: new Date(Date.now() + 86400000) } as never }).catch(() => undefined);
    await config.saveEmployee(clinic.id, owner.id, { id: created.id, firstName: 'Ольга', lastName: 'Козлова', status: 'INACTIVE' });
    assert.equal((await prisma.employee.findUniqueOrThrow({ where: { id: created.id } })).status, 'TERMINATED');
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: login.id } })).isActive, false, 'архив закрывает вход');
    assert.equal(await prisma.refreshToken.count({ where: { userId: login.id } }), 0, 'сессии завершены');
    await config.saveEmployee(clinic.id, owner.id, { id: created.id, firstName: 'Ольга', lastName: 'Козлова', status: 'ACTIVE' });
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: login.id } })).isActive, true, 'возврат открывает вход');

    await assert.rejects(config.saveEmployee(clinic.id, owner.id, { id: stranger.id, firstName: 'Взлом', lastName: 'Взлом' }), /не найден/, 'чужого сотрудника не изменить');
    assert.equal((await prisma.employee.findUniqueOrThrow({ where: { id: stranger.id } })).firstName, 'Чужой');
    await assert.rejects(config.saveEmployee(clinic.id, owner.id, { id: ownerEmployee.id, firstName: 'Завен', lastName: 'Седракович', status: 'INACTIVE' }), /Свою учётку/);
    // Other settings rows are just as out of reach.
    const foreignRole = await prisma.role.create({ data: { organizationId: other.id, code: `r-${stamp}`, name: 'Их роль' } });
    await assert.rejects(config.saveRole(clinic.id, owner.id, { name: 'Взлом', maxDiscountPercent: 100 } as never, foreignRole.id), /не найдена/, 'чужую роль не изменить');
    assert.equal((await prisma.role.findUniqueOrThrow({ where: { id: foreignRole.id } })).name, 'Их роль');
    const foreignBranch = await prisma.branch.create({ data: { organizationId: other.id, name: 'Их филиал' } });
    const foreignChair = await prisma.cabinet.create({ data: { branchId: foreignBranch.id, name: 'Их кресло' } });
    await assert.rejects(config.saveCabinet(clinic.id, owner.id, { id: foreignChair.id, name: 'Взлом', isActive: false }), /не найдена/, 'чужое кресло не изменить');
    console.log('staff ok');
  } finally {
    for (const org of [clinic.id, other.id]) {
      await prisma.auditLog.deleteMany({ where: { organizationId: org } });
      await prisma.employeeSchedule.deleteMany({ where: { organizationId: org } });
      await prisma.payrollRule.deleteMany({ where: { organizationId: org } });
      await prisma.employeeBranch.deleteMany({ where: { employee: { user: { organizationId: org } } } });
      await prisma.employee.deleteMany({ where: { user: { organizationId: org } } });
      await prisma.refreshToken.deleteMany({ where: { user: { organizationId: org } } });
      await prisma.userRole.deleteMany({ where: { user: { organizationId: org } } });
      await prisma.user.deleteMany({ where: { organizationId: org } });
      await prisma.cabinet.deleteMany({ where: { branch: { organizationId: org } } });
      await prisma.branch.deleteMany({ where: { organizationId: org } });
      await prisma.role.deleteMany({ where: { organizationId: org } });
      await prisma.organization.delete({ where: { id: org } });
    }
  }
}

main().finally(() => prisma.$disconnect());
