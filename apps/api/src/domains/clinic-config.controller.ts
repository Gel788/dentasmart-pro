import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '@dentasmart/shared';
import { Prisma } from '@dentasmart/database';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { CurrentUser } from '../common/current-user.decorator';
import { OrgId } from '../common/org.decorator';
import { ClinicConfigService } from './clinic-config.service';

@ApiTags('config')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('config')
export class ClinicConfigController {
  constructor(private readonly config: ClinicConfigService) {}

  @Get('policy')
  @RequirePermissions('patient.read')
  policy(@CurrentUser() user: AuthUser) {
    return this.config.policy(user.id);
  }

  @Get('visit-templates')
  @RequirePermissions('medical.read')
  visitTemplates(@OrgId() orgId: string) {
    return this.config.visitTemplates(orgId);
  }

  @Get()
  @RequirePermissions('org.manage')
  bundle(@OrgId() orgId: string) {
    return this.config.bundle(orgId);
  }

  @Post('brand')
  @RequirePermissions('org.manage')
  brand(@OrgId() orgId: string, @CurrentUser() user: AuthUser, @Body() body: Record<string, string>) {
    return this.config.saveBrand(orgId, user.id, body);
  }

  @Post('services')
  @RequirePermissions('org.manage')
  service(@OrgId() orgId: string, @CurrentUser() user: AuthUser, @Body() body: Parameters<ClinicConfigService['saveService']>[2]) {
    return this.config.saveService(orgId, user.id, body, body && 'id' in body ? (body as { id?: string }).id : undefined);
  }

  @Post('services/:id/archive')
  @RequirePermissions('org.manage')
  archive(@OrgId() orgId: string, @CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: { active?: boolean }) {
    return this.config.archiveService(orgId, user.id, id, Boolean(body.active));
  }

  @Post('services/bulk')
  @RequirePermissions('org.manage')
  bulk(@OrgId() orgId: string, @CurrentUser() user: AuthUser, @Body() body: { percent: number; ids?: string[] }) {
    return this.config.bulkPrice(orgId, user.id, body.percent, body.ids);
  }

  @Get('services/export')
  @RequirePermissions('org.manage')
  export(@OrgId() orgId: string) {
    return this.config.exportServices(orgId);
  }

  @Post('services/import')
  @RequirePermissions('org.manage')
  import(@OrgId() orgId: string, @CurrentUser() user: AuthUser, @Body() body: { rows: Parameters<ClinicConfigService['importServices']>[2] }) {
    return this.config.importServices(orgId, user.id, body.rows ?? []);
  }

  @Post('stock')
  @RequirePermissions('org.manage')
  stock(@OrgId() orgId: string, @CurrentUser() user: AuthUser, @Body() body: Parameters<ClinicConfigService['saveStock']>[2]) {
    return this.config.saveStock(orgId, user.id, body);
  }

  @Post('stock/:id/receive')
  @RequirePermissions('org.manage')
  receive(@OrgId() orgId: string, @CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: { quantity: number; cost?: number }) {
    return this.config.receive(orgId, user.id, id, body.quantity, body.cost ?? 0);
  }

  @Post('plan-templates')
  @RequirePermissions('org.manage')
  planTemplate(@OrgId() orgId: string, @CurrentUser() user: AuthUser, @Body() body: { id?: string; name: string; note?: string; phasesJson: Prisma.InputJsonValue; isArchived?: boolean }) {
    return this.config.savePlanTemplate(orgId, user.id, body);
  }

  @Post('visit-templates')
  @RequirePermissions('org.manage')
  visitTemplate(@OrgId() orgId: string, @CurrentUser() user: AuthUser, @Body() body: Parameters<ClinicConfigService['saveVisitTemplate']>[2]) {
    return this.config.saveVisitTemplate(orgId, user.id, body);
  }

  @Post('documents')
  @RequirePermissions('org.manage')
  document(@OrgId() orgId: string, @CurrentUser() user: AuthUser, @Body() body: Parameters<ClinicConfigService['saveDocument']>[2]) {
    return this.config.saveDocument(orgId, user.id, body);
  }

  @Post('employees')
  @RequirePermissions('org.manage')
  employee(@OrgId() orgId: string, @CurrentUser() user: AuthUser, @Body() body: Parameters<ClinicConfigService['saveEmployee']>[2]) {
    return this.config.saveEmployee(orgId, user.id, body);
  }

  @Post('cabinets')
  @RequirePermissions('org.manage')
  cabinet(@OrgId() orgId: string, @CurrentUser() user: AuthUser, @Body() body: { id?: string; name: string; isActive?: boolean }) {
    return this.config.saveCabinet(orgId, user.id, body);
  }

  @Post('roles')
  @RequirePermissions('org.manage')
  role(@OrgId() orgId: string, @CurrentUser() user: AuthUser, @Body() body: Parameters<ClinicConfigService['saveRole']>[2] & { id?: string }) {
    return this.config.saveRole(orgId, user.id, body, body.id);
  }

  @Post('promos')
  @RequirePermissions('org.manage')
  promo(@OrgId() orgId: string, @CurrentUser() user: AuthUser, @Body() body: Parameters<ClinicConfigService['savePromo']>[2]) {
    return this.config.savePromo(orgId, user.id, body);
  }

  @Post('rules')
  @RequirePermissions('org.manage')
  rule(@OrgId() orgId: string, @CurrentUser() user: AuthUser, @Body() body: Parameters<ClinicConfigService['saveRule']>[2]) {
    return this.config.saveRule(orgId, user.id, body);
  }
}
