import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { consumeStock } from './stock-consume';

type Norm = {
  quantity: { toString(): string };
  basis: string;
  billable: boolean;
  sellPrice: { toString(): string };
  item: { id: string; name: string; unit: string };
};

export function expandNorm(norm: Norm, surfaces: number) {
  const base = Number(norm.quantity);
  const count = Math.max(0, surfaces);
  if (norm.basis === 'PER_SURFACE') {
    const faces = Math.max(count, 1);
    return {
      qty: round3(base * faces),
      suggestion: faces > 1 ? `На ${faces} поверхн.` : null,
    };
  }
  if (norm.basis === 'EXTRA_SURFACE' && count >= 3) {
    return { qty: round3(base + 1), suggestion: '3 и больше поверхностей — вторая карпула' };
  }
  return { qty: round3(base), suggestion: count >= 2 && norm.basis === 'EXTRA_SURFACE' ? 'Пока хватает одной карпулы' : null };
}

@Injectable()
export class KitsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(orgId: string) {
    const services = await this.prisma.service.findMany({
      where: { organizationId: orgId, isActive: true, code: { in: ['CARIES', 'ENDO', 'EXTRACT', 'IMPLANT', 'HYGIENE', 'CROWN', 'WHITENING', 'CONSULT'] } },
      include: { materialNorms: { include: { item: { include: { batches: true } } } } },
      orderBy: { sortOrder: 'asc' },
    });
    return services.map((service) => this.shapeService(service));
  }

  async preview(orgId: string, serviceId: string, surfaces: number) {
    const service = await this.serviceOrThrow(orgId, serviceId);
    return this.shapeLines(service, surfaces);
  }

  async patientRollup(orgId: string, patientId: string) {
    const uses = await this.prisma.materialUse.findMany({
      where: { organizationId: orgId, patientId },
      orderBy: { createdAt: 'desc' },
    });
    const cost = uses.reduce((sum, row) => sum + Number(row.actualQty) * Number(row.unitCost), 0);
    const written = uses.filter((row) => row.writtenOff);
    return {
      lines: uses.length,
      cost: round2(cost),
      writtenOff: written.length,
      open: uses.length - written.length,
    };
  }

  async visitKit(orgId: string, appointmentId: string) {
    const appointment = await this.appointmentOrThrow(orgId, appointmentId);
    if (appointment.serviceId) await this.attachAppointment(orgId, appointment.id);
    return this.packVisit(orgId, appointment.id);
  }

  async applyService(orgId: string, appointmentId: string, serviceId: string, surfaces = 1) {
    const appointment = await this.appointmentOrThrow(orgId, appointmentId);
    await this.serviceOrThrow(orgId, serviceId);
    if (await this.locked(appointment.id)) throw new BadRequestException('Набор уже списан, состав визита не меняется');
    await this.prisma.appointment.update({ where: { id: appointment.id }, data: { serviceId } });
    await this.prisma.materialUse.deleteMany({ where: { appointmentId: appointment.id, writtenOff: false } });
    await this.attachAppointment(orgId, appointment.id, surfaces);
    return this.packVisit(orgId, appointment.id);
  }

  async retune(orgId: string, appointmentId: string, surfaces: number) {
    const appointment = await this.appointmentOrThrow(orgId, appointmentId);
    if (!appointment.serviceId) throw new BadRequestException('Сначала выберите услугу');
    if (await this.locked(appointment.id)) throw new BadRequestException('Набор уже списан');
    await this.prisma.materialUse.deleteMany({ where: { appointmentId: appointment.id, writtenOff: false } });
    await this.attachAppointment(orgId, appointment.id, surfaces);
    return this.packVisit(orgId, appointment.id);
  }

  async setQty(orgId: string, id: string, actualQty: number) {
    const row = await this.useOrThrow(orgId, id);
    if (row.writtenOff) throw new BadRequestException('Строка уже списана со склада');
    if (actualQty < 0) throw new BadRequestException('Количество не может быть отрицательным');
    await this.prisma.materialUse.update({ where: { id }, data: { actualQty: round3(actualQty) } });
    if (row.appointmentId) return this.packVisit(orgId, row.appointmentId);
    return { ok: true };
  }

  async addLine(orgId: string, body: { appointmentId?: string; planItemId?: string; itemId: string; qty: number }) {
    const item = await this.prisma.inventoryItem.findFirst({ where: { id: body.itemId, organizationId: orgId } });
    if (!item) throw new NotFoundException('Материала нет на складе');
    const qty = round3(body.qty || 1);
    let patientId = '';
    let serviceId: string | null = null;
    if (body.appointmentId) {
      const appointment = await this.appointmentOrThrow(orgId, body.appointmentId);
      if (await this.locked(appointment.id)) throw new BadRequestException('Набор уже списан');
      patientId = appointment.patientId;
      serviceId = appointment.serviceId;
    } else if (body.planItemId) {
      const planItem = await this.prisma.treatmentPlanItem.findFirst({
        where: { id: body.planItemId, plan: { organizationId: orgId } },
        include: { plan: true },
      });
      if (!planItem) throw new NotFoundException('Строка плана не найдена');
      patientId = planItem.plan.patientId;
      serviceId = planItem.serviceId;
    } else throw new BadRequestException('Нужен визит или строка плана');
    await this.prisma.materialUse.create({
      data: {
        organizationId: orgId,
        patientId,
        itemId: item.id,
        serviceId,
        appointmentId: body.appointmentId,
        planItemId: body.planItemId,
        name: item.name,
        unit: item.unit,
        plannedQty: 0,
        actualQty: qty,
        unitCost: await this.unitCost(item.id),
        suggestion: 'Добавлено вручную',
      },
    });
    if (body.appointmentId) return this.packVisit(orgId, body.appointmentId);
    return { ok: true };
  }

  async removeLine(orgId: string, id: string) {
    const row = await this.useOrThrow(orgId, id);
    if (row.writtenOff) throw new BadRequestException('Списанную строку нельзя убрать');
    await this.prisma.materialUse.delete({ where: { id } });
    if (row.appointmentId) return this.packVisit(orgId, row.appointmentId);
    return { ok: true };
  }

  async attachFamily(orgId: string, familyKey: string) {
    const items = await this.prisma.treatmentPlanItem.findMany({
      where: { plan: { organizationId: orgId, familyKey }, serviceId: { not: null } },
      include: { plan: true },
    });
    for (const item of items) {
      const exists = await this.prisma.materialUse.findFirst({ where: { planItemId: item.id } });
      if (exists || !item.serviceId) continue;
      await this.attachTarget(orgId, {
        patientId: item.plan.patientId,
        serviceId: item.serviceId,
        surfaces: item.surfaces.length,
        planItemId: item.id,
      });
    }
  }

  async writeOff(orgId: string, appointmentId: string) {
    const appointment = await this.appointmentOrThrow(orgId, appointmentId);
    if (appointment.serviceId) await this.attachAppointment(orgId, appointment.id);
    const uses = await this.prisma.materialUse.findMany({ where: { appointmentId, writtenOff: false } });
    for (const row of uses) {
      const qty = Number(row.actualQty);
      if (qty <= 0) {
        await this.prisma.materialUse.update({ where: { id: row.id }, data: { writtenOff: true } });
        continue;
      }
      const result = await consumeStock(this.prisma, {
        organizationId: orgId,
        itemId: row.itemId,
        branchId: appointment.branchId,
        quantity: qty,
        type: 'TREATMENT_USE',
        notes: `Визит ${appointmentId}: ${row.name}`,
      });
      await this.prisma.materialUse.update({
        where: { id: row.id },
        data: {
          writtenOff: true,
          unitCost: qty ? round2(result.cost / qty) : Number(row.unitCost),
          suggestion: result.short > 0 ? `Не хватило ${result.short} ${row.unit}` : row.suggestion,
        },
      });
    }
    await this.bill(orgId, appointment.id, appointment.patientId);
    return this.packVisit(orgId, appointment.id);
  }

  async margin(orgId: string) {
    const start = new Date();
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    const [uses, low] = await Promise.all([
      this.prisma.materialUse.findMany({
        where: { organizationId: orgId, writtenOff: true, createdAt: { gte: start } },
        include: { service: true, appointment: { include: { doctor: true, service: true } } },
      }),
      this.lowStock(orgId),
    ]);
    const byService = new Map<string, { name: string; cost: number; revenue: number; count: number }>();
    const byDoctor = new Map<string, { name: string; cost: number; revenue: number }>();
    const seenVisit = new Set<string>();
    for (const row of uses) {
      const cost = Number(row.actualQty) * Number(row.unitCost);
      const serviceName = row.service?.name ?? row.appointment?.service?.name ?? 'Без услуги';
      const serviceRow = byService.get(serviceName) ?? { name: serviceName, cost: 0, revenue: 0, count: 0 };
      serviceRow.cost += cost;
      const visitKey = row.appointmentId ?? row.id;
      if (row.appointment && !seenVisit.has(visitKey)) {
        seenVisit.add(visitKey);
        const revenue = Number(row.appointment.service?.basePrice ?? 0);
        serviceRow.revenue += revenue;
        serviceRow.count += 1;
        const doctorName = row.appointment.doctor ? `${row.appointment.doctor.lastName} ${row.appointment.doctor.firstName}` : 'Без врача';
        const doctorRow = byDoctor.get(doctorName) ?? { name: doctorName, cost: 0, revenue: 0 };
        doctorRow.revenue += revenue;
        byDoctor.set(doctorName, doctorRow);
      }
      serviceRow.cost += 0;
      byService.set(serviceName, serviceRow);
      if (row.appointment?.doctor) {
        const doctorName = `${row.appointment.doctor.lastName} ${row.appointment.doctor.firstName}`;
        const doctorRow = byDoctor.get(doctorName) ?? { name: doctorName, cost: 0, revenue: 0 };
        doctorRow.cost += cost;
        byDoctor.set(doctorName, doctorRow);
      }
    }
    const services = [...byService.values()].map((row) => ({
      ...row,
      cost: round2(row.cost),
      revenue: round2(row.revenue),
      margin: round2(row.revenue - row.cost),
    }));
    return {
      services,
      doctors: [...byDoctor.values()].map((row) => ({ ...row, cost: round2(row.cost), revenue: round2(row.revenue), margin: round2(row.revenue - row.cost) })),
      lowStock: low,
    };
  }

  async stockOptions(orgId: string) {
    const items = await this.prisma.inventoryItem.findMany({
      where: { organizationId: orgId, isActive: true },
      orderBy: { name: 'asc' },
    });
    return items.map((item) => ({ id: item.id, name: item.name, unit: item.unit }));
  }

  private async attachAppointment(orgId: string, appointmentId: string, surfaces = 1) {
    const appointment = await this.appointmentOrThrow(orgId, appointmentId);
    if (!appointment.serviceId) return;
    const exists = await this.prisma.materialUse.findFirst({ where: { appointmentId } });
    if (exists) return;
    await this.attachTarget(orgId, {
      patientId: appointment.patientId,
      serviceId: appointment.serviceId,
      surfaces,
      appointmentId,
    });
  }

  private async attachTarget(
    orgId: string,
    target: { patientId: string; serviceId: string; surfaces: number; planItemId?: string; appointmentId?: string },
  ) {
    const service = await this.prisma.service.findFirst({
      where: { id: target.serviceId, organizationId: orgId },
      include: { materialNorms: { include: { item: true } } },
    });
    if (!service) return;
    for (const norm of service.materialNorms) {
      const expanded = expandNorm(norm, target.surfaces);
      await this.prisma.materialUse.create({
        data: {
          organizationId: orgId,
          patientId: target.patientId,
          itemId: norm.itemId,
          serviceId: service.id,
          planItemId: target.planItemId,
          appointmentId: target.appointmentId,
          name: norm.item.name,
          unit: norm.item.unit,
          plannedQty: expanded.qty,
          actualQty: expanded.qty,
          unitCost: await this.unitCost(norm.itemId),
          billable: norm.billable,
          sellPrice: Number(norm.sellPrice),
          suggestion: expanded.suggestion,
        },
      });
    }
  }

  private async packVisit(orgId: string, appointmentId: string) {
    const appointment = await this.prisma.appointment.findFirst({
      where: { id: appointmentId, organizationId: orgId },
      include: { service: true, materialUses: { orderBy: { name: 'asc' } } },
    });
    if (!appointment) throw new NotFoundException('Визит не найден');
    const lines = appointment.materialUses.map((row) => ({
      id: row.id,
      itemId: row.itemId,
      name: row.name,
      unit: row.unit,
      plannedQty: Number(row.plannedQty),
      actualQty: Number(row.actualQty),
      unitCost: Number(row.unitCost),
      cost: round2(Number(row.actualQty) * Number(row.unitCost)),
      billable: row.billable,
      sellPrice: Number(row.sellPrice),
      suggestion: row.suggestion,
      writtenOff: row.writtenOff,
    }));
    const materialCost = round2(lines.reduce((sum, row) => sum + row.cost, 0));
    const price = Number(appointment.service?.basePrice ?? 0);
    const low = await this.lowStock(orgId);
    return {
      serviceId: appointment.serviceId,
      service: appointment.service?.name ?? null,
      price,
      materialCost,
      margin: round2(price - materialCost),
      writtenOff: lines.length > 0 && lines.every((row) => row.writtenOff),
      lines,
      lowStock: low.filter((row) => lines.some((line) => line.name === row.name)),
      catalog: await this.stockOptions(orgId),
    };
  }

  private async bill(orgId: string, appointmentId: string, patientId: string) {
    const rows = await this.prisma.materialUse.findMany({
      where: { appointmentId, billable: true, writtenOff: true },
    });
    const priced = rows.filter((row) => Number(row.sellPrice) > 0 && Number(row.actualQty) > 0);
    if (!priced.length) return;
    let invoice = await this.prisma.invoice.findFirst({
      where: { organizationId: orgId, appointmentId, status: { in: ['DRAFT', 'ISSUED', 'PARTIAL'] } },
    });
    if (!invoice) {
      invoice = await this.prisma.invoice.create({
        data: {
          organizationId: orgId,
          patientId,
          appointmentId,
          number: `SD-${Date.now().toString().slice(-8)}`,
          status: 'ISSUED',
          totalAmount: 0,
        },
      });
    }
    let extra = 0;
    for (const row of priced) {
      const title = `${row.name} · расходник`;
      const exists = await this.prisma.invoiceItem.findFirst({ where: { invoiceId: invoice.id, title } });
      if (exists) continue;
      const price = round2(Number(row.sellPrice) * Number(row.actualQty));
      await this.prisma.invoiceItem.create({ data: { invoiceId: invoice.id, title, price } });
      extra += price;
    }
    if (extra > 0) {
      await this.prisma.invoice.update({
        where: { id: invoice.id },
        data: { totalAmount: Number(invoice.totalAmount) + extra, status: invoice.status === 'DRAFT' ? 'ISSUED' : invoice.status },
      });
    }
  }

  private async lowStock(orgId: string) {
    const items = await this.prisma.inventoryItem.findMany({
      where: { organizationId: orgId, isActive: true },
      include: { batches: true },
    });
    return items
      .map((item) => ({
        name: item.name,
        unit: item.unit,
        qty: round3(item.batches.reduce((sum, batch) => sum + Number(batch.quantity), 0)),
        min: Number(item.minStock),
      }))
      .filter((item) => item.min > 0 && item.qty < item.min);
  }

  private async unitCost(itemId: string) {
    const batches = await this.prisma.stockBatch.findMany({ where: { itemId, quantity: { gt: 0 } } });
    const qty = batches.reduce((sum, batch) => sum + Number(batch.quantity), 0);
    if (!qty) return 0;
    const cost = batches.reduce((sum, batch) => sum + Number(batch.quantity) * Number(batch.costPrice ?? 0), 0);
    return round2(cost / qty);
  }

  private shapeService(service: {
    id: string;
    code: string | null;
    name: string;
    basePrice: { toString(): string };
    durationMin: number;
    materialNorms: (Norm & { item: Norm['item'] & { batches: { quantity: { toString(): string }; costPrice: { toString(): string } | null }[] } })[];
  }) {
    const lines = service.materialNorms.map((norm) => {
      const expanded = expandNorm(norm, norm.basis === 'PER_SURFACE' ? 1 : 0);
      const qty = service.materialNorms.length ? expanded.qty : 0;
      const stock = norm.item.batches.reduce((sum, batch) => sum + Number(batch.quantity), 0);
      const costQty = norm.item.batches.reduce((sum, batch) => sum + Number(batch.quantity), 0);
      const costSum = norm.item.batches.reduce((sum, batch) => sum + Number(batch.quantity) * Number(batch.costPrice ?? 0), 0);
      const unitCost = costQty ? costSum / costQty : 0;
      return {
        name: norm.item.name,
        unit: norm.item.unit,
        qty,
        basis: norm.basis,
        unitCost: round2(unitCost),
        cost: round2(qty * unitCost),
        billable: norm.billable,
        low: Number(norm.item.batches.reduce((sum, batch) => sum + Number(batch.quantity), 0)) < 1 ? false : stock < 1,
        stock: round3(stock),
      };
    });
    const materialCost = round2(lines.reduce((sum, line) => sum + line.cost, 0));
    const price = Number(service.basePrice);
    return {
      id: service.id,
      code: service.code,
      name: service.name,
      durationMin: service.durationMin,
      price,
      materialCost,
      margin: round2(price - materialCost),
      lines,
    };
  }

  private shapeLines(service: { materialNorms: Norm[] }, surfaces: number) {
    return service.materialNorms.map((norm) => {
      const expanded = expandNorm(norm, surfaces);
      return { name: norm.item.name, unit: norm.item.unit, qty: expanded.qty, suggestion: expanded.suggestion, billable: norm.billable };
    });
  }

  private async serviceOrThrow(orgId: string, serviceId: string) {
    const service = await this.prisma.service.findFirst({
      where: { id: serviceId, organizationId: orgId },
      include: { materialNorms: { include: { item: true } } },
    });
    if (!service) throw new NotFoundException('Услуга не найдена');
    return service;
  }

  private async appointmentOrThrow(orgId: string, id: string) {
    const appointment = await this.prisma.appointment.findFirst({ where: { id, organizationId: orgId } });
    if (!appointment) throw new NotFoundException('Визит не найден');
    return appointment;
  }

  private async useOrThrow(orgId: string, id: string) {
    const row = await this.prisma.materialUse.findFirst({ where: { id, organizationId: orgId } });
    if (!row) throw new NotFoundException('Строка набора не найдена');
    return row;
  }

  private async locked(appointmentId: string) {
    const row = await this.prisma.materialUse.findFirst({ where: { appointmentId, writtenOff: true } });
    return !!row;
  }
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function round3(value: number) {
  return Math.round(value * 1000) / 1000;
}
