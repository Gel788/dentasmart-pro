import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { OrgId } from '../common/org.decorator';
import { KitsService } from './kits.service';

@ApiTags('kits')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('kits')
export class KitsController {
  constructor(private readonly kits: KitsService) {}

  @Get()
  @RequirePermissions('patient.read')
  list(@OrgId() orgId: string) {
    return this.kits.list(orgId);
  }

  @Get('margin')
  @RequirePermissions('analytics.read')
  margin(@OrgId() orgId: string) {
    return this.kits.margin(orgId);
  }

  @Get('options')
  @RequirePermissions('medical.read')
  options(@OrgId() orgId: string) {
    return this.kits.stockOptions(orgId);
  }

  @Get('patients/:patientId')
  @RequirePermissions('patient.read')
  patient(@OrgId() orgId: string, @Param('patientId') patientId: string) {
    return this.kits.patientRollup(orgId, patientId);
  }

  @Get('visits/:id')
  @RequirePermissions('medical.read')
  visit(@OrgId() orgId: string, @Param('id') id: string) {
    return this.kits.visitKit(orgId, id);
  }

  @Post('visits/:id/service')
  @RequirePermissions('medical.write')
  apply(
    @OrgId() orgId: string,
    @Param('id') id: string,
    @Body() body: { serviceId: string; surfaces?: number },
  ) {
    return this.kits.applyService(orgId, id, body.serviceId, body.surfaces ?? 1);
  }

  @Post('visits/:id/surfaces')
  @RequirePermissions('medical.write')
  surfaces(@OrgId() orgId: string, @Param('id') id: string, @Body() body: { surfaces: number }) {
    return this.kits.retune(orgId, id, body.surfaces ?? 1);
  }

  @Post('visits/:id/write-off')
  @RequirePermissions('medical.write')
  writeOff(@OrgId() orgId: string, @Param('id') id: string) {
    return this.kits.writeOff(orgId, id);
  }

  @Patch('uses/:id')
  @RequirePermissions('medical.write')
  qty(@OrgId() orgId: string, @Param('id') id: string, @Body() body: { actualQty: number }) {
    return this.kits.setQty(orgId, id, Number(body.actualQty));
  }

  @Post('uses')
  @RequirePermissions('medical.write')
  add(
    @OrgId() orgId: string,
    @Body() body: { appointmentId?: string; planItemId?: string; itemId: string; qty: number },
  ) {
    return this.kits.addLine(orgId, body);
  }

  @Post('uses/:id/remove')
  @RequirePermissions('medical.write')
  remove(@OrgId() orgId: string, @Param('id') id: string) {
    return this.kits.removeLine(orgId, id);
  }

  @Get('preview')
  @RequirePermissions('medical.read')
  preview(@OrgId() orgId: string, @Query('serviceId') serviceId: string, @Query('surfaces') surfaces = '1') {
    return this.kits.preview(orgId, serviceId, Number(surfaces) || 1);
  }
}
