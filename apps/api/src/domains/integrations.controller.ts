import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { OrgId } from '../common/org.decorator';
import { IntegrationsService } from './integrations.service';

@ApiTags('integrations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('integrations')
export class IntegrationsController {
  constructor(private readonly svc: IntegrationsService) {}

  @Get()
  @RequirePermissions('org.manage')
  list(@OrgId() orgId: string) {
    return this.svc.list(orgId);
  }

  @Get('webhooks')
  @RequirePermissions('org.manage')
  webhooks(@OrgId() orgId: string) {
    return this.svc.webhooks(orgId);
  }

  @Get('blockchain-audit')
  @RequirePermissions('medical.read')
  audit(@OrgId() orgId: string) {
    return this.svc.blockchainAudit(orgId);
  }

  @Get('journal')
  @RequirePermissions('org.manage')
  journal(@OrgId() orgId: string) {
    return this.svc.journal(orgId);
  }

  @Post('dispatch')
  @RequirePermissions('org.manage')
  dispatch(@OrgId() orgId: string, @Body() body: { provider: string; action: string }) {
    return this.svc.dispatch(orgId, body);
  }

  @Post('configs')
  @RequirePermissions('org.manage')
  upsert(@OrgId() orgId: string, @Body() body: { provider: string; configJson: object; isActive?: boolean }) {
    return this.svc.upsertConfig(orgId, body);
  }

  @Post('webhooks')
  @RequirePermissions('org.manage')
  createWebhook(@OrgId() orgId: string, @Body() body: { url: string; events: string[]; secret: string }) {
    return this.svc.createWebhook(orgId, body);
  }

  @Post('blockchain/chain')
  @RequirePermissions('medical.write')
  chain(@OrgId() orgId: string, @Body() body: { patientId: string; recordType: string; recordId: string; content: string }) {
    return this.svc.chainMedicalRecord(orgId, body);
  }
}
