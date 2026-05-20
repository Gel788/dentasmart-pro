import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WarehouseService {
  constructor(private readonly prisma: PrismaService) {}

  listItems(orgId: string) {
    return this.prisma.inventoryItem.findMany({
      where: { organizationId: orgId, isActive: true },
      include: { batches: true },
      orderBy: { name: 'asc' },
    });
  }

  listMovements(orgId: string) {
    return this.prisma.stockMovement.findMany({
      where: { organizationId: orgId },
      include: { item: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  listPurchaseOrders(orgId: string) {
    return this.prisma.purchaseOrder.findMany({
      where: { organizationId: orgId },
      orderBy: { orderedAt: 'desc' },
    });
  }

  lowStock(orgId: string) {
    return this.prisma.inventoryItem.findMany({
      where: { organizationId: orgId, isActive: true },
      include: { batches: true },
    }).then((items) =>
      items.filter((i) => {
        const qty = i.batches.reduce((s, b) => s + Number(b.quantity), 0);
        return qty <= Number(i.minStock);
      }),
    );
  }

  createItem(orgId: string, data: { name: string; sku?: string; category?: string; minStock?: number }) {
    return this.prisma.inventoryItem.create({
      data: {
        organizationId: orgId,
        name: data.name,
        sku: data.sku,
        category: (data.category as never) ?? 'MATERIAL',
        minStock: data.minStock ?? 0,
      },
    });
  }

  addMovement(orgId: string, data: { itemId: string; branchId: string; type: string; quantity: number; notes?: string }) {
    return this.prisma.stockMovement.create({
      data: {
        organizationId: orgId,
        itemId: data.itemId,
        branchId: data.branchId,
        type: data.type as never,
        quantity: data.quantity,
        notes: data.notes,
      },
    });
  }

  getActiveInventory(orgId: string, branchId: string) {
    return this.prisma.inventorySession.findFirst({
      where: { organizationId: orgId, branchId, status: 'IN_PROGRESS' },
      include: { lines: { include: { item: true } } },
    });
  }

  async startInventory(orgId: string, branchId: string) {
    const items = await this.listItems(orgId);
    const session = await this.prisma.inventorySession.create({
      data: { organizationId: orgId, branchId },
    });
    for (const item of items) {
      const qty = item.batches.reduce((s, b) => s + Number(b.quantity), 0);
      await this.prisma.inventoryCountLine.create({
        data: {
          sessionId: session.id,
          itemId: item.id,
          expectedQty: qty,
          actualQty: qty,
          diffQty: 0,
        },
      });
    }
    return this.prisma.inventorySession.findUnique({
      where: { id: session.id },
      include: { lines: { include: { item: true } } },
    });
  }

  updateCountLine(lineId: string, actualQty: number) {
    return this.prisma.inventoryCountLine.findUnique({ where: { id: lineId } }).then(async (line) => {
      if (!line) return null;
      const diff = actualQty - Number(line.expectedQty);
      return this.prisma.inventoryCountLine.update({
        where: { id: lineId },
        data: { actualQty, diffQty: diff },
      });
    });
  }

  async completeInventory(sessionId: string, orgId: string, branchId: string) {
    const session = await this.prisma.inventorySession.findUnique({
      where: { id: sessionId },
      include: { lines: true },
    });
    if (!session) return null;
    for (const line of session.lines) {
      const diff = Number(line.diffQty);
      if (diff !== 0) {
        await this.prisma.stockMovement.create({
          data: {
            organizationId: orgId,
            itemId: line.itemId,
            branchId,
            type: 'INVENTORY',
            quantity: Math.abs(diff),
            notes: diff > 0 ? 'Излишек инвентаризации' : 'Недостача инвентаризации',
          },
        });
      }
    }
    return this.prisma.inventorySession.update({
      where: { id: sessionId },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
  }

  listMaterialNorms(orgId: string) {
    return this.prisma.serviceMaterialNorm.findMany({
      where: { organizationId: orgId },
      include: { service: true, item: true },
    });
  }

  createMaterialNorm(orgId: string, data: { serviceId: string; itemId: string; quantity: number }) {
    return this.prisma.serviceMaterialNorm.create({
      data: { organizationId: orgId, serviceId: data.serviceId, itemId: data.itemId, quantity: data.quantity },
      include: { service: true, item: true },
    });
  }

  deleteMaterialNorm(id: string) {
    return this.prisma.serviceMaterialNorm.delete({ where: { id } });
  }
}
