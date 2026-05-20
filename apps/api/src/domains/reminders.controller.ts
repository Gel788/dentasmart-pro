import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { OrgId } from '../common/org.decorator';
import { RemindersService } from './reminders.service';

@ApiTags('reminders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('reminders')
export class RemindersController {
  constructor(private readonly svc: RemindersService) {}

  @Get()
  @RequirePermissions('schedule.read')
  list(@OrgId() orgId: string, @Query('status') status?: string) {
    return this.svc.list(orgId, status);
  }

  @Post('queue-tomorrow')
  @RequirePermissions('schedule.write')
  queueTomorrow(@OrgId() orgId: string) {
    return this.svc.queueForTomorrow(orgId);
  }

  @Post('send-pending')
  @RequirePermissions('schedule.write')
  sendPending(@OrgId() orgId: string) {
    return this.svc.sendPending(orgId);
  }

  @Get('templates')
  @RequirePermissions('schedule.read')
  templates(@OrgId() orgId: string) {
    return this.svc.listTemplates(orgId);
  }

  @Post('templates')
  @RequirePermissions('schedule.write')
  createTemplate(@OrgId() orgId: string, @Body() body: { name: string; channel: string; body: string }) {
    return this.svc.createTemplate(orgId, body);
  }
}
