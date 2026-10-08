import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { OrgId } from '../common/org.decorator';
import { MarketingService } from './marketing.service';

@ApiTags('marketing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('marketing')
export class MarketingController {
  constructor(private readonly svc: MarketingService) {}

  @Get('campaigns')
  @RequirePermissions('marketing.read')
  campaigns(@OrgId() orgId: string) {
    return this.svc.listCampaigns(orgId);
  }

  @Get('automation-chains')
  @RequirePermissions('marketing.read')
  chains(@OrgId() orgId: string) {
    return this.svc.listChains(orgId);
  }

  @Get('segments')
  @RequirePermissions('marketing.read')
  segments(@OrgId() orgId: string) {
    return this.svc.listSegments(orgId);
  }

  @Get('loyalty')
  @RequirePermissions('marketing.read')
  loyalty(@OrgId() orgId: string) {
    return this.svc.listLoyalty(orgId);
  }

  @Post('campaigns')
  @RequirePermissions('marketing.write')
  createCampaign(@OrgId() orgId: string, @Body() body: { name: string; channel: string }) {
    return this.svc.createCampaign(orgId, body);
  }

  @Post('automation-chains')
  @RequirePermissions('marketing.write')
  createChain(@OrgId() orgId: string, @Body() body: { name: string; trigger: string; stepsJson: object }) {
    return this.svc.createChain(orgId, body);
  }

  @Post('segments')
  @RequirePermissions('marketing.write')
  createSegment(@OrgId() orgId: string, @Body() body: { name: string; rulesJson: object; isDynamic?: boolean }) {
    return this.svc.createSegment(orgId, body);
  }

  @Post('segments/:id/refresh')
  @RequirePermissions('marketing.write')
  refreshSegment(@OrgId() orgId: string, @Param('id') id: string) {
    return this.svc.refreshSegment(orgId, id);
  }

  @Post('automation-chains/ensure')
  @RequirePermissions('marketing.write')
  ensure(@OrgId() orgId: string) {
    return this.svc.ensureClinicTriggers(orgId);
  }

  @Post('automation-chains/:id/run')
  @RequirePermissions('marketing.write')
  runChain(@OrgId() orgId: string, @Param('id') id: string) {
    return this.svc.runChain(orgId, id);
  }
}
