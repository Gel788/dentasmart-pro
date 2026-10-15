import { Body, Controller, Get, Headers, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { CurrentUser } from '../common/current-user.decorator';
import { OrgId } from '../common/org.decorator';
import { AuthUser } from '@dentasmart/shared';
import { MarketService } from './market.service';

@ApiTags('market')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('market')
export class MarketController {
  constructor(private readonly market: MarketService) {}

  @Get('leads')
  @RequirePermissions('patient.read')
  leads(@OrgId() orgId: string) {
    return this.market.leads(orgId);
  }

  @Post('leads')
  @RequirePermissions('patient.write')
  saveLead(@OrgId() orgId: string, @Body() body: { name: string; phone: string; source?: string; status?: string; refusalReason?: string; callbackAt?: string }) {
    return this.market.saveLead(orgId, body);
  }

  @Patch('leads/:id')
  @RequirePermissions('patient.write')
  updateLead(@OrgId() orgId: string, @Param('id') id: string, @Body() body: { status?: string; refusalReason?: string; patientId?: string }) {
    return this.market.updateLead(orgId, id, body);
  }

  @Post('calls/missed')
  @RequirePermissions('patient.write')
  missed(@OrgId() orgId: string, @Body() body: { phone: string; name?: string }) {
    return this.market.missedCall(orgId, body);
  }

  @Get('warranty')
  @RequirePermissions('medical.read')
  warranty(@OrgId() orgId: string) {
    return this.market.warranty(orgId);
  }

  @Post('warranty')
  @RequirePermissions('medical.write')
  saveWarranty(@OrgId() orgId: string, @Body() body: { patientId: string; title: string; toothNum?: number; reason: string; doctorName?: string; cost?: number; status?: string }) {
    return this.market.saveWarranty(orgId, body);
  }

  @Get('insurance')
  @RequirePermissions('finance.read')
  insurance(@OrgId() orgId: string) {
    return this.market.insurance(orgId);
  }

  @Post('insurers')
  @RequirePermissions('finance.write')
  insurer(@OrgId() orgId: string, @Body() body: { name: string }) {
    return this.market.saveInsurer(orgId, body.name);
  }

  @Post('policies')
  @RequirePermissions('finance.write')
  policy(@OrgId() orgId: string, @Body() body: { patientId: string; insurerId: string; number: string; letterNumber?: string; limitAmount?: number; validTo?: string }) {
    return this.market.savePolicy(orgId, body);
  }

  @Post('bills')
  @RequirePermissions('finance.write')
  bill(@OrgId() orgId: string, @Body() body: { insurerId: string; patientName: string; amount: number }) {
    return this.market.saveBill(orgId, body);
  }

  @Patch('bills/:id')
  @RequirePermissions('finance.write')
  billStatus(@OrgId() orgId: string, @Param('id') id: string, @Body() body: { status: string }) {
    return this.market.billStatus(orgId, id, body.status);
  }

  @Get('quality')
  @RequirePermissions('medical.read')
  quality(@OrgId() orgId: string) {
    return this.market.quality(orgId);
  }

  @Get('patients/:id')
  @RequirePermissions('patient.read')
  patient(@OrgId() orgId: string, @Param('id') id: string) {
    return this.market.patientDesk(orgId, id);
  }

  @Post('patients/:id/curator')
  @RequirePermissions('patient.write')
  curator(@OrgId() orgId: string, @Param('id') id: string, @Body() body: { curatorId: string | null }) {
    return this.market.setCurator(orgId, id, body.curatorId);
  }

  @Post('patients/:id/ortho')
  @RequirePermissions('medical.write')
  ortho(@OrgId() orgId: string, @Param('id') id: string, @Body() body: { classAngle?: string; notes?: string; monthlyFee?: number; contractSigned?: boolean }) {
    return this.market.saveOrtho(orgId, id, body);
  }

  @Post('patients/:id/message')
  @RequirePermissions('patient.write')
  message(@OrgId() orgId: string, @Param('id') id: string, @Body() body: { channel: string; body: string }) {
    return this.market.message(orgId, id, body.channel, body.body);
  }

  @Post('patients/:id/esign')
  @RequirePermissions('medical.write')
  esign(@OrgId() orgId: string, @Param('id') id: string) {
    return this.market.esign(orgId, id);
  }

  @Post('esign/:id/confirm')
  @RequirePermissions('medical.write')
  confirm(@OrgId() orgId: string, @Param('id') id: string, @Body() body: { code: string }) {
    return this.market.confirmSign(orgId, id, body.code);
  }

  @Post('allocations')
  @RequirePermissions('finance.write')
  allocate(@OrgId() orgId: string, @Body() body: { paymentId: string; invoiceItemId: string; amount: number }) {
    return this.market.allocate(orgId, body);
  }

  @Post('copilot/apply')
  @RequirePermissions('medical.write')
  apply(@OrgId() orgId: string, @CurrentUser() user: AuthUser, @Body() body: { patientId: string }) {
    return this.market.applyCopilot(orgId, body.patientId, user.id);
  }

  @Get('exchange')
  @RequirePermissions('org.manage')
  exchange(@OrgId() orgId: string) {
    return this.market.exchange(orgId);
  }

  @Post('keys')
  @RequirePermissions('org.manage')
  key(@OrgId() orgId: string, @Body() body: { name?: string }) {
    return this.market.createKey(orgId, body.name ?? 'Ключ');
  }

  @Post('aggregators/:source')
  @RequirePermissions('patient.write')
  aggregator(@OrgId() orgId: string, @Param('source') source: string, @Body() body: { name?: string; phone?: string }) {
    return this.market.aggregator(orgId, source, body);
  }

  @Get('export/:type')
  @RequirePermissions('patient.read')
  exportCsv(@OrgId() orgId: string, @Param('type') type: string) {
    return this.market.exportCsv(orgId, type);
  }

  @Get('export-1c')
  @RequirePermissions('finance.read')
  export1c(@OrgId() orgId: string) {
    return this.market.export1c(orgId);
  }
}

@ApiTags('open')
@Controller('open')
export class OpenApiController {
  constructor(private readonly market: MarketService) {}

  @Get('patients')
  patients(@Headers('x-api-key') key: string) {
    return this.market.openPatients(key ?? '');
  }

  @Post('aggregators/:source')
  book(@Headers('x-api-key') key: string, @Param('source') source: string, @Body() body: { name?: string; phone?: string }) {
    return this.market.openBook(key ?? '', source, body);
  }
}
