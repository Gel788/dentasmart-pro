import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { OrgId } from '../common/org.decorator';
import { QueueService } from './queue.service';

@ApiTags('queue')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('queue')
export class QueueController {
  constructor(private readonly svc: QueueService) {}

  @Get('waitlist')
  @RequirePermissions('schedule.read')
  waitlist(@OrgId() orgId: string) {
    return this.svc.waitlist(orgId);
  }

  @Get('reception')
  @RequirePermissions('schedule.read')
  reception(@OrgId() orgId: string, @Query('branchId') branchId?: string) {
    return this.svc.reception(orgId, branchId);
  }

  @Get('reception-desk')
  @RequirePermissions('schedule.read')
  receptionDesk(@OrgId() orgId: string, @Query('branchId') branchId: string) {
    return this.svc.receptionDesk(orgId, branchId);
  }

  @Get('clinic-day')
  @RequirePermissions('schedule.read')
  clinicDay(@OrgId() orgId: string, @Query('branchId') branchId: string) {
    return this.svc.clinicDay(orgId, branchId);
  }

  @Patch('clinic-day/no-show/:id')
  @RequirePermissions('schedule.write')
  saveNoShow(@OrgId() orgId: string, @Param('id') id: string, @Body() body: { reason: string }) {
    return this.svc.saveNoShow(orgId, id, body.reason ?? '');
  }

  @Patch('clinic-day/source/:patientId')
  @RequirePermissions('schedule.write')
  setSource(@OrgId() orgId: string, @Param('patientId') patientId: string, @Body() body: { source: string }) {
    return this.svc.setSource(orgId, patientId, body.source ?? '');
  }

  @Patch('clinic-day/promise/:invoiceId')
  @RequirePermissions('finance.write')
  setPromise(@OrgId() orgId: string, @Param('invoiceId') invoiceId: string, @Body() body: { promiseNote: string }) {
    return this.svc.setPromise(orgId, invoiceId, body.promiseNote ?? '');
  }

  @Post('reception/check-in')
  @RequirePermissions('schedule.write')
  checkIn(@OrgId() orgId: string, @Body() body: { patientId: string; branchId: string; appointmentId?: string }) {
    return this.svc.checkIn(orgId, body);
  }

  @Patch('reception/:id')
  @RequirePermissions('schedule.write')
  updateReception(@Param('id') id: string, @Body() body: { status: string }) {
    return this.svc.updateQueueStatus(id, body.status);
  }

  @Post('waitlist')
  @RequirePermissions('schedule.write')
  addWaitlist(@OrgId() orgId: string, @Body() body: { patientId: string; branchId: string; serviceId?: string }) {
    return this.svc.addWaitlist(orgId, body);
  }
}
