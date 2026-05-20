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
