import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '@dentasmart/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { CurrentUser } from '../common/current-user.decorator';
import { OrgId } from '../common/org.decorator';
import { ShowcaseService } from './showcase.service';

@ApiTags('showcase')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('showcase')
export class ShowcaseController {
  constructor(private readonly showcase: ShowcaseService) {}

  @Get('patients')
  @RequirePermissions('patient.read')
  patients(@OrgId() orgId: string) {
    return this.showcase.patients(orgId);
  }

  @Get('briefing')
  @RequirePermissions('patient.read')
  briefing(@OrgId() orgId: string, @CurrentUser() user: AuthUser) {
    return this.showcase.briefing(orgId, user.permissions, user.employee?.id);
  }

  @Get('pulse')
  @RequirePermissions('patient.read')
  pulse(@OrgId() orgId: string) {
    return this.showcase.pulse(orgId);
  }

  @Get('kpis')
  @RequirePermissions('patient.read')
  kpis(@OrgId() orgId: string) {
    return this.showcase.kpis(orgId);
  }

  @Get('retention')
  @RequirePermissions('patient.read')
  retention(@OrgId() orgId: string) {
    return this.showcase.retention(orgId);
  }

  @Post('retention/send')
  @RequirePermissions('patient.write')
  send(@OrgId() orgId: string, @Body() body: { ids?: string[] }) {
    return this.showcase.sendRetention(orgId, body.ids ?? []);
  }

  @Get('copilot')
  @RequirePermissions('patient.read')
  copilot(@OrgId() orgId: string, @Query('patientId') patientId = '', @Query('note') note = '') {
    return this.showcase.copilot(orgId, patientId, note);
  }

  @Get('portal/:patientId')
  @RequirePermissions('patient.read')
  portal(@OrgId() orgId: string, @Param('patientId') patientId: string) {
    return this.showcase.portal(orgId, patientId);
  }

  @Post('portal/:patientId/book')
  @RequirePermissions('schedule.write')
  book(
    @OrgId() orgId: string,
    @Param('patientId') patientId: string,
    @Body() body: { startsAt: string; serviceId?: string },
  ) {
    return this.showcase.bookPortal(orgId, patientId, body.startsAt, body.serviceId);
  }

  @Post('portal/:patientId/chat')
  @RequirePermissions('patient.read')
  chat(@OrgId() orgId: string, @Param('patientId') patientId: string, @Body() body: { body?: string }) {
    return this.showcase.chat(orgId, patientId, body.body ?? '');
  }

  @Post('check-in')
  @RequirePermissions('schedule.write')
  checkIn(@OrgId() orgId: string, @Body() body: { code?: string }) {
    return this.showcase.checkIn(orgId, body.code ?? '');
  }

  @Get('onboarding')
  @RequirePermissions('patient.read')
  onboarding(@OrgId() orgId: string) {
    return this.showcase.onboarding(orgId);
  }

  @Post('onboarding')
  @RequirePermissions('patient.write')
  saveOnboarding(@OrgId() orgId: string, @Body() body: { name?: string; phone?: string; email?: string; inn?: string }) {
    return this.showcase.saveOnboarding(orgId, body);
  }

  @Post('import')
  @RequirePermissions('patient.write')
  importRows(
    @OrgId() orgId: string,
    @Body() body: { source?: string; rows?: { firstName?: string; lastName?: string; middleName?: string; phone?: string; email?: string; birthDate?: string }[] },
  ) {
    return this.showcase.importRows(orgId, body.source ?? 'IDENT', body.rows ?? []);
  }
}
