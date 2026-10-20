import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@dentasmart/database';
import { employeeWeek, normalizeWeekHours, scheduleRows, weekHoursOf, weekHoursText, type WeekHours } from '@dentasmart/shared';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

const num = (value: { toString(): string } | number | null | undefined) => Number(value ?? 0);

@Injectable()
export class ClinicConfigService {
  constructor(private readonly prisma: PrismaService) {}

  /** The id, if that record belongs to this clinic; otherwise «не найдено» — never another clinic's row. */
  private async mine(
    kind: 'inventoryItem' | 'planTemplate' | 'visitTemplate' | 'documentTemplate' | 'cabinet' | 'role' | 'promoCode' | 'reminderRule',
    id: string,
    orgId: string,
  ) {
    const where = kind === 'cabinet' ? { id, branch: { organizationId: orgId } } : { id, organizationId: orgId };
    const found = await (this.prisma[kind] as unknown as { count: (args: { where: object }) => Promise<number> }).count({ where });
    if (!found) throw new NotFoundException('Запись не найдена');
    return id;
  }

  async policy(userId: string) {
    const links = await this.prisma.userRole.findMany({
      where: { userId },
      include: { role: true },
    });
    const roles = links.map((link) => link.role);
    return {
      seeCost: roles.some((role) => role.seeCost),
      maxDiscountPercent: roles.reduce((max, role) => Math.max(max, role.maxDiscountPercent), 0),
      editClosedVisits: roles.some((role) => role.editClosedVisits),
      editPrice: roles.some((role) => role.editPrice),
      seeAllFinance: roles.some((role) => role.seeAllFinance),
      canExport: roles.some((role) => role.canExport),
    };
  }

  async bundle(orgId: string) {
    const [org, services, items, plans, visits, documents, employees, cabinets, roles, permissions, promos, rules, history] = await Promise.all([
      this.prisma.organization.findUnique({ where: { id: orgId } }),
      this.prisma.service.findMany({
        where: { organizationId: orgId },
        include: { materialNorms: { include: { item: true } } },
        orderBy: [{ parentId: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.inventoryItem.findMany({
        where: { organizationId: orgId },
        include: { batches: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.planTemplate.findMany({ where: { organizationId: orgId }, orderBy: { name: 'asc' } }),
      this.prisma.visitTemplate.findMany({ where: { organizationId: orgId }, orderBy: { name: 'asc' } }),
      this.prisma.documentTemplate.findMany({ where: { organizationId: orgId }, orderBy: { name: 'asc' } }),
      this.prisma.employee.findMany({
        where: { user: { organizationId: orgId } },
        include: { user: { include: { userRoles: { include: { role: true } } } }, schedules: true, payrollRules: true },
        orderBy: { lastName: 'asc' },
      }),
      this.prisma.cabinet.findMany({ where: { branch: { organizationId: orgId } }, orderBy: { name: 'asc' } }),
      this.prisma.role.findMany({
        where: { organizationId: orgId },
        include: { rolePermissions: { include: { permission: true } } },
        orderBy: { name: 'asc' },
      }),
      this.prisma.permission.findMany({ orderBy: [{ module: 'asc' }, { code: 'asc' }] }),
      this.prisma.promoCode.findMany({ where: { organizationId: orgId }, orderBy: { code: 'asc' } }),
      this.prisma.reminderRule.findMany({ where: { organizationId: orgId }, orderBy: { name: 'asc' } }),
      this.prisma.auditLog.findMany({
        where: { organizationId: orgId, entityType: { in: ['Service', 'InventoryItem', 'Role', 'Employee', 'PlanTemplate', 'VisitTemplate', 'DocumentTemplate', 'PromoCode', 'ReminderRule', 'Organization', 'Cabinet', 'TreatmentPlan'] } },
        orderBy: { createdAt: 'desc' },
        take: 40,
        include: { user: { select: { email: true } } },
      }),
    ]);
    if (!org) throw new NotFoundException('Клиника не найдена');
    return {
      aiPlans: org.aiPlans,
      brand: {
        name: org.name,
        legalName: org.legalName,
        phone: org.phone,
        email: org.email,
        inn: org.inn,
        ogrn: org.ogrn,
        kpp: org.kpp,
        address: org.address,
        logoUrl: org.logoUrl,
        brandColor: org.brandColor ?? '#0f766e',
        bankName: org.bankName,
        bankAccount: org.bankAccount,
        bik: org.bik,
        workHours: org.workHours,
        weekHours: weekHoursOf(org.weekHours, org.workHours),
      },
      services: services.map((service) => ({
        id: service.id,
        parentId: service.parentId,
        code: service.code,
        name: service.name,
        price: num(service.basePrice),
        durationMin: service.durationMin,
        requiresTooth: service.requiresTooth,
        surfaceMode: service.surfaceMode,
        doctorPercent: num(service.doctorPercent),
        isActive: service.isActive,
        isCategory: service.parentId == null && services.some((row) => row.parentId === service.id),
        norms: service.materialNorms.map((norm) => ({
          id: norm.id,
          itemId: norm.itemId,
          name: norm.item.name,
          quantity: num(norm.quantity),
          unit: norm.item.unit,
        })),
      })),
      stock: items.map((item) => ({
        id: item.id,
        sku: item.sku,
        name: item.name,
        unit: item.unit,
        minStock: num(item.minStock),
        isActive: item.isActive,
        quantity: item.batches.reduce((sum, batch) => sum + num(batch.quantity), 0),
        cost: num(item.batches.find((batch) => num(batch.quantity) > 0)?.costPrice),
      })),
      planTemplates: plans.map((plan) => ({ ...plan, phases: Array.isArray(plan.phasesJson) ? plan.phasesJson : [] })),
      visitTemplates: visits,
      documents,
      employees: employees.map((employee) => ({
        id: employee.id,
        firstName: employee.firstName,
        lastName: employee.lastName,
        specialization: employee.specialization,
        phone: employee.phone,
        email: employee.user.email,
        status: employee.status,
        canLogin: employee.user.isActive,
        roles: employee.user.userRoles.map((link) => ({ code: link.role.code, name: link.role.name })),
        schedule: employee.schedules.map((row) => ({ dayOfWeek: row.dayOfWeek, startsAt: row.startsAt, endsAt: row.endsAt })),
        // null: works by the clinic's hours.
        weekHours: employeeWeek(employee.schedules.filter((row) => row.isActive)),
        commission: num((employee.payrollRules.find((rule) => rule.isActive)?.paramsJson as { percent?: number } | null)?.percent),
      })),
      cabinets: cabinets.map((cabinet) => ({ id: cabinet.id, name: cabinet.name, isActive: cabinet.isActive })),
      roles: roles.map((role) => ({
        id: role.id,
        code: role.code,
        name: role.name,
        isSystem: role.isSystem,
        seeCost: role.seeCost,
        maxDiscountPercent: role.maxDiscountPercent,
        editClosedVisits: role.editClosedVisits,
        editPrice: role.editPrice,
        seeAllFinance: role.seeAllFinance,
        canExport: role.canExport,
        permissions: role.rolePermissions.map((link) => link.permission.code),
      })),
      permissions: permissions.map((permission) => ({ code: permission.code, module: permission.module, description: permission.description })),
      promos: promos.map((promo) => ({
        id: promo.id,
        code: promo.code,
        discountPct: num(promo.discountPct),
        isActive: promo.isActive,
      })),
      rules: rules.map((rule) => ({ id: rule.id, name: rule.name, trigger: rule.trigger, channel: rule.channel, body: rule.body, isActive: rule.isActive })),
      history: history.map((row) => ({
        id: row.id,
        at: row.createdAt,
        email: row.user?.email ?? 'система',
        entityType: row.entityType,
        action: row.action,
        changes: row.changes,
      })),
    };
  }

  async saveBrand(orgId: string, userId: string, body: Record<string, unknown>) {
    const data: Prisma.OrganizationUpdateInput = {};
    for (const key of ['name', 'legalName', 'phone', 'email', 'inn', 'ogrn', 'kpp', 'address', 'logoUrl', 'brandColor', 'bankName', 'bankAccount', 'bik', 'workHours'] as const) {
      const value = body[key];
      if (value !== undefined && value !== null && typeof value !== 'string') throw new BadRequestException('Неверное значение поля');
      if (value !== undefined) (data as Record<string, string | null>)[key] = value?.trim() || null;
    }
    // The weekly schedule wins over the one-line text, which is kept as its readable summary.
    if (body.weekHours !== undefined) {
      let week: WeekHours;
      try { week = normalizeWeekHours(body.weekHours); } catch (err) { throw new BadRequestException((err as Error).message); }
      data.weekHours = week as unknown as Prisma.InputJsonValue;
      data.workHours = weekHoursText(week);
    }
    if (typeof body.name === 'string' && body.name.trim()) data.name = body.name.trim();
    const org = await this.prisma.organization.update({ where: { id: orgId }, data });
    await this.trail(orgId, userId, 'Organization', orgId, 'UPDATE', { name: org.name, brandColor: org.brandColor, ...(body.weekHours !== undefined ? { workHours: org.workHours } : {}) });
    return { name: org.name, brandColor: org.brandColor };
  }

  async saveService(orgId: string, userId: string, body: ServiceBody, id?: string) {
    if (!body.name?.trim()) throw new BadRequestException('Нужно название');
    const data = {
      name: body.name.trim(),
      code: body.code?.trim() || null,
      basePrice: body.price ?? 0,
      durationMin: body.durationMin ?? 30,
      parentId: body.parentId || null,
      requiresTooth: Boolean(body.requiresTooth),
      surfaceMode: body.surfaceMode || 'NONE',
      doctorPercent: body.doctorPercent ?? 0,
      isActive: body.isActive !== false,
    };
    if (id) {
      const existing = await this.prisma.service.findFirst({ where: { id, organizationId: orgId } });
      if (!existing) throw new NotFoundException('Услуга не найдена');
    }
    const service = id
      ? await this.prisma.service.update({ where: { id }, data })
      : await this.prisma.service.create({ data: { ...data, organizationId: orgId } });
    if (body.norms) {
      await this.prisma.serviceMaterialNorm.deleteMany({ where: { serviceId: service.id } });
      for (const norm of body.norms) {
        if (!norm.itemId || !norm.quantity) continue;
        await this.prisma.serviceMaterialNorm.create({
          data: { organizationId: orgId, serviceId: service.id, itemId: norm.itemId, quantity: norm.quantity },
        });
      }
    }
    await this.trail(orgId, userId, 'Service', service.id, id ? 'UPDATE' : 'CREATE', { name: service.name, price: data.basePrice });
    return { id: service.id };
  }

  async archiveService(orgId: string, userId: string, id: string, active: boolean) {
    const service = await this.prisma.service.findFirst({ where: { id, organizationId: orgId } });
    if (!service) throw new NotFoundException('Услуга не найдена');
    await this.prisma.service.update({ where: { id }, data: { isActive: active } });
    await this.trail(orgId, userId, 'Service', id, 'UPDATE', { name: service.name, isActive: active });
    return { id, isActive: active };
  }

  async bulkPrice(orgId: string, userId: string, percent: number, ids?: string[]) {
    if (!Number.isFinite(percent) || percent < -90 || percent > 200) throw new BadRequestException('Процент от −90 до 200');
    const services = await this.prisma.service.findMany({
      where: { organizationId: orgId, isActive: true, ...(ids?.length ? { id: { in: ids } } : { parentId: { not: null } }) },
    });
    for (const service of services) {
      const next = Math.max(0, Math.round(num(service.basePrice) * (1 + percent / 100)));
      await this.prisma.service.update({ where: { id: service.id }, data: { basePrice: next } });
    }
    await this.trail(orgId, userId, 'Service', 'bulk', 'UPDATE', { percent, count: services.length });
    return { updated: services.length, percent };
  }

  async exportServices(orgId: string) {
    const services = await this.prisma.service.findMany({
      where: { organizationId: orgId, parentId: { not: null } },
      include: { parent: true },
      orderBy: { name: 'asc' },
    });
    const lines = ['Категория;Код;Название;Цена;Минуты;Зуб;Поверхности;% врача'];
    for (const service of services) {
      lines.push([
        service.parent?.name ?? '',
        service.code ?? '',
        service.name,
        num(service.basePrice),
        service.durationMin,
        service.requiresTooth ? 'да' : 'нет',
        service.surfaceMode,
        num(service.doctorPercent),
      ].join(';'));
    }
    return { filename: 'price.csv', csv: `\uFEFF${lines.join('\n')}` };
  }

  async importServices(orgId: string, userId: string, rows: { category?: string; code?: string; name?: string; price?: number; durationMin?: number; requiresTooth?: boolean; surfaceMode?: string; doctorPercent?: number }[]) {
    let created = 0;
    let updated = 0;
    for (const row of rows) {
      if (!row.name?.trim()) continue;
      let parentId: string | null = null;
      if (row.category?.trim()) {
        const existing = await this.prisma.service.findFirst({ where: { organizationId: orgId, parentId: null, name: row.category.trim() } });
        parentId = existing?.id ?? (await this.prisma.service.create({ data: { organizationId: orgId, name: row.category.trim(), basePrice: 0 } })).id;
      }
      const found = row.code
        ? await this.prisma.service.findFirst({ where: { organizationId: orgId, code: row.code } })
        : await this.prisma.service.findFirst({ where: { organizationId: orgId, name: row.name.trim(), parentId } });
      const data = {
        name: row.name.trim(),
        code: row.code?.trim() || null,
        basePrice: row.price ?? 0,
        durationMin: row.durationMin ?? 30,
        parentId,
        requiresTooth: Boolean(row.requiresTooth),
        surfaceMode: row.surfaceMode || 'NONE',
        doctorPercent: row.doctorPercent ?? 0,
      };
      if (found) {
        await this.prisma.service.update({ where: { id: found.id }, data });
        updated += 1;
      } else {
        await this.prisma.service.create({ data: { ...data, organizationId: orgId } });
        created += 1;
      }
    }
    await this.trail(orgId, userId, 'Service', 'import', 'CREATE', { created, updated });
    return { created, updated };
  }

  async saveStock(orgId: string, userId: string, body: { id?: string; name: string; sku?: string; unit?: string; minStock?: number; cost?: number; quantity?: number }) {
    if (!body.name?.trim()) throw new BadRequestException('Нужно название');
    const item = body.id
      ? await this.prisma.inventoryItem.update({
        where: { id: await this.mine('inventoryItem', body.id, orgId) },
        data: { name: body.name.trim(), sku: body.sku?.trim() || null, unit: body.unit?.trim() || 'шт', minStock: body.minStock ?? 0 },
      })
      : await this.prisma.inventoryItem.create({
        data: { organizationId: orgId, name: body.name.trim(), sku: body.sku?.trim() || null, unit: body.unit?.trim() || 'шт', minStock: body.minStock ?? 0, category: 'MATERIAL' },
      });
    if (!body.id && body.quantity && body.quantity > 0) await this.receive(orgId, userId, item.id, body.quantity, body.cost ?? 0);
    await this.trail(orgId, userId, 'InventoryItem', item.id, body.id ? 'UPDATE' : 'CREATE', { name: item.name });
    return { id: item.id };
  }

  async receive(orgId: string, userId: string, itemId: string, quantity: number, cost: number) {
    if (quantity <= 0) throw new BadRequestException('Количество больше нуля');
    const item = await this.prisma.inventoryItem.findFirst({ where: { id: itemId, organizationId: orgId } });
    if (!item) throw new NotFoundException('Материал не найден');
    const branch = await this.prisma.branch.findFirst({ where: { organizationId: orgId, isActive: true } });
    if (!branch) throw new BadRequestException('Нет филиала');
    await this.prisma.stockBatch.create({ data: { itemId, branchId: branch.id, quantity, costPrice: cost } });
    await this.prisma.stockMovement.create({
      data: { organizationId: orgId, itemId, branchId: branch.id, type: 'RECEIPT', quantity, costAmount: quantity * cost, notes: 'Приход из настроек' },
    });
    await this.trail(orgId, userId, 'InventoryItem', itemId, 'UPDATE', { receive: quantity, cost });
    return { ok: true };
  }

  async savePlanTemplate(orgId: string, userId: string, body: { id?: string; name: string; note?: string; phasesJson: Prisma.InputJsonValue; isArchived?: boolean }) {
    if (!body.name?.trim()) throw new BadRequestException('Нужно название');
    const row = body.id
      ? await this.prisma.planTemplate.update({ where: { id: await this.mine('planTemplate', body.id, orgId) }, data: { name: body.name.trim(), note: body.note ?? null, phasesJson: body.phasesJson, isArchived: Boolean(body.isArchived) } })
      : await this.prisma.planTemplate.create({ data: { organizationId: orgId, name: body.name.trim(), note: body.note ?? null, phasesJson: body.phasesJson } });
    await this.trail(orgId, userId, 'PlanTemplate', row.id, body.id ? 'UPDATE' : 'CREATE', { name: row.name });
    return { id: row.id };
  }

  async saveVisitTemplate(orgId: string, userId: string, body: { id?: string; name: string; icd10?: string; complaints?: string; diagnosis?: string; treatment?: string; recommendations?: string; isArchived?: boolean }) {
    if (!body.name?.trim()) throw new BadRequestException('Нужно название');
    const data = {
      name: body.name.trim(),
      icd10: body.icd10?.trim() || null,
      complaints: body.complaints ?? '',
      diagnosis: body.diagnosis ?? '',
      treatment: body.treatment ?? '',
      recommendations: body.recommendations ?? '',
      isArchived: Boolean(body.isArchived),
    };
    const row = body.id
      ? await this.prisma.visitTemplate.update({ where: { id: await this.mine('visitTemplate', body.id, orgId) }, data })
      : await this.prisma.visitTemplate.create({ data: { ...data, organizationId: orgId, isArchived: false } });
    await this.trail(orgId, userId, 'VisitTemplate', row.id, body.id ? 'UPDATE' : 'CREATE', { name: row.name });
    return { id: row.id };
  }

  visitTemplates(orgId: string) {
    return this.prisma.visitTemplate.findMany({ where: { organizationId: orgId, isArchived: false }, orderBy: { name: 'asc' } });
  }

  async saveDocument(orgId: string, userId: string, body: { id?: string; kind: string; name: string; body: string; isArchived?: boolean }) {
    if (!body.name?.trim() || !body.body?.trim()) throw new BadRequestException('Нужны название и текст');
    const row = body.id
      ? await this.prisma.documentTemplate.update({ where: { id: await this.mine('documentTemplate', body.id, orgId) }, data: { kind: body.kind, name: body.name.trim(), body: body.body, isArchived: Boolean(body.isArchived) } })
      : await this.prisma.documentTemplate.create({ data: { organizationId: orgId, kind: body.kind || 'CONSENT', name: body.name.trim(), body: body.body } });
    await this.trail(orgId, userId, 'DocumentTemplate', row.id, body.id ? 'UPDATE' : 'CREATE', { name: row.name });
    return { id: row.id };
  }

  async saveEmployee(orgId: string, userId: string, body: { id?: string; firstName: string; lastName: string; email?: string; phone?: string; specialization?: string; commission?: number; days?: number[]; startsAt?: string; endsAt?: string; status?: string; roleCode?: string; weekHours?: WeekHours | null }) {
    if (!body.firstName?.trim() || !body.lastName?.trim()) throw new BadRequestException('Нужны имя и фамилия');
    let employeeId = body.id;
    // A new login gets a random one-time password, shown once to whoever created it.
    let password: string | null = null;
    if (!employeeId) {
      if (!body.email?.includes('@')) throw new BadRequestException('Для нового врача нужна почта');
      // The owner role is never handed out from here; anything else must be one of this clinic's roles.
      const code = body.roleCode && body.roleCode !== 'owner' ? body.roleCode : 'doctor';
      const role = await this.prisma.role.findFirst({ where: { organizationId: orgId, code } });
      if (!role) throw new BadRequestException('Такой роли нет');
      password = randomBytes(9).toString('base64url');
      const passwordHash = await bcrypt.hash(password, 10);
      const user = await this.prisma.user.create({
        data: { organizationId: orgId, email: body.email.trim().toLowerCase(), passwordHash },
      });
      await this.prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
      const employee = await this.prisma.employee.create({
        data: { userId: user.id, firstName: body.firstName.trim(), lastName: body.lastName.trim(), phone: body.phone ?? null, specialization: body.specialization ?? null },
      });
      const branch = await this.prisma.branch.findFirst({ where: { organizationId: orgId, isActive: true } });
      if (branch) await this.prisma.employeeBranch.create({ data: { employeeId: employee.id, branchId: branch.id, isPrimary: true } });
      employeeId = employee.id;
    } else {
      const own = await this.prisma.employee.findFirst({ where: { id: employeeId, user: { organizationId: orgId } } });
      if (!own) throw new NotFoundException('Сотрудник не найден');
      // Archive closes the login and ends sessions; bringing back reopens it. History stays.
      const archived = body.status === 'INACTIVE' || body.status === 'TERMINATED';
      const restored = body.status === 'ACTIVE';
      if (archived && own.userId === userId) throw new BadRequestException('Свою учётку в архив не убрать');
      await this.prisma.employee.update({
        where: { id: employeeId },
        data: {
          firstName: body.firstName.trim(),
          lastName: body.lastName.trim(),
          phone: body.phone ?? null,
          specialization: body.specialization ?? null,
          ...(archived ? { status: 'TERMINATED' } : restored ? { status: 'ACTIVE' } : {}),
        },
      });
      if (archived || restored) {
        await this.prisma.user.update({ where: { id: own.userId }, data: { isActive: restored } });
        if (archived) await this.prisma.refreshToken.deleteMany({ where: { userId: own.userId } });
      }
    }
    // A week of their own, or null to follow the clinic's hours again.
    if (body.weekHours !== undefined) {
      let week: WeekHours | null = null;
      if (body.weekHours !== null) {
        try { week = normalizeWeekHours(body.weekHours); } catch (err) { throw new BadRequestException((err as Error).message); }
      }
      const branch = await this.prisma.branch.findFirst({ where: { organizationId: orgId, isActive: true } });
      await this.prisma.$transaction([
        this.prisma.employeeSchedule.deleteMany({ where: { employeeId } }),
        ...(week && branch
          ? [this.prisma.employeeSchedule.createMany({ data: scheduleRows(week).map((row) => ({ organizationId: orgId, employeeId: employeeId!, branchId: branch.id, ...row })) })]
          : []),
      ]);
    } else if (body.days?.length) {
      const branch = await this.prisma.branch.findFirst({ where: { organizationId: orgId, isActive: true } });
      if (branch) {
        await this.prisma.employeeSchedule.deleteMany({ where: { employeeId } });
        await this.prisma.employeeSchedule.createMany({
          data: body.days.map((day) => ({
            organizationId: orgId,
            employeeId: employeeId!,
            branchId: branch.id,
            dayOfWeek: day,
            startsAt: body.startsAt || '09:00',
            endsAt: body.endsAt || '18:00',
          })),
        });
      }
    }
    if (body.commission != null) {
      const current = await this.prisma.payrollRule.findFirst({ where: { organizationId: orgId, employeeId, isActive: true } });
      const params = { percent: body.commission } as Prisma.InputJsonValue;
      if (current) await this.prisma.payrollRule.update({ where: { id: current.id }, data: { paramsJson: params, ruleType: 'PERCENT_REVENUE' } });
      else await this.prisma.payrollRule.create({ data: { organizationId: orgId, employeeId, name: 'Процент с выручки', ruleType: 'PERCENT_REVENUE', paramsJson: params } });
    }
    await this.trail(orgId, userId, 'Employee', employeeId, body.id ? 'UPDATE' : 'CREATE', { name: `${body.lastName} ${body.firstName}` });
    return { id: employeeId, ...(password ? { password, email: body.email!.trim().toLowerCase() } : {}) };
  }

  async setAiPlans(orgId: string, enabled: boolean) {
    await this.prisma.organization.update({ where: { id: orgId }, data: { aiPlans: enabled } });
    return { aiPlans: enabled };
  }

  async saveCabinet(orgId: string, userId: string, body: { id?: string; name: string; isActive?: boolean }) {
    if (!body.name?.trim()) throw new BadRequestException('Нужно название кресла');
    if (body.id) {
      const cabinet = await this.prisma.cabinet.update({ where: { id: await this.mine('cabinet', body.id, orgId) }, data: { name: body.name.trim(), isActive: body.isActive !== false } });
      await this.trail(orgId, userId, 'Cabinet', cabinet.id, 'UPDATE', { name: cabinet.name });
      return { id: cabinet.id };
    }
    const branch = await this.prisma.branch.findFirst({ where: { organizationId: orgId, isActive: true } });
    if (!branch) throw new BadRequestException('Нет филиала');
    const cabinet = await this.prisma.cabinet.create({ data: { branchId: branch.id, name: body.name.trim() } });
    await this.trail(orgId, userId, 'Cabinet', cabinet.id, 'CREATE', { name: cabinet.name });
    return { id: cabinet.id };
  }

  async saveRole(orgId: string, userId: string, body: RoleBody, id?: string) {
    if (!body.name?.trim()) throw new BadRequestException('Нужно название роли');
    const role = id
      ? await this.prisma.role.update({
        where: { id: await this.mine('role', id, orgId) },
        data: {
          name: body.name.trim(),
          seeCost: Boolean(body.seeCost),
          maxDiscountPercent: clamp(body.maxDiscountPercent ?? 0, 0, 100),
          editClosedVisits: Boolean(body.editClosedVisits),
          editPrice: Boolean(body.editPrice),
          seeAllFinance: Boolean(body.seeAllFinance),
          canExport: Boolean(body.canExport),
        },
      })
      : await this.prisma.role.create({
        data: {
          organizationId: orgId,
          code: `custom-${Date.now().toString().slice(-6)}`,
          name: body.name.trim(),
          seeCost: Boolean(body.seeCost),
          maxDiscountPercent: clamp(body.maxDiscountPercent ?? 0, 0, 100),
          editClosedVisits: Boolean(body.editClosedVisits),
          editPrice: Boolean(body.editPrice),
          seeAllFinance: Boolean(body.seeAllFinance),
          canExport: Boolean(body.canExport),
        },
      });
    if (body.permissions) {
      const catalog = await this.prisma.permission.findMany({ where: { code: { in: body.permissions } } });
      await this.prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
      if (catalog.length) {
        await this.prisma.rolePermission.createMany({ data: catalog.map((permission) => ({ roleId: role.id, permissionId: permission.id })) });
      }
    }
    await this.trail(orgId, userId, 'Role', role.id, id ? 'UPDATE' : 'CREATE', { name: role.name, maxDiscountPercent: role.maxDiscountPercent });
    return { id: role.id };
  }

  async savePromo(orgId: string, userId: string, body: { id?: string; code: string; discountPct: number; isActive?: boolean }) {
    if (!body.code?.trim()) throw new BadRequestException('Нужен код акции');
    const row = body.id
      ? await this.prisma.promoCode.update({ where: { id: await this.mine('promoCode', body.id, orgId) }, data: { code: body.code.trim().toUpperCase(), discountPct: body.discountPct, isActive: body.isActive !== false } })
      : await this.prisma.promoCode.create({ data: { organizationId: orgId, code: body.code.trim().toUpperCase(), discountPct: body.discountPct } });
    await this.trail(orgId, userId, 'PromoCode', row.id, body.id ? 'UPDATE' : 'CREATE', { code: row.code });
    return { id: row.id };
  }

  async saveRule(orgId: string, userId: string, body: { id?: string; name: string; trigger: string; channel?: 'TELEGRAM' | 'WHATSAPP' | 'SMS'; body: string; isActive?: boolean }) {
    if (!body.name?.trim() || !body.body?.trim()) throw new BadRequestException('Нужны название и текст');
    const data = { name: body.name.trim(), trigger: body.trigger, channel: body.channel ?? 'WHATSAPP' as const, body: body.body.trim(), isActive: body.isActive !== false };
    const row = body.id
      ? await this.prisma.reminderRule.update({ where: { id: await this.mine('reminderRule', body.id, orgId) }, data })
      : await this.prisma.reminderRule.create({ data: { ...data, organizationId: orgId } });
    await this.trail(orgId, userId, 'ReminderRule', row.id, body.id ? 'UPDATE' : 'CREATE', { name: row.name });
    return { id: row.id };
  }

  private async trail(orgId: string, userId: string, entityType: string, entityId: string, action: 'CREATE' | 'UPDATE' | 'DELETE', changes: Prisma.InputJsonValue) {
    await this.prisma.auditLog.create({
      data: { organizationId: orgId, userId, entityType, entityId, action, changes },
    });
  }
}

type ServiceBody = {
  id?: string;
  name?: string;
  code?: string;
  price?: number;
  durationMin?: number;
  parentId?: string | null;
  requiresTooth?: boolean;
  surfaceMode?: string;
  doctorPercent?: number;
  isActive?: boolean;
  norms?: { itemId: string; quantity: number }[];
};

type RoleBody = {
  name?: string;
  seeCost?: boolean;
  maxDiscountPercent?: number;
  editClosedVisits?: boolean;
  editPrice?: boolean;
  seeAllFinance?: boolean;
  canExport?: boolean;
  permissions?: string[];
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(value)));
}
