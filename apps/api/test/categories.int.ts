/** Price-list categories on a real Postgres: create, no duplicates, rename, delete with services moved, sections never bookable. */
import assert from 'node:assert/strict';
import { PrismaClient } from '@dentasmart/database';
import { ClinicConfigService } from '../src/domains/clinic-config.service';
import { WorkspaceService } from '../src/domains/workspace.service';
import type { PrismaService } from '../src/prisma/prisma.service';

const prisma = new PrismaClient();
const db = prisma as unknown as PrismaService;
const config = new ClinicConfigService(db);
const stamp = Date.now().toString(36);

async function main() {
  const clinic = await prisma.organization.create({ data: { name: 'Тест категорий', slug: `cat-${stamp}` } });
  try {
    const user = await prisma.user.create({ data: { organizationId: clinic.id, email: `adm-${stamp}@t.local`, passwordHash: 'x' } });
    const therapy = await config.saveCategory(clinic.id, user.id, { name: 'Терапия' });
    const surgery = await config.saveCategory(clinic.id, user.id, { name: 'Хирургия' });
    await assert.rejects(config.saveCategory(clinic.id, user.id, { name: 'терапия' }), /уже есть/);
    await assert.rejects(config.saveCategory(clinic.id, user.id, { name: '  ' }), /название/);
    await config.saveCategory(clinic.id, user.id, { name: 'Терапия и эндодонтия' }, therapy.id);
    assert.equal((await prisma.service.findUniqueOrThrow({ where: { id: therapy.id } })).name, 'Терапия и эндодонтия');

    const filling = await config.saveService(clinic.id, user.id, { name: 'Пломба', price: 5500, durationMin: 60, parentId: therapy.id } as never);
    const noCode = await config.saveService(clinic.id, user.id, { name: 'Консультация', price: 1500, durationMin: 30, parentId: therapy.id } as never);
    await assert.rejects(config.saveService(clinic.id, user.id, { name: 'x', price: 1, durationMin: 10, parentId: filling.id } as never), /Категория не найдена/, 'услуга не может стать категорией');

    const list = await config.bundle(clinic.id);
    const empty = list.services.find((row: { id: string }) => row.id === surgery.id) as { isCategory: boolean };
    assert.equal(empty.isCategory, true, 'пустая категория остаётся категорией');
    const bookable = await new WorkspaceService(db, config).catalog(clinic.id);
    assert.ok(bookable.some((row: { id: string }) => row.id === noCode.id), 'услугу без кода можно записать');
    assert.ok(!bookable.some((row: { id: string }) => row.id === therapy.id || row.id === surgery.id), 'категории не записываются');

    const result = await config.deleteCategory(clinic.id, user.id, therapy.id, surgery.id);
    assert.equal(result.moved, 2);
    assert.equal((await prisma.service.findUniqueOrThrow({ where: { id: filling.id } })).parentId, surgery.id, 'услуги перенесены, не потеряны');
    assert.equal(await prisma.service.count({ where: { id: therapy.id } }), 0);
    await config.deleteCategory(clinic.id, user.id, surgery.id, null);
    assert.equal((await prisma.service.findUniqueOrThrow({ where: { id: filling.id } })).parentId, null, 'без категории');
    await assert.rejects(config.deleteCategory(clinic.id, user.id, filling.id, null), /Категория не найдена/, 'услугу так не удалить');
    console.log('categories ok');
  } finally {
    const org = clinic.id;
    await prisma.auditLog.deleteMany({ where: { organizationId: org } });
    await prisma.serviceMaterialNorm.deleteMany({ where: { organizationId: org } });
    await prisma.service.updateMany({ where: { organizationId: org }, data: { parentId: null } });
    await prisma.service.deleteMany({ where: { organizationId: org } });
    await prisma.user.deleteMany({ where: { organizationId: org } });
    await prisma.organization.delete({ where: { id: org } });
  }
}

main().finally(() => prisma.$disconnect());
