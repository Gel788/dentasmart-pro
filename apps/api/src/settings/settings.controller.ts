import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { OrgId } from '../common/org.decorator';
import { SettingsService } from './settings.service';

@ApiTags('settings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('settings')
export class SettingsController {
  constructor(private readonly svc: SettingsService) {}

  @Get('organization')
  @RequirePermissions('org.manage')
  org(@OrgId() orgId: string) {
    return this.svc.getOrg(orgId);
  }

  @Get('widget')
  @RequirePermissions('org.manage')
  widget(@OrgId() orgId: string) {
    return this.svc.getWidget(orgId);
  }

  @Put('widget')
  @RequirePermissions('org.manage')
  updateWidget(@OrgId() orgId: string, @Body() body: { primaryColor?: string; logoUrl?: string }) {
    return this.svc.upsertWidget(orgId, body);
  }

  @Get('audit')
  @RequirePermissions('org.manage')
  audit(@OrgId() orgId: string) {
    return this.svc.auditLog(orgId);
  }

  @Get('medical-audit')
  @RequirePermissions('medical.read')
  medicalAudit(@OrgId() orgId: string) {
    return this.svc.medicalAuditChain(orgId);
  }
}
