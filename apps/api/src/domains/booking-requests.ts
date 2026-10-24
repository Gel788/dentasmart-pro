import { BadRequestException, Body, Controller, Get, Injectable, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '@dentasmart/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { CurrentUser } from '../common/current-user.decorator';
import { OrgId } from '../common/org.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { WidgetService } from './widget.service';

const phoneTail = (phone?: string | null) => (phone ?? '').replace(/\D/g, '').slice(-10);

/** Site bookings waiting for the clinic: accept turns one into a visit, decline frees its slot. */
@Injectable()
export class BookingRequestsService {
  constructor(private readonly prisma: PrismaService, private readonly widget: WidgetService) {}

  async list(orgId: string) {
    const since = new Date(Date.now() - 7 * 86400000);
    const rows = await this.prisma.bookingRequest.findMany({
      where: { organizationId: orgId, OR: [{ status: 'PENDING' }, { decidedAt: { gte: since } }] },
      orderBy: [{ status: 'desc' }, { startsAt: 'asc' }],
      take: 100,
    });
    const services = await this.prisma.service.findMany({
      where: { organizationId: orgId, id: { in: rows.map((row) => row.serviceId).filter((id): id is string => !!id) } },
      select: { id: true, name: true },
    });
    const names = new Map(services.map((row) => [row.id, row.name]));
    return rows.map((row) => ({
      id: row.id,
      status: row.status,
      patient: `${row.lastName} ${row.firstName}`,
      phone: row.phone,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      service: row.serviceId ? names.get(row.serviceId) ?? null : null,
      summary: row.summary,
      urgent: row.urgent,
      viaAssistant: !!row.chatId,
      appointmentId: row.appointmentId,
      declineReason: row.declineReason,
      createdAt: row.createdAt,
    }));
  }

  async accept(orgId: string, userId: string, id: string) {
    const request = await this.pending(orgId, id);
    const cabinetId = await this.widget.pickCabinet(orgId, request.branchId, request.startsAt, request.endsAt);
    if (!cabinetId) throw new BadRequestException('На это время уже нет свободного кресла. Предложите пациенту другое время.');
    const tail = phoneTail(request.phone);
    const known = await this.prisma.patient.findMany({ where: { organizationId: orgId, isActive: true, phone: { not: null } }, select: { id: true, phone: true } });
    const patientId = known.find((row) => phoneTail(row.phone) === tail)?.id
      ?? (await this.prisma.patient.create({ data: { organizationId: orgId, firstName: request.firstName, lastName: request.lastName, phone: request.phone }, select: { id: true } })).id;
    const appointment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.appointment.create({
        data: {
          organizationId: orgId,
          branchId: request.branchId,
          cabinetId,
          patientId,
          serviceId: request.serviceId,
          startsAt: request.startsAt,
          endsAt: request.endsAt,
          status: 'SCHEDULED',
          notes: [request.urgent ? 'Срочно.' : '', request.summary ? `С сайта: ${request.summary}` : 'Запись с сайта'].filter(Boolean).join(' '),
        },
        select: { id: true },
      });
      const claimed = await tx.bookingRequest.updateMany({
        where: { id: request.id, status: 'PENDING' },
        data: { status: 'ACCEPTED', appointmentId: created.id, decidedAt: new Date(), decidedById: userId },
      });
      if (claimed.count !== 1) throw new BadRequestException('Заявку уже обработали');
      return created;
    });
    return { id: request.id, status: 'ACCEPTED', appointmentId: appointment.id, patientId };
  }

  async decline(orgId: string, userId: string, id: string, reason?: string) {
    const request = await this.pending(orgId, id);
    await this.prisma.bookingRequest.update({
      where: { id: request.id },
      data: { status: 'DECLINED', declineReason: reason?.trim().slice(0, 300) || null, decidedAt: new Date(), decidedById: userId },
    });
    return { id: request.id, status: 'DECLINED' };
  }

  private async pending(orgId: string, id: string) {
    const request = await this.prisma.bookingRequest.findFirst({ where: { id, organizationId: orgId } });
    if (!request) throw new NotFoundException('Заявка не найдена');
    if (request.status !== 'PENDING') throw new BadRequestException('Заявку уже обработали');
    return request;
  }
}

@ApiTags('booking-requests')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('booking-requests')
export class BookingRequestsController {
  constructor(private readonly requests: BookingRequestsService) {}

  @Get()
  @RequirePermissions('schedule.read')
  list(@OrgId() orgId: string) {
    return this.requests.list(orgId);
  }

  @Post(':id/accept')
  @RequirePermissions('schedule.write')
  accept(@OrgId() orgId: string, @CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.requests.accept(orgId, user.id, id);
  }

  @Post(':id/decline')
  @RequirePermissions('schedule.write')
  decline(@OrgId() orgId: string, @CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: { reason?: string }) {
    return this.requests.decline(orgId, user.id, id, body?.reason);
  }
}
