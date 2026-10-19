import { Injectable } from '@nestjs/common';
import { routeOf, type RoutePayload, type StageInput } from '@dentasmart/shared';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RouteService {
  constructor(private readonly prisma: PrismaService) {}

  async forPatient(orgId: string, patientId: string): Promise<RoutePayload> {
    const plan = await this.prisma.treatmentPlan.findFirst({
      where: { organizationId: orgId, patientId, status: { in: ['ACCEPTED', 'IN_PROGRESS', 'COMPLETED'] } },
      orderBy: { acceptedAt: 'desc' },
      include: {
        phases: {
          orderBy: { sortOrder: 'asc' },
          include: {
            labOrders: { orderBy: { createdAt: 'desc' }, take: 1, select: { id: true, status: true, dueAt: true } },
            items: {
              where: { status: { not: 'REJECTED' } },
              include: {
                appointment: { select: { id: true, startsAt: true, status: true } },
                reservations: { include: { item: { select: { name: true } } } },
              },
            },
          },
        },
        invoices: { select: { paidAmount: true } },
      },
    });
    if (!plan) return { planId: null, title: null, signedAt: null, route: null };
    // Payments are not tied to stages yet, so they close stages in order.
    let paidLeft = plan.invoices.reduce((sum, invoice) => sum + Number(invoice.paidAmount), 0);
    const stages: StageInput[] = plan.phases
      .filter((phase) => phase.items.length)
      .map((phase) => {
        const price = phase.items.reduce((sum, item) => sum + Number(item.price), 0);
        const paid = Math.min(price, Math.max(0, paidLeft));
        paidLeft -= paid;
        const visit = phase.items.find((item) => item.appointment)?.appointment ?? null;
        const lab = phase.labOrders[0] ?? null;
        return {
          id: phase.id,
          title: phase.title,
          sortOrder: phase.sortOrder,
          healingDays: phase.healingDays,
          teeth: [...new Set(phase.items.map((item) => item.toothNum).filter((num): num is number => typeof num === 'number'))],
          price,
          paid,
          labWork: phase.labWork,
          appointment: visit ? { id: visit.id, startsAt: visit.startsAt.toISOString(), status: visit.status } : null,
          reservations: phase.items.flatMap((item) =>
            item.reservations.map((row) => ({ itemName: row.item.name, quantity: Number(row.quantity), status: row.status, expectedAt: null })),
          ),
          lab: lab ? { id: lab.id, status: lab.status, dueAt: lab.dueAt?.toISOString() ?? null } : null,
        };
      });
    return { planId: plan.id, title: plan.title, signedAt: plan.signedAt?.toISOString() ?? null, route: routeOf(stages) };
  }
}
