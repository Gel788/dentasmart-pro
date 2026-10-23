import { BadRequestException, Body, Controller, ForbiddenException, Get, Injectable, NotFoundException, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, BLOCKING_KINDS, tzOffsetMinutes } from '@dentasmart/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { CurrentUser } from '../common/current-user.decorator';
import { OrgId } from '../common/org.decorator';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Staff tasks and the notification feed. A task belongs to the clinic; it can be changed by whoever it
 * is assigned to, whoever made it, or the owner. Notifications are not stored copies: they are read
 * live from requests, tasks, documents and tomorrow's visits, and a user only marks up to when they read.
 */
type TaskInput = { title?: string; notes?: string | null; dueAt?: string | null; assigneeId?: string | null; patientId?: string | null };

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  async people(orgId: string) {
    const users = await this.prisma.user.findMany({ where: { organizationId: orgId, isActive: true }, select: { id: true, email: true, employee: { select: { firstName: true, lastName: true, status: true } } }, orderBy: { createdAt: 'asc' } });
    return users.filter((row) => row.employee?.status !== 'TERMINATED').map((row) => ({ id: row.id, name: row.employee ? `${row.employee.lastName} ${row.employee.firstName}` : row.email }));
  }

  async list(orgId: string, user: AuthUser, query: { scope?: string; patientId?: string }) {
    const scope = query.scope === 'all' || query.scope === 'done' ? query.scope : 'mine';
    const rows = await this.prisma.staffTask.findMany({
      where: {
        organizationId: orgId,
        ...(query.patientId ? { patientId: query.patientId } : {}),
        ...(scope === 'done' ? { status: { in: ['DONE', 'CANCELLED'] } } : { status: 'OPEN' }),
        ...(scope === 'mine' ? { OR: [{ assigneeId: user.id }, { assigneeId: null, createdById: user.id }] } : {}),
      },
      orderBy: scope === 'done' ? [{ doneAt: 'desc' }, { updatedAt: 'desc' }] : [{ dueAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
      take: 300,
      include: {
        assignee: { select: { id: true, email: true, employee: { select: { firstName: true, lastName: true } } } },
        createdBy: { select: { id: true, email: true, employee: { select: { firstName: true, lastName: true } } } },
        patient: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    const name = (row: { email: string; employee: { firstName: string; lastName: string } | null } | null) => (row ? (row.employee ? `${row.employee.lastName} ${row.employee.firstName}` : row.email) : null);
    return rows.map((row) => ({
      id: row.id, title: row.title, notes: row.notes, dueAt: row.dueAt?.toISOString() ?? null, status: row.status,
      overdue: row.status === 'OPEN' && !!row.dueAt && row.dueAt < new Date(),
      assignee: row.assignee ? { id: row.assignee.id, name: name(row.assignee) } : null,
      createdBy: name(row.createdBy), patient: row.patient ? { id: row.patient.id, name: `${row.patient.lastName} ${row.patient.firstName}` } : null,
      doneAt: row.doneAt?.toISOString() ?? null, createdAt: row.createdAt.toISOString(), mine: row.assigneeId === user.id,
    }));
  }

  async create(orgId: string, user: AuthUser, body: TaskInput) {
    const data = await this.clean(orgId, body, true);
    const task = await this.prisma.staffTask.create({ data: { organizationId: orgId, createdById: user.id, assigneeId: data.assigneeId ?? user.id, title: data.title!, notes: data.notes ?? null, dueAt: data.dueAt ?? null, patientId: data.patientId ?? null } });
    return { id: task.id };
  }

  async update(orgId: string, user: AuthUser, id: string, body: TaskInput) {
    await this.mayChange(orgId, user, id);
    const data = await this.clean(orgId, body, false);
    await this.prisma.staffTask.update({ where: { id }, data });
    return { id };
  }

  async setStatus(orgId: string, user: AuthUser, id: string, status: 'DONE' | 'OPEN' | 'CANCELLED') {
    await this.mayChange(orgId, user, id);
    await this.prisma.staffTask.update({ where: { id }, data: status === 'OPEN' ? { status, doneAt: null, doneById: null } : { status, doneAt: new Date(), doneById: user.id } });
    return { id, status };
  }

  /** Open tasks for the Today screen: the user's own, due today or overdue first. */
  async mineOpen(orgId: string, userId: string) {
    return this.prisma.staffTask.findMany({
      where: { organizationId: orgId, status: 'OPEN', OR: [{ assigneeId: userId }, { assigneeId: null, createdById: userId }] },
      orderBy: [{ dueAt: { sort: 'asc', nulls: 'last' } }],
      take: 20,
      select: { id: true, title: true, dueAt: true, patient: { select: { lastName: true, firstName: true } } },
    });
  }

  async notifications(orgId: string, user: AuthUser) {
    const me = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { notificationsSeenAt: true } });
    const can = (perm: string) => user.permissions.includes(perm);
    const items: { id: string; kind: string; title: string; detail: string; href: string; at: string }[] = [];
    const branch = await this.prisma.branch.findFirst({ where: { organizationId: orgId, isActive: true }, orderBy: { name: 'asc' }, select: { timezone: true } });
    const tz = branch?.timezone || 'Europe/Moscow';
    const offset = tzOffsetMinutes(tz, new Date());
    const localToday = new Date(Date.now() + offset * 60000).toISOString().slice(0, 10);
    const dayStart = new Date(Date.parse(`${localToday}T00:00:00Z`) - offset * 60000);
    const dayEnd = new Date(dayStart.getTime() + 86400000);

    if (can('schedule.read')) {
      const requests = await this.prisma.bookingRequest.findMany({ where: { organizationId: orgId, status: 'PENDING' }, orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, firstName: true, lastName: true, startsAt: true, createdAt: true } });
      for (const row of requests) items.push({ id: `req-${row.id}`, kind: 'request', title: `Заявка с сайта: ${row.lastName} ${row.firstName}`, detail: `на ${row.startsAt.toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: tz })}, ждёт ответа`, href: '/requests', at: row.createdAt.toISOString() });
      const unconfirmed = await this.prisma.appointment.count({ where: { organizationId: orgId, status: 'SCHEDULED', startsAt: { gte: dayEnd, lt: new Date(dayEnd.getTime() + 86400000) } } });
      if (unconfirmed) items.push({ id: `tomorrow-${localToday}`, kind: 'confirm', title: `Завтра не подтверждены: ${unconfirmed}`, detail: 'обзвоните пациентов или отправьте напоминание', href: '/schedule', at: dayStart.toISOString() });
    }

    const tasks = await this.prisma.staffTask.findMany({
      where: { organizationId: orgId, status: 'OPEN', assigneeId: user.id, OR: [{ createdById: { not: user.id } }, { dueAt: { lt: dayEnd } }] },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: { id: true, title: true, dueAt: true, createdAt: true, createdById: true, createdBy: { select: { employee: { select: { firstName: true, lastName: true } } } } },
    });
    for (const task of tasks) {
      const overdue = task.dueAt && task.dueAt < new Date();
      const by = task.createdBy?.employee ? `${task.createdBy.employee.lastName} ${task.createdBy.employee.firstName}` : null;
      items.push({
        id: `task-${task.id}-${overdue ? 'late' : 'new'}`,
        kind: overdue ? 'overdue' : 'task',
        title: overdue ? `Просрочена задача: ${task.title}` : `Новая задача: ${task.title}`,
        detail: [by && task.createdById !== user.id ? `от ${by}` : null, task.dueAt ? `срок ${task.dueAt.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', timeZone: tz })}` : null].filter(Boolean).join(' · ') || 'без срока',
        href: '/tasks',
        at: (overdue && task.dueAt ? task.dueAt : task.createdAt).toISOString(),
      });
    }

    if (can('patient.read')) {
      const unsigned = await this.prisma.clinicDocument.findMany({
        where: { organizationId: orgId, status: { in: ['CREATED', 'PRINTED'] }, kind: { in: BLOCKING_KINDS as never[] }, appointment: { startsAt: { gte: dayStart, lt: dayEnd }, status: { notIn: ['CANCELLED', 'NO_SHOW', 'COMPLETED'] } } },
        select: { appointmentId: true, appointment: { select: { startsAt: true, patient: { select: { lastName: true, firstName: true } } } } },
      });
      const byVisit = new Map<string, { count: number; name: string; at: Date }>();
      for (const doc of unsigned) {
        if (!doc.appointmentId || !doc.appointment) continue;
        const entry = byVisit.get(doc.appointmentId) ?? { count: 0, name: `${doc.appointment.patient.lastName} ${doc.appointment.patient.firstName}`, at: doc.appointment.startsAt };
        entry.count += 1;
        byVisit.set(doc.appointmentId, entry);
      }
      for (const [visitId, entry] of byVisit) items.push({ id: `docs-${visitId}`, kind: 'documents', title: `Не подписаны документы: ${entry.name}`, detail: `${entry.count} шт. к визиту в ${entry.at.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: tz })}`, href: `/visits/${visitId}`, at: dayStart.toISOString() });
    }

    items.sort((a, b) => b.at.localeCompare(a.at));
    const seenAt = me.notificationsSeenAt?.toISOString() ?? null;
    return { seenAt, unread: items.filter((item) => !seenAt || item.at > seenAt).length, items };
  }

  async seen(userId: string) {
    await this.prisma.user.update({ where: { id: userId }, data: { notificationsSeenAt: new Date() } });
    return { ok: true };
  }

  private async mayChange(orgId: string, user: AuthUser, id: string) {
    const task = await this.prisma.staffTask.findFirst({ where: { id, organizationId: orgId }, select: { assigneeId: true, createdById: true } });
    if (!task) throw new NotFoundException('Задача не найдена');
    if (task.assigneeId !== user.id && task.createdById !== user.id && !user.permissions.includes('org.manage')) throw new ForbiddenException('Менять задачу может исполнитель, автор или владелец клиники');
  }

  private async clean(orgId: string, body: TaskInput, creating: boolean) {
    const out: { title?: string; notes?: string | null; dueAt?: Date | null; assigneeId?: string | null; patientId?: string | null } = {};
    if (creating || body.title !== undefined) {
      const title = String(body.title ?? '').trim();
      if (!title) throw new BadRequestException('Напишите, что нужно сделать');
      out.title = title.slice(0, 300);
    }
    if (body.notes !== undefined) out.notes = body.notes ? String(body.notes).trim().slice(0, 2000) || null : null;
    if (body.dueAt !== undefined) {
      const due = body.dueAt ? new Date(body.dueAt) : null;
      if (due && Number.isNaN(+due)) throw new BadRequestException('Неверный срок');
      out.dueAt = due;
    }
    if (body.assigneeId !== undefined && body.assigneeId) {
      const user = await this.prisma.user.findFirst({ where: { id: body.assigneeId, organizationId: orgId, isActive: true }, select: { id: true } });
      if (!user) throw new BadRequestException('Такого сотрудника нет');
      out.assigneeId = user.id;
    }
    if (body.patientId !== undefined) {
      if (body.patientId) {
        const patient = await this.prisma.patient.findFirst({ where: { id: body.patientId, organizationId: orgId }, select: { id: true } });
        if (!patient) throw new BadRequestException('Пациент не найден');
      }
      out.patientId = body.patientId || null;
    }
    return out;
  }
}

@ApiTags('tasks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller()
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get('tasks')
  @RequirePermissions('patient.read')
  list(@OrgId() orgId: string, @CurrentUser() user: AuthUser, @Query() query: { scope?: string; patientId?: string }) {
    return this.tasks.list(orgId, user, query);
  }

  @Get('tasks/people')
  @RequirePermissions('patient.read')
  people(@OrgId() orgId: string) {
    return this.tasks.people(orgId);
  }

  @Post('tasks')
  @RequirePermissions('patient.read')
  create(@OrgId() orgId: string, @CurrentUser() user: AuthUser, @Body() body: TaskInput) {
    return this.tasks.create(orgId, user, body);
  }

  @Patch('tasks/:id')
  @RequirePermissions('patient.read')
  update(@OrgId() orgId: string, @CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: TaskInput) {
    return this.tasks.update(orgId, user, id, body);
  }

  @Post('tasks/:id/done')
  @RequirePermissions('patient.read')
  done(@OrgId() orgId: string, @CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.tasks.setStatus(orgId, user, id, 'DONE');
  }

  @Post('tasks/:id/reopen')
  @RequirePermissions('patient.read')
  reopen(@OrgId() orgId: string, @CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.tasks.setStatus(orgId, user, id, 'OPEN');
  }

  @Post('tasks/:id/cancel')
  @RequirePermissions('patient.read')
  cancel(@OrgId() orgId: string, @CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.tasks.setStatus(orgId, user, id, 'CANCELLED');
  }

  @Get('notifications')
  @RequirePermissions('patient.read')
  notifications(@OrgId() orgId: string, @CurrentUser() user: AuthUser) {
    return this.tasks.notifications(orgId, user);
  }

  @Post('notifications/seen')
  @RequirePermissions('patient.read')
  seen(@CurrentUser() user: AuthUser) {
    return this.tasks.seen(user.id);
  }
}
