import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

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
    data: { title: string; patientId?: string; doctorId?: string; shade?: string; dueAt?: string; costAmount?: number },
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
      },
    });
  }

  updateStatus(id: string, status: string) {
    return this.prisma.labOrder.update({ where: { id }, data: { status: status as never } });
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
