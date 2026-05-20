import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { OrgId } from '../common/org.decorator';
import { AnalyticsService } from './analytics.service';

@ApiTags('analytics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly svc: AnalyticsService) {}

  @Get('dashboard')
  @RequirePermissions('analytics.read')
  dashboard(@OrgId() orgId: string) {
    return this.svc.dashboard(orgId);
  }

  @Get('ai-insights')
  @RequirePermissions('analytics.read')
  insights(@OrgId() orgId: string) {
    return this.svc.listInsights(orgId);
  }

  @Post('predictions/generate')
  @RequirePermissions('analytics.read')
  generate(@OrgId() orgId: string) {
    return this.svc.generatePredictions(orgId);
  }

  @Get('reports/:type')
  @RequirePermissions('analytics.read')
  report(@OrgId() orgId: string, @Param('type') type: string) {
    return this.svc.reportBuilder(orgId, type);
  }

  @Post('voice-note')
  @RequirePermissions('analytics.read')
  voice(@OrgId() orgId: string, @Body() body: { text: string; patientId?: string }) {
    return this.svc.createVoiceNote(orgId, body);
  }
}
