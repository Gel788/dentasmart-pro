import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const LAB_STATUSES = ['WAITING_IMPRESSION', 'RECEIVED', 'IN_PROGRESS', 'READY', 'DELIVERED', 'REJECTED'];

@Injectable()
export class LabService {
  constructor(private readonly prisma: PrismaService) {}

  listOrders(orgId: string) {
    return this.prisma.labOrder.findMany({
      where: { organizationId: orgId },
      include: {
        doctor: { select: { firstName: true, lastName: true } },
        patient: { select: { firstName: true, lastName: true } },
        messages: { take: 3, orderBy: { createdAt: 'desc' } },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  createOrder(
    orgId: string,
    data: {
      title: string;
      patientId?: string;
      doctorId?: string;
      shade?: string;
      dueAt?: string;
      costAmount?: number;
      labName?: string;
      technician?: string;
      fittingAt?: string;
    },
  ) {
    return this.prisma.labOrder.create({
      data: {
        organizationId: orgId,
        title: data.title,
        shade: data.shade || undefined,
        patientId: data.patientId || undefined,
        doctorId: data.doctorId || undefined,
        dueAt: data.dueAt ? new Date(data.dueAt) : undefined,
        costAmount: data.costAmount || undefined,
        labName: data.labName || undefined,
        technician: data.technician || undefined,
        fittingAt: data.fittingAt ? new Date(data.fittingAt) : undefined,
      },
    });
  }

  async updateStatus(orgId: string, id: string, status: string) {
    if (!LAB_STATUSES.includes(status)) throw new BadRequestException('Неизвестный статус заказа');
    const moved = await this.prisma.labOrder.updateMany({ where: { id, organizationId: orgId }, data: { status: status as never } });
    if (!moved.count) throw new NotFoundException('Заказ не найден');
    return this.prisma.labOrder.findUniqueOrThrow({ where: { id } });
  }

  async updateOrder(
    orgId: string,
    id: string,
    data: { title?: string; patientId?: string; doctorId?: string; dueAt?: string; costAmount?: number; labName?: string; technician?: string; fittingAt?: string; shade?: string },
  ) {
    const order = await this.prisma.labOrder.findFirst({ where: { id, organizationId: orgId } });
    if (!order) throw new NotFoundException('Наряд не найден');
    return this.prisma.labOrder.update({
      where: { id },
      data: {
        title: data.title,
        shade: data.shade,
        patientId: data.patientId || undefined,
        doctorId: data.doctorId || undefined,
        dueAt: data.dueAt ? new Date(data.dueAt) : undefined,
        costAmount: data.costAmount,
        labName: data.labName,
        technician: data.technician,
        fittingAt: data.fittingAt ? new Date(data.fittingAt) : undefined,
      },
    });
  }

  addMessage(orderId: string, body: string, authorId?: string) {
    return this.prisma.labMessage.create({ data: { orderId, body, authorId } });
  }

  async attachScan(orgId: string, id: string, fileUrl: string) {
    const order = await this.prisma.labOrder.findFirst({ where: { id, organizationId: orgId } });
    if (!order) throw new NotFoundException('Наряд не найден');
    if (!fileUrl?.trim()) throw new BadRequestException('Файл скана не передан');
    return this.prisma.labOrder.update({ where: { id }, data: { stlFileUrl: fileUrl.trim() } });
  }
}
