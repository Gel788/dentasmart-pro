import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LabService {
  constructor(private readonly prisma: PrismaService) {}

  listOrders(orgId: string) {
    return this.prisma.labOrder.findMany({
      where: { organizationId: orgId },
      include: { doctor: true, messages: { take: 3, orderBy: { createdAt: 'desc' } } },
      orderBy: { updatedAt: 'desc' },
    });
  }

  createOrder(orgId: string, data: { title: string; patientId?: string; doctorId?: string; shade?: string }) {
    return this.prisma.labOrder.create({ data: { organizationId: orgId, ...data } });
  }

  updateStatus(id: string, status: string) {
    return this.prisma.labOrder.update({ where: { id }, data: { status: status as never } });
  }

  addMessage(orderId: string, body: string, authorId?: string) {
    return this.prisma.labMessage.create({ data: { orderId, body, authorId } });
  }
}
