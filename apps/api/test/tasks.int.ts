/** Staff tasks and notifications on a real Postgres: who may change a task, what is overdue, read marks, home list. */
import assert from 'node:assert/strict';
import { PrismaClient } from '@dentasmart/database';
import type { AuthUser } from '@dentasmart/shared';
import { TasksService } from '../src/domains/tasks';
import { WorkspaceService } from '../src/domains/workspace.service';
import type { PrismaService } from '../src/prisma/prisma.service';

const prisma = new PrismaClient();
const db = prisma as unknown as PrismaService;
const tasks = new TasksService(db);
const stamp = Date.now().toString(36);

async function main() {
  const clinic = await prisma.organization.create({ data: { name: 'Тест задач', slug: `task-${stamp}` } });
  try {
    await prisma.branch.create({ data: { organizationId: clinic.id, name: 'Главный', timezone: 'Europe/Moscow' } });
    const [a, b, c] = await Promise.all(['a', 'b', 'c'].map((tag) => prisma.user.create({ data: { organizationId: clinic.id, email: `${tag}-${stamp}@t.local`, passwordHash: 'x' } })));
    const as = (user: { id: string }, permissions: string[] = ['patient.read', 'schedule.read']) => ({ id: user.id, organizationId: clinic.id, permissions } as unknown as AuthUser);
    const patient = await prisma.patient.create({ data: { organizationId: clinic.id, lastName: 'Орлова', firstName: 'Вера' } });

    await assert.rejects(tasks.create(clinic.id, as(a), { title: '  ' }), /Напишите/);
    const late = await tasks.create(clinic.id, as(a), { title: 'Перезвонить про снимок', assigneeId: b.id, patientId: patient.id, dueAt: new Date(Date.now() - 3600_000).toISOString() });
    const own = await tasks.create(clinic.id, as(b), { title: 'Заказать композит' });
    await assert.rejects(tasks.create(clinic.id, as(a), { title: 'x', assigneeId: 'чужой' }), /сотрудника/);

    const mine = await tasks.list(clinic.id, as(b), { scope: 'mine' });
    assert.deepEqual(mine.map((row) => row.title).sort(), ['Заказать композит', 'Перезвонить про снимок']);
    assert.equal(mine.find((row) => row.id === late.id)?.overdue, true);
    assert.equal(mine.find((row) => row.id === late.id)?.patient?.name, 'Орлова Вера');

    await assert.rejects(tasks.setStatus(clinic.id, as(c), late.id, 'DONE'), /исполнитель, автор или владелец/, 'посторонний не закрывает чужую задачу');
    await tasks.setStatus(clinic.id, as(c, ['patient.read', 'org.manage']), own.id, 'CANCELLED');

    const feed = await tasks.notifications(clinic.id, as(b));
    assert.ok(feed.items.some((item) => item.kind === 'overdue' && item.title.includes('Перезвонить')), 'просроченная задача в уведомлениях');
    assert.equal(feed.unread, feed.items.length);
    await tasks.seen(b.id);
    assert.equal((await tasks.notifications(clinic.id, as(b))).unread, 0, 'после «прочитано» новых нет');

    const home = await new WorkspaceService(db, {} as never).today(clinic.id, ['patient.read'], undefined, b.id);
    assert.ok(home.attention.some((item) => item.kind === 'overdue' && item.title === 'Перезвонить про снимок'), 'просроченная задача на главной');

    await tasks.setStatus(clinic.id, as(b), late.id, 'DONE');
    assert.equal((await tasks.list(clinic.id, as(b), { scope: 'done' })).length, 2);
    console.log('tasks ok');
  } finally {
    const org = clinic.id;
    await prisma.staffTask.deleteMany({ where: { organizationId: org } });
    await prisma.patient.deleteMany({ where: { organizationId: org } });
    await prisma.branch.deleteMany({ where: { organizationId: org } });
    await prisma.user.deleteMany({ where: { organizationId: org } });
    await prisma.organization.delete({ where: { id: org } });
  }
}

main().finally(() => prisma.$disconnect());
