import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { OrgId } from '../common/org.decorator';
import { CommunicationsService } from './communications.service';

@ApiTags('communications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('communications')
export class CommunicationsController {
  constructor(private readonly svc: CommunicationsService) {}

  @Get('threads')
  @RequirePermissions('communications.read')
  threads(@OrgId() orgId: string) {
    return this.svc.listThreads(orgId);
  }

  @Get('calls')
  @RequirePermissions('communications.read')
  calls(@OrgId() orgId: string) {
    return this.svc.listCalls(orgId);
  }

  @Post('threads')
  @RequirePermissions('communications.write')
  createThread(@OrgId() orgId: string, @Body() body: { patientId: string; channel: string; body: string }) {
    return this.svc.createThread(orgId, body);
  }

  @Post('threads/:id/messages')
  @RequirePermissions('communications.write')
  sendMessage(@Param('id') id: string, @Body() body: { text: string }) {
    return this.svc.addMessage(id, body.text);
  }

  @Post('calls')
  @RequirePermissions('communications.write')
  logCall(@OrgId() orgId: string, @Body() body: { phone: string; patientId?: string; durationSec?: number; transcript?: string }) {
    return this.svc.logCall(orgId, body);
  }
}
