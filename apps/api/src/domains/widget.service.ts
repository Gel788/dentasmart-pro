import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WidgetService {
  constructor(private readonly prisma: PrismaService) {}

  async getConfig(orgSlug: string) {
    const org = await this.prisma.organization.findUnique({
      where: { slug: orgSlug },
      include: { widgetConfigs: { where: { isActive: true }, take: 1 } },
    });
    if (!org) throw new NotFoundException('Клиника не найдена');
    return {
      organization: { name: org.name, slug: org.slug },
      config: org.widgetConfigs[0] ?? { primaryColor: '#3b9eff' },
    };
  }

  async publicServices(orgSlug: string) {
    const org = await this.prisma.organization.findUnique({ where: { slug: orgSlug } });
    if (!org) throw new NotFoundException();
    return this.prisma.service.findMany({
      where: { organizationId: org.id, isActive: true, parentId: null },
      select: { id: true, name: true, description: true, durationMin: true, basePrice: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async publicSlots(orgSlug: string, branchId: string, from: string, to: string) {
    const org = await this.prisma.organization.findUnique({ where: { slug: orgSlug } });
    if (!org) throw new NotFoundException();
    const appointments = await this.prisma.appointment.findMany({
      where: {
        organizationId: org.id,
        branchId,
        startsAt: { gte: new Date(from), lte: new Date(to) },
        status: { notIn: ['CANCELLED', 'NO_SHOW'] },
      },
      select: { startsAt: true, endsAt: true, doctorId: true },
    });
    return { booked: appointments };
  }

  async book(orgSlug: string, data: {
    branchId: string;
    serviceId?: string;
    startsAt: string;
    endsAt: string;
    firstName: string;
    lastName: string;
    phone: string;
    email?: string;
  }) {
    const org = await this.prisma.organization.findUnique({ where: { slug: orgSlug } });
    if (!org) throw new NotFoundException();

    let patient = await this.prisma.patient.findFirst({
      where: { organizationId: org.id, phone: data.phone },
    });
    if (!patient) {
      patient = await this.prisma.patient.create({
        data: {
          organizationId: org.id,
          firstName: data.firstName,
          lastName: data.lastName,
          phone: data.phone,
          email: data.email,
        },
      });
    }

    return this.prisma.appointment.create({
      data: {
        organizationId: org.id,
        branchId: data.branchId,
        patientId: patient.id,
        serviceId: data.serviceId,
        startsAt: new Date(data.startsAt),
        endsAt: new Date(data.endsAt),
        status: 'SCHEDULED',
      },
    });
  }
}
