import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { consumeStock } from './stock-consume';
import { resolveBranchId } from '../common/resolve-branch';

@Injectable()
export class ClinicalService {
  constructor(private readonly prisma: PrismaService) {}

  listPlans(orgId: string, patientId?: string) {
    return this.prisma.treatmentPlan.findMany({
      where: { organizationId: orgId, ...(patientId ? { patientId } : {}) },
      include: { items: true, patient: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    });
  }

  async createPlan(orgId: string, data: { patientId: string; title: string; doctorId?: string; appointmentId?: string }) {
    const owned = await this.prisma.patient.count({ where: { id: data.patientId, organizationId: orgId } });
    if (!owned) throw new NotFoundException('Пациент не найден');
    return this.prisma.treatmentPlan.create({
      data: { organizationId: orgId, ...data },
      include: { items: true },
    });
  }

  async createPlanFromAppointment(orgId: string, appointmentId: string) {
    const appt = await this.prisma.appointment.findFirst({
      where: { id: appointmentId, organizationId: orgId },
      include: { service: true },
    });
    if (!appt) throw new NotFoundException('Запись не найдена');

    const existing = await this.prisma.treatmentPlan.findFirst({
      where: { appointmentId, status: { notIn: ['CANCELLED', 'COMPLETED'] } },
    });
    if (existing) return existing;

    const title = appt.service?.name
      ? `Лечение: ${appt.service.name}`
      : `План после приёма ${new Date(appt.startsAt).toLocaleDateString('ru-RU')}`;

    const plan = await this.prisma.treatmentPlan.create({
      data: {
        organizationId: orgId,
        patientId: appt.patientId,
        doctorId: appt.doctorId ?? undefined,
        appointmentId,
        title,
        status: 'IN_PROGRESS',
      },
      include: { items: true },
    });

    if (appt.service) {
      const price = Number(appt.service.basePrice);
      await this.prisma.treatmentPlanItem.create({
        data: {
          planId: plan.id,
          title: appt.service.name,
          price,
          serviceId: appt.service.id,
          sortOrder: 0,
        },
      });
      await this.recalcPlanTotal(plan.id);
    }

    return this.getPlan(plan.id);
  }

  listImaging(patientId: string) {
    return this.prisma.imagingStudy.findMany({
      where: { patientId },
      orderBy: { takenAt: 'desc' },
    });
  }

  listConsents(orgId: string, patientId?: string) {
    return this.prisma.patientConsent.findMany({
      where: { organizationId: orgId, ...(patientId ? { patientId } : {}) },
      orderBy: { id: 'desc' },
      take: 50,
    });
  }

  async getToothChart(patientId: string) {
    const patient = await this.prisma.patient.findUnique({ where: { id: patientId } });
    if (!patient) throw new NotFoundException();
    return this.prisma.toothRecord.findMany({
      where: { patientId },
      orderBy: [{ formula: 'asc' }, { toothNum: 'asc' }],
    });
  }

  upsertTooth(
    patientId: string,
    data: {
      toothNum: number;
      formula: 'ADULT' | 'CHILD';
      condition: string;
      diagnosis?: string;
      surfaces?: string[];
      layer?: string;
    },
  ) {
    return this.applyChart(patientId, {
      ...data,
      source: 'EXAM',
      note: data.diagnosis,
    });
  }

  async chartBundle(patientId: string) {
    const [records, surfaces, events] = await Promise.all([
      this.getToothChart(patientId),
      this.prisma.toothSurface.findMany({
        where: { patientId },
        orderBy: [{ toothNum: 'asc' }, { surface: 'asc' }],
      }),
      this.prisma.toothEvent.findMany({
        where: { patientId },
        orderBy: { createdAt: 'desc' },
        take: 80,
      }),
    ]);
    return { records, surfaces, events };
  }

  async priceCatalog(orgId: string) {
    const [services, listed] = await Promise.all([
      this.prisma.service.findMany({
        where: { organizationId: orgId, isActive: true, NOT: { code: { startsWith: 'GROUP' } } },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.priceListItem.findMany({
        where: { priceList: { organizationId: orgId, isActive: true, isDefault: true } },
      }),
    ]);
    const listedPrice = new Map(listed.map((item) => [item.serviceId, Number(item.price)]));
    const byName = new Map<string, { id: string; name: string; code: string | null; price: number }>();
    for (const service of services) {
      const key = service.name.trim().toLowerCase();
      const row = {
        id: service.id,
        name: service.name,
        code: service.code,
        price: listedPrice.get(service.id) ?? Number(service.basePrice),
      };
      const prev = byName.get(key);
      if (!prev || (service.code && !prev.code)) byName.set(key, row);
    }
    return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  }

  private async catalogPrice(orgId: string, serviceId: string) {
    const service = await this.prisma.service.findFirst({ where: { id: serviceId, organizationId: orgId } });
    if (!service) throw new NotFoundException('Услуга не найдена в прайсе');
    const listed = await this.prisma.priceListItem.findFirst({
      where: {
        serviceId,
        priceList: { organizationId: orgId, isActive: true, isDefault: true },
      },
    });
    return { name: service.name, price: listed ? Number(listed.price) : Number(service.basePrice) };
  }

  async addPlanItem(
    orgId: string,
    planId: string,
    data: {
      phaseId?: string;
      title?: string;
      toothNum?: number;
      price?: number;
      serviceId?: string;
      surfaces?: string[];
      phase?: number;
      discountPercent?: number;
      durationMin?: number;
    },
  ) {
    const plan = await this.prisma.treatmentPlan.findFirst({ where: { id: planId, organizationId: orgId } });
    if (!plan) throw new NotFoundException('План не найден');
    const phaseRef = data.phaseId ? await this.prisma.planPhase.findFirst({ where: { id: data.phaseId, planId } }) : null;
    if (plan.status === 'REJECTED' || plan.status === 'CANCELLED') {
      throw new BadRequestException('В отклонённый план нельзя добавлять строки');
    }
    let listPrice: number | null = null;
    let title = data.title?.trim() || '';
    let durationMin = data.durationMin;
    if (data.serviceId) {
      const catalog = await this.catalogPrice(plan.organizationId, data.serviceId);
      listPrice = catalog.price;
      title = title || catalog.name;
      const service = await this.prisma.service.findFirst({ where: { id: data.serviceId } });
      durationMin = durationMin ?? service?.durationMin;
    }
    if (!title) throw new NotFoundException('Укажите услугу из прайса');
    if (data.toothNum != null && !CHART_TEETH.includes(data.toothNum)) {
      throw new BadRequestException('Номер зуба должен быть в системе FDI');
    }
    const surfaces = normalizeSurfaces(data.surfaces);
    const discount = clamp(data.discountPercent ?? 0, 0, 100);
    const quoted = data.price != null && Number.isFinite(data.price) ? data.price : (listPrice ?? 0);
    const matchesList = listPrice == null || Math.abs(quoted - listPrice) < 0.5;
    const price = discount > 0 && matchesList ? roundMoney((listPrice ?? quoted) * (1 - discount / 100)) : roundMoney(quoted);
    const impliedDiscount =
      listPrice && listPrice > 0 ? clamp((1 - price / listPrice) * 100, 0, 100) : discount;
    const maxPhase = await this.prisma.treatmentPlanItem.aggregate({ where: { planId }, _max: { phase: true } });
    const item = await this.prisma.treatmentPlanItem.create({
      data: {
        planId,
        title,
        toothNum: data.toothNum,
        surfaces,
        phase: phaseRef ? phaseRef.sortOrder + 1 : data.phase && data.phase > 0 ? Math.round(data.phase) : (maxPhase._max.phase ?? 1),
        phaseId: phaseRef?.id ?? null,
        price,
        listPrice,
        discountPercent: roundMoney(impliedDiscount),
        durationMin: durationMin && durationMin > 0 ? durationMin : 30,
        serviceId: data.serviceId,
        sortOrder: 1000,
      },
    });
    await this.recalcPlanTotal(planId);
    return item;
  }

  async updatePlanItem(
    orgId: string,
    itemId: string,
    data: { price?: number; serviceId?: string; discountPercent?: number; phase?: number; surfaces?: string[]; toothNum?: number | null },
  ) {
    const item = await this.prisma.treatmentPlanItem.findUnique({
      where: { id: itemId },
      include: { plan: true },
    });
    if (!item || item.plan.organizationId !== orgId) throw new NotFoundException('Строка плана не найдена');
    if (item.status === 'DONE') throw new BadRequestException('Выполненную строку нельзя пересчитывать — она уже в истории');
    let listPrice: number | null = item.listPrice == null ? null : Number(item.listPrice);
    let serviceId = item.serviceId;
    let title = item.title;
    if (data.serviceId) {
      const catalog = await this.catalogPrice(item.plan.organizationId, data.serviceId);
      listPrice = catalog.price;
      serviceId = data.serviceId;
      title = catalog.name;
    }
    const discount = data.discountPercent != null ? clamp(data.discountPercent, 0, 100) : Number(item.discountPercent);
    let price = Number(item.price);
    if (data.price != null && Number.isFinite(data.price)) {
      price = roundMoney(data.price);
    } else if (data.discountPercent != null && listPrice != null) {
      price = roundMoney(listPrice * (1 - discount / 100));
    }
    const implied =
      listPrice && listPrice > 0 ? clamp((1 - price / listPrice) * 100, 0, 100) : discount;
    if (data.toothNum != null && !CHART_TEETH.includes(data.toothNum)) {
      throw new BadRequestException('Номер зуба должен быть в системе FDI');
    }
    const updated = await this.prisma.treatmentPlanItem.update({
      where: { id: itemId },
      data: {
        price,
        listPrice,
        serviceId,
        title,
        discountPercent: roundMoney(data.price != null ? implied : discount),
        ...(data.phase != null ? { phase: Math.max(1, Math.round(data.phase)) } : {}),
        ...(data.surfaces ? { surfaces: normalizeSurfaces(data.surfaces) } : {}),
        ...(data.toothNum !== undefined ? { toothNum: data.toothNum } : {}),
      },
    });
    await this.recalcPlanTotal(item.planId);
    return updated;
  }

  addDiaryEntry(planId: string, notes: string, toothNum?: number) {
    return this.prisma.treatmentDiaryEntry.create({ data: { planId, notes, toothNum } });
  }

  addImaging(patientId: string, data: { type: string; fileUrl: string; title?: string; toothNum?: number }) {
    return this.prisma.imagingStudy.create({
      data: { patientId, type: data.type as never, fileUrl: data.fileUrl, title: data.title, toothNum: data.toothNum },
    });
  }

  signConsent(orgId: string, data: { patientId: string; type: string }) {
    return this.prisma.patientConsent.create({
      data: {
        organizationId: orgId,
        patientId: data.patientId,
        type: data.type as never,
        status: 'SIGNED',
        signedAt: new Date(),
      },
    });
  }

  async updatePlanStatus(planId: string, status: string) {
    const allowed = ['DRAFT', 'PROPOSED', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'REJECTED', 'CANCELLED'];
    if (!allowed.includes(status)) throw new BadRequestException('Неизвестный статус плана');
    const current = await this.prisma.treatmentPlan.findUnique({ where: { id: planId }, include: { items: true } });
    if (!current) throw new NotFoundException('План не найден');
    if (status === 'COMPLETED' && current.items.some((item) => item.status === 'ACCEPTED' || item.status === 'PROPOSED')) {
      throw new BadRequestException('Сначала выполните или отклоните все открытые строки');
    }
    const now = new Date();
    const plan = await this.prisma.treatmentPlan.update({
      where: { id: planId },
      data: {
        status: status as never,
        ...(status === 'PROPOSED' && !current.presentedAt ? { presentedAt: now } : {}),
        ...(status === 'ACCEPTED' ? { acceptedAt: current.acceptedAt ?? now, presentedAt: current.presentedAt ?? now } : {}),
      },
      include: { items: true },
    });
    if (status === 'ACCEPTED') {
      await this.prisma.treatmentPlanItem.updateMany({
        where: { planId, status: 'PROPOSED' },
        data: { status: 'ACCEPTED' },
      });
    }
    return this.getPlan(planId);
  }

  async acceptPlan(planId: string) {
    return this.updatePlanStatus(planId, 'ACCEPTED');
  }

  async setPlanDiscount(planId: string, discountPercent: number) {
    const plan = await this.prisma.treatmentPlan.findUnique({ where: { id: planId } });
    if (!plan) throw new NotFoundException('План не найден');
    await this.prisma.treatmentPlan.update({
      where: { id: planId },
      data: { discountPercent: roundMoney(clamp(discountPercent, 0, 100)) },
    });
    return this.recalcPlanTotal(planId);
  }

  async schedulePlanItems(
    orgId: string,
    planId: string,
    data: { itemIds: string[]; branchId: string; startsAt: string; doctorId?: string; cabinetId?: string },
  ) {
    const plan = await this.prisma.treatmentPlan.findFirst({
      where: { id: planId, organizationId: orgId },
      include: { items: true, patient: true },
    });
    if (!plan) throw new NotFoundException('План не найден');
    if (plan.status === 'REJECTED' || plan.status === 'CANCELLED' || plan.status === 'COMPLETED') {
      throw new BadRequestException('Этот план нельзя ставить в расписание');
    }
    const items = plan.items.filter((item) => data.itemIds.includes(item.id));
    if (!items.length) throw new BadRequestException('Выберите строки плана');
    if (items.some((item) => item.status === 'DONE' || item.status === 'REJECTED')) {
      throw new BadRequestException('Выполненные и отклонённые строки не записывают');
    }
    if (items.some((item) => item.appointmentId)) {
      throw new BadRequestException('Часть строк уже стоит в расписании');
    }
    const branch = await this.prisma.branch.findFirst({ where: { id: data.branchId, organizationId: orgId } });
    if (!branch) throw new NotFoundException('Филиал не найден');
    const startsAt = new Date(data.startsAt);
    if (Number.isNaN(startsAt.getTime())) throw new BadRequestException('Укажите дату и время визита');
    const minutes = Math.max(30, items.reduce((sum, item) => sum + (item.durationMin || 30), 0));
    const endsAt = new Date(startsAt.getTime() + minutes * 60_000);
    if (data.doctorId || data.cabinetId) {
      const conflict = await this.prisma.appointment.findFirst({
        where: {
          branchId: data.branchId,
          status: { notIn: ['CANCELLED', 'NO_SHOW'] },
          OR: [
            data.doctorId ? { doctorId: data.doctorId, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } } : undefined,
            data.cabinetId ? { cabinetId: data.cabinetId, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } } : undefined,
          ].filter(Boolean) as object[],
        },
      });
      if (conflict) throw new BadRequestException('Слот занят — выберите другое время');
    }
    const lines = items
      .map((item) => `${item.title}${item.toothNum ? ` · ${item.toothNum}` : ''}${item.surfaces.length ? ` (${item.surfaces.join('')})` : ''}`)
      .join('; ');
    const appointment = await this.prisma.appointment.create({
      data: {
        organizationId: orgId,
        branchId: data.branchId,
        patientId: plan.patientId,
        doctorId: data.doctorId || plan.doctorId || undefined,
        cabinetId: data.cabinetId,
        serviceId: items.find((item) => item.serviceId)?.serviceId,
        startsAt,
        endsAt,
        status: 'SCHEDULED',
        notes: `План «${plan.title}»: ${lines}`,
      },
    });
    await this.prisma.treatmentPlanItem.updateMany({
      where: { id: { in: items.map((item) => item.id) } },
      data: { appointmentId: appointment.id, status: 'ACCEPTED' },
    });
    await this.prisma.treatmentPlan.update({
      where: { id: planId },
      data: {
        status: 'IN_PROGRESS',
        acceptedAt: plan.acceptedAt ?? new Date(),
        presentedAt: plan.presentedAt ?? new Date(),
      },
    });
    return { appointmentId: appointment.id, plan: await this.getPlan(planId) };
  }

  async togglePlanItem(itemId: string, isCompleted: boolean) {
    const item = await this.prisma.treatmentPlanItem.update({
      where: { id: itemId },
      data: { isCompleted, status: isCompleted ? 'DONE' : 'ACCEPTED' },
    });
    await this.recalcPlanTotal(item.planId);
    return item;
  }

  async setItemStatus(itemId: string, status: string) {
    const allowed = ['PROPOSED', 'ACCEPTED', 'DONE', 'REJECTED'];
    if (!allowed.includes(status)) return null;
    if (status === 'DONE') {
      const current = await this.prisma.treatmentPlanItem.findUnique({
        where: { id: itemId },
        include: { plan: true },
      });
      if (!current) return null;
      return this.completePlanItemWithMaterials(current.plan.organizationId, itemId, undefined, true);
    }
    const item = await this.prisma.treatmentPlanItem.update({
      where: { id: itemId },
      data: { status: status as never, isCompleted: false, completedAt: null },
    });
    await this.recalcPlanTotal(item.planId);
    return item;
  }

  async recalcPlanTotal(planId: string) {
    const items = await this.prisma.treatmentPlanItem.findMany({ where: { planId } });
    const plan = await this.prisma.treatmentPlan.findUnique({ where: { id: planId } });
    const subtotal = items
      .filter((i) => i.status !== 'REJECTED')
      .reduce((s, i) => s + Number(i.price), 0);
    const discount = plan ? Number(plan.discountPercent) : 0;
    const total = roundMoney(subtotal * (1 - clamp(discount, 0, 100) / 100));
    return this.prisma.treatmentPlan.update({
      where: { id: planId },
      data: { totalPrice: total },
      include: { items: true, patient: true },
    });
  }

  getPlan(planId: string) {
    return this.prisma.treatmentPlan.findUniqueOrThrow({
      where: { id: planId },
      include: {
        items: {
          orderBy: { sortOrder: 'asc' },
          include: {
            service: { select: { id: true, name: true, basePrice: true, code: true } },
            invoiceItem: { select: { id: true } },
            appointment: { select: { id: true, startsAt: true, status: true } },
          },
        },
        diaryEntries: { orderBy: { createdAt: 'desc' } },
        patient: { include: { toothRecords: true } },
        doctor: true,
        alternatives: { select: { id: true, title: true, status: true, totalPrice: true } },
        parentPlan: { select: { id: true, title: true } },
      },
    });
  }

  async reorderPlanItems(planId: string, itemIds: string[]) {
    await Promise.all(
      itemIds.map((id, index) =>
        this.prisma.treatmentPlanItem.update({
          where: { id },
          data: { sortOrder: index },
        }),
      ),
    );
    return this.getPlan(planId);
  }

  async createAlternativePlan(orgId: string, parentPlanId: string, title: string) {
    const parent = await this.prisma.treatmentPlan.findUniqueOrThrow({ where: { id: parentPlanId } });
    return this.prisma.treatmentPlan.create({
      data: {
        organizationId: orgId,
        patientId: parent.patientId,
        doctorId: parent.doctorId,
        title,
        isAlternative: true,
        parentPlanId,
      },
      include: { items: true, alternatives: true },
    });
  }

  async completePlanItemWithMaterials(
    orgId: string,
    itemId: string,
    branchId: string | undefined,
    isCompleted: boolean,
  ) {
    const stockBranchId = await resolveBranchId(this.prisma, orgId, branchId);
    const item = await this.prisma.treatmentPlanItem.update({
      where: { id: itemId },
      data: { isCompleted, status: isCompleted ? 'DONE' : 'ACCEPTED' },
      include: { service: true, plan: true },
    });
    if (isCompleted && item.toothNum) {
      const result = chartResultFor(item.service, item.title);
      if (result) {
        await this.applyChart(item.plan.patientId, {
          toothNum: item.toothNum,
          formula: 'ADULT',
          condition: result,
          surfaces: item.surfaces,
          layer: 'EXISTING',
          source: 'PLAN_DONE',
          note: `Выполнено: ${item.title}`,
        });
      }
    }
    if (isCompleted) {
      await this.prisma.treatmentPlanItem.update({
        where: { id: itemId },
        data: { completedAt: new Date() },
      });
      const open = await this.prisma.treatmentPlanItem.count({
        where: { planId: item.planId, status: { in: ['PROPOSED', 'ACCEPTED'] } },
      });
      if (open === 0) {
        await this.prisma.treatmentPlan.update({
          where: { id: item.planId },
          data: { status: 'COMPLETED' },
        });
      } else if (item.plan.status === 'ACCEPTED' || item.plan.status === 'PROPOSED' || item.plan.status === 'DRAFT') {
        await this.prisma.treatmentPlan.update({
          where: { id: item.planId },
          data: { status: 'IN_PROGRESS', acceptedAt: item.plan.acceptedAt ?? new Date() },
        });
      }
    }
    if (isCompleted && item.serviceId) {
      const norms = await this.prisma.serviceMaterialNorm.findMany({
        where: { organizationId: orgId, serviceId: item.serviceId },
      });
      for (const norm of norms) {
        await consumeStock(this.prisma, {
          organizationId: orgId,
          itemId: norm.itemId,
          branchId: stockBranchId,
          quantity: Number(norm.quantity),
          type: 'TREATMENT_USE',
          notes: `Списание по услуге: ${item.title}`,
        });
      }
    }
    await this.recalcPlanTotal(item.planId);
    return item;
  }

  addDiaryWithPhoto(planId: string, notes: string, photoUrl?: string, toothNum?: number) {
    return this.prisma.treatmentDiaryEntry.create({
      data: { planId, notes, photoUrl, toothNum },
    });
  }

  listPhotoPairs(patientId: string) {
    return this.prisma.imagingStudy.findMany({
      where: { patientId, type: 'PHOTO' },
      orderBy: { takenAt: 'desc' },
    });
  }

  async listPerio(orgId: string, patientId: string) {
    await this.ownPatient(orgId, patientId);
    const [exams, missingRecords] = await Promise.all([
      this.prisma.perioExam.findMany({
        where: { organizationId: orgId, patientId },
        include: { teeth: { include: { sites: { orderBy: { position: 'asc' } } }, orderBy: { toothNum: 'asc' } } },
        orderBy: { examinedAt: 'desc' },
        take: 12,
      }),
      this.prisma.toothRecord.findMany({
        where: { patientId, condition: 'MISSING' },
        select: { toothNum: true },
      }),
    ]);
    return {
      missingTeeth: missingRecords.map((row) => row.toothNum),
      exams: exams.map((exam) => ({ ...exam, summary: perioSummary(exam.teeth) })),
    };
  }

  async createPerio(
    orgId: string,
    patientId: string,
    data: {
      notes?: string;
      teeth: { toothNum: number; missing?: boolean; mobility?: number; furcation?: number; sites?: { position: number; pocket: number; recession: number; bleeding: boolean }[] }[];
    },
  ) {
    await this.ownPatient(orgId, patientId);
    const seen = new Set<number>();
    const teeth = data.teeth.filter((tooth) => CHART_TEETH.includes(tooth.toothNum));
    for (const tooth of teeth) {
      if (seen.has(tooth.toothNum)) throw new BadRequestException('Зуб в осмотре повторяется');
      seen.add(tooth.toothNum);
    }
    const exam = await this.prisma.perioExam.create({
      data: {
        organizationId: orgId,
        patientId,
        notes: data.notes?.trim() || null,
        teeth: {
          create: teeth.map((tooth) => {
            const missing = Boolean(tooth.missing);
            const molar = MOLARS.has(tooth.toothNum);
            return {
              toothNum: tooth.toothNum,
              missing,
              mobility: clamp(tooth.mobility ?? 0, 0, 3),
              furcation: molar ? clamp(tooth.furcation ?? 0, 0, 3) : 0,
              ...(missing
                ? {}
                : {
                    sites: {
                      create: Array.from({ length: 6 }, (_, position) => {
                        const site = tooth.sites?.find((row) => row.position === position);
                        return {
                          position,
                          pocket: clamp(site?.pocket ?? 0, 0, 15),
                          recession: clamp(site?.recession ?? 0, -5, 15),
                          bleeding: Boolean(site?.bleeding),
                        };
                      }),
                    },
                  }),
            };
          }),
        },
      },
      include: { teeth: { include: { sites: { orderBy: { position: 'asc' } } } } },
    });
    return { ...exam, summary: perioSummary(exam.teeth) };
  }

  omsTariffs() {
    return {
      items: OMS_TARIFFS,
      notice: 'Коды номенклатуры. Сумму сверьте с тарифом своего региона. В ТФОМС это не уходит.',
    };
  }

  async omsState(orgId: string, patientId: string) {
    await this.ownPatient(orgId, patientId);
    const [policy, cases] = await Promise.all([
      this.prisma.omsPolicy.findFirst({
        where: { organizationId: orgId, patientId, isActive: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.omsCase.findMany({
        where: { organizationId: orgId, patientId },
        include: {
          lines: { orderBy: { id: 'asc' } },
          branch: { select: { id: true, name: true } },
          doctor: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { openedAt: 'desc' },
        take: 20,
      }),
    ]);
    return {
      policy,
      cases: cases.map((row) => ({ ...row, fundAmount: fundAmount(row.lines), sent: false })),
      notice: 'Случай хранится в клинике и в ТФОМС не отправляется. Тариф — не касса.',
    };
  }

  async saveOmsPolicy(
    orgId: string,
    patientId: string,
    data: { number: string; smoName: string; region?: string; validFrom?: string; validTo?: string },
  ) {
    await this.ownPatient(orgId, patientId);
    const number = data.number.replace(/\s/g, '');
    if (!/^\d{9,16}$/.test(number)) throw new BadRequestException('Номер полиса ОМС: 9–16 цифр');
    if (!data.smoName.trim()) throw new BadRequestException('Укажите страховую');
    await this.prisma.omsPolicy.updateMany({
      where: { organizationId: orgId, patientId, isActive: true },
      data: { isActive: false },
    });
    return this.prisma.omsPolicy.create({
      data: {
        organizationId: orgId,
        patientId,
        number,
        smoName: data.smoName.trim(),
        region: data.region?.trim() || null,
        validFrom: data.validFrom ? new Date(data.validFrom) : null,
        validTo: data.validTo ? new Date(data.validTo) : null,
      },
    });
  }

  async openOmsCase(orgId: string, patientId: string, branchId: string, doctorId?: string) {
    await this.ownPatient(orgId, patientId);
    const policy = await this.prisma.omsPolicy.findFirst({
      where: { organizationId: orgId, patientId, isActive: true },
    });
    if (!policy) throw new BadRequestException('Сначала сохраните полис ОМС');
    const branch = await this.prisma.branch.findFirst({ where: { id: branchId, organizationId: orgId } });
    if (!branch) throw new NotFoundException('Филиал не найден');
    const open = await this.prisma.omsCase.findFirst({
      where: { organizationId: orgId, patientId, status: 'OPEN' },
    });
    if (open) throw new BadRequestException('У пациента уже есть открытый случай ОМС');
    return this.prisma.omsCase.create({
      data: {
        organizationId: orgId,
        branchId,
        patientId,
        policyId: policy.id,
        doctorId: doctorId || null,
        exportStatus: 'NOT_SENT',
      },
      include: { lines: true, branch: { select: { name: true } } },
    });
  }

  async addOmsLine(
    orgId: string,
    caseId: string,
    data: { code: string; title: string; toothNum?: number; quantity?: number; tariff?: number },
  ) {
    const row = await this.prisma.omsCase.findFirst({ where: { id: caseId, organizationId: orgId } });
    if (!row) throw new NotFoundException('Случай ОМС не найден');
    if (row.status !== 'OPEN') throw new BadRequestException('Случай уже закрыт');
    if (!data.code.trim() || !data.title.trim()) throw new BadRequestException('Нужны код и название услуги');
    return this.prisma.omsCaseLine.create({
      data: {
        caseId,
        code: data.code.trim(),
        title: data.title.trim(),
        toothNum: data.toothNum || null,
        quantity: clamp(data.quantity ?? 1, 1, 20),
        tariff: Math.max(0, Number(data.tariff) || 0),
      },
    });
  }

  async closeOmsCase(orgId: string, caseId: string, data: { icd10: string; result?: string }) {
    const row = await this.prisma.omsCase.findFirst({
      where: { id: caseId, organizationId: orgId },
      include: { lines: true },
    });
    if (!row) throw new NotFoundException('Случай ОМС не найден');
    if (row.status !== 'OPEN') throw new BadRequestException('Случай уже закрыт');
    const icd10 = data.icd10.trim().toUpperCase();
    if (!/^[A-Z]\d{2}(\.\d{1,2})?$/.test(icd10)) throw new BadRequestException('Укажите диагноз МКБ-10, например K02.1');
    if (!row.lines.length) throw new BadRequestException('Добавьте хотя бы одну услугу по тарифу');
    const closed = await this.prisma.omsCase.update({
      where: { id: caseId },
      data: {
        status: 'CLOSED',
        closedAt: new Date(),
        icd10,
        result: data.result === 'REFERRED' ? 'REFERRED' : 'TREATMENT',
        exportStatus: 'NOT_SENT',
      },
      include: { lines: true, branch: { select: { name: true } } },
    });
    return { ...closed, fundAmount: fundAmount(closed.lines), sent: false };
  }

  private async applyChart(
    patientId: string,
    data: {
      toothNum: number;
      formula: 'ADULT' | 'CHILD';
      condition: string;
      diagnosis?: string;
      surfaces?: string[];
      layer?: string;
      source: string;
      note?: string;
    },
  ) {
    if (!CHART_TEETH.includes(data.toothNum)) throw new BadRequestException('Номер зуба должен быть в системе FDI');
    const condition = data.condition as 'HEALTHY' | 'CARIES' | 'FILLED' | 'CROWN' | 'MISSING' | 'IMPLANT' | 'ROOT_CANAL' | 'OTHER';
    const layer = layerFor(condition, data.layer);
    const surfaces = normalizeSurfaces(data.surfaces);
    const wholeTooth = ['MISSING', 'IMPLANT', 'CROWN', 'ROOT_CANAL'].includes(condition) || surfaces.length === 0;
    const targets = condition === 'HEALTHY' ? (surfaces.length ? surfaces : ['TOOTH']) : wholeTooth ? ['TOOTH'] : surfaces;

    if (condition === 'MISSING') {
      await this.prisma.toothSurface.deleteMany({
        where: { patientId, toothNum: data.toothNum, formula: data.formula },
      });
    }

    for (const surface of targets) {
      if (condition === 'HEALTHY') {
        await this.prisma.toothSurface.deleteMany({
          where: { patientId, toothNum: data.toothNum, formula: data.formula, surface },
        });
        continue;
      }
      await this.prisma.toothSurface.upsert({
        where: {
          patientId_formula_toothNum_surface: {
            patientId,
            formula: data.formula,
            toothNum: data.toothNum,
            surface,
          },
        },
        create: {
          patientId,
          formula: data.formula,
          toothNum: data.toothNum,
          surface,
          condition,
          layer,
          diagnosis: data.diagnosis,
        },
        update: { condition, layer, diagnosis: data.diagnosis },
      });
    }

    const rows = await this.prisma.toothSurface.findMany({
      where: { patientId, toothNum: data.toothNum, formula: data.formula },
    });
    const summary = summarizeChart(rows);
    const record = await this.prisma.toothRecord.upsert({
      where: {
        patientId_formula_toothNum: { patientId, formula: data.formula, toothNum: data.toothNum },
      },
      create: {
        patientId,
        formula: data.formula,
        toothNum: data.toothNum,
        condition: summary.condition as never,
        layer: summary.layer,
        surfaces: summary.surfaces,
        diagnosis: data.diagnosis,
      },
      update: {
        condition: summary.condition as never,
        layer: summary.layer,
        surfaces: summary.surfaces,
        ...(data.diagnosis !== undefined ? { diagnosis: data.diagnosis } : {}),
      },
    });
    await this.prisma.toothEvent.create({
      data: {
        patientId,
        toothNum: data.toothNum,
        formula: data.formula,
        surfaces: targets.filter((surface) => surface !== 'TOOTH'),
        condition,
        layer,
        note: data.note || data.diagnosis || null,
        source: data.source,
      },
    });
    return record;
  }

  /** The plan, if it is this clinic's; every plan route goes through it first. */
  async ownPlan(orgId: string, planId: string) {
    const plan = await this.prisma.treatmentPlan.findFirst({ where: { id: planId, organizationId: orgId } });
    if (!plan) throw new NotFoundException('План не найден');
    return plan;
  }

  async ownPatient(orgId: string, patientId: string) {
    const patient = await this.prisma.patient.findFirst({ where: { id: patientId, organizationId: orgId } });
    if (!patient) throw new NotFoundException('Пациент не найден');
    return patient;
  }
}

const CHART_TEETH = [
  18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28,
  48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38,
  55, 54, 53, 52, 51, 61, 62, 63, 64, 65, 75, 74, 73, 72, 71, 81, 82, 83, 84, 85,
];
const MOLARS = new Set([18, 17, 16, 28, 27, 26, 38, 37, 36, 48, 47, 46, 55, 54, 64, 65, 75, 74, 84, 85]);

export const OMS_TARIFFS = [
  { code: 'B01.065.001', title: 'Приём стоматолога-терапевта', tariff: 500 },
  { code: 'B01.065.003', title: 'Приём стоматолога-хирурга', tariff: 500 },
  { code: 'B01.065.007', title: 'Приём детского стоматолога', tariff: 500 },
  { code: 'A16.07.002', title: 'Восстановление зуба пломбой', tariff: 1200 },
  { code: 'A16.07.030', title: 'Обработка корневого канала', tariff: 1500 },
  { code: 'A16.07.008', title: 'Удаление постоянного зуба', tariff: 900 },
  { code: 'A16.07.001', title: 'Удаление зуба', tariff: 700 },
  { code: 'A16.07.051', title: 'Профессиональная гигиена', tariff: 1800 },
];

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function perioSummary(teeth: { missing: boolean; sites: { pocket: number; bleeding: boolean }[] }[]) {
  const sites = teeth.filter((tooth) => !tooth.missing).flatMap((tooth) => tooth.sites);
  const bleeding = sites.filter((site) => site.bleeding).length;
  const pockets4 = sites.filter((site) => site.pocket >= 4).length;
  const pockets6 = sites.filter((site) => site.pocket >= 6).length;
  const meanPocket = sites.length ? Math.round((sites.reduce((sum, site) => sum + site.pocket, 0) / sites.length) * 10) / 10 : 0;
  return {
    sites: sites.length,
    bleeding,
    bopPercent: sites.length ? Math.round((bleeding / sites.length) * 100) : 0,
    pockets4,
    pockets6,
    meanPocket,
  };
}

function fundAmount(lines: { quantity: number; tariff: { toString(): string } | number }[]) {
  return lines.reduce((sum, line) => sum + line.quantity * Number(line.tariff), 0);
}

const SURFACE_CODES = new Set(['M', 'D', 'O', 'B', 'L', 'I', 'V', 'P']);

function normalizeSurfaces(surfaces?: string[]) {
  return [...new Set((surfaces ?? []).map((surface) => surface.trim().toUpperCase()).filter((surface) => SURFACE_CODES.has(surface)))];
}

function layerFor(condition: string, explicit?: string): 'EXISTING' | 'PATHOLOGY' {
  if (explicit === 'EXISTING' || explicit === 'PATHOLOGY') return explicit;
  if (['FILLED', 'CROWN', 'IMPLANT', 'MISSING', 'ROOT_CANAL'].includes(condition)) return 'EXISTING';
  return 'PATHOLOGY';
}

function summarizeChart(rows: { surface: string; condition: string; layer: string }[]) {
  const active = rows.filter((row) => row.condition !== 'HEALTHY');
  const tooth = active.find((row) => row.surface === 'TOOTH');
  if (tooth?.condition === 'MISSING') return { condition: 'MISSING', layer: 'EXISTING' as const, surfaces: [] as string[] };
  if (tooth?.condition === 'IMPLANT') return { condition: 'IMPLANT', layer: 'EXISTING' as const, surfaces: [] as string[] };
  const pathology = active.filter((row) => row.layer === 'PATHOLOGY' && row.surface !== 'TOOTH');
  if (pathology.length) {
    const caries = pathology.find((row) => row.condition === 'CARIES') ?? pathology[0];
    return { condition: caries.condition, layer: 'PATHOLOGY' as const, surfaces: pathology.map((row) => row.surface) };
  }
  if (tooth?.condition === 'CROWN') return { condition: 'CROWN', layer: 'EXISTING' as const, surfaces: [] as string[] };
  if (tooth?.condition === 'ROOT_CANAL') return { condition: 'ROOT_CANAL', layer: 'EXISTING' as const, surfaces: [] as string[] };
  const filled = active.filter((row) => row.condition === 'FILLED' && row.surface !== 'TOOTH');
  if (filled.length) return { condition: 'FILLED', layer: 'EXISTING' as const, surfaces: filled.map((row) => row.surface) };
  if (tooth) {
    return {
      condition: tooth.condition,
      layer: tooth.layer === 'EXISTING' ? ('EXISTING' as const) : ('PATHOLOGY' as const),
      surfaces: [] as string[],
    };
  }
  return { condition: 'HEALTHY', layer: 'PATHOLOGY' as const, surfaces: [] as string[] };
}

function chartResultFor(service: { code?: string | null; name?: string | null } | null, title: string) {
  const code = service?.code ?? '';
  const known: Record<string, string> = {
    CARIES: 'FILLED',
    FILL: 'FILLED',
    CROWN: 'CROWN',
    IMPLANT: 'IMPLANT',
    ENDO: 'ROOT_CANAL',
    EXTRACT: 'MISSING',
  };
  if (known[code]) return known[code];
  const text = `${service?.name ?? ''} ${title}`.toLowerCase();
  if (/удал/.test(text)) return 'MISSING';
  if (/имплант/.test(text)) return 'IMPLANT';
  if (/корон|винир|вкладк/.test(text)) return 'CROWN';
  if (/канал|эндо/.test(text)) return 'ROOT_CANAL';
  if (/пломб|кариес|реставр/.test(text)) return 'FILLED';
  return null;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}
