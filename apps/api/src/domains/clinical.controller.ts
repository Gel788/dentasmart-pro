import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { OrgId } from '../common/org.decorator';
import { ClinicalService } from './clinical.service';

@ApiTags('clinical')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('clinical')
export class ClinicalController {
  constructor(private readonly svc: ClinicalService) {}

  @Get('treatment-plans')
  @RequirePermissions('medical.read')
  plans(@OrgId() orgId: string, @Query('patientId') patientId?: string) {
    return this.svc.listPlans(orgId, patientId);
  }

  @Post('treatment-plans')
  @RequirePermissions('medical.write')
  createPlan(@OrgId() orgId: string, @Body() body: { patientId: string; title: string; doctorId?: string }) {
    return this.svc.createPlan(orgId, body);
  }

  @Post('treatment-plans/from-appointment/:appointmentId')
  @RequirePermissions('medical.write')
  planFromAppointment(@OrgId() orgId: string, @Param('appointmentId') appointmentId: string) {
    return this.svc.createPlanFromAppointment(orgId, appointmentId);
  }

  @Get('patients/:patientId/imaging')
  @RequirePermissions('medical.read')
  imaging(@Param('patientId') patientId: string) {
    return this.svc.listImaging(patientId);
  }

  @Get('consents')
  @RequirePermissions('medical.read')
  consents(@OrgId() orgId: string, @Query('patientId') patientId?: string) {
    return this.svc.listConsents(orgId, patientId);
  }

  @Get('patients/:patientId/teeth')
  @RequirePermissions('medical.read')
  teeth(@Param('patientId') patientId: string) {
    return this.svc.getToothChart(patientId);
  }

  @Post('patients/:patientId/teeth')
  @RequirePermissions('medical.write')
  upsertTooth(@Param('patientId') patientId: string, @Body() body: { toothNum: number; formula: 'ADULT' | 'CHILD'; condition: string; diagnosis?: string }) {
    return this.svc.upsertTooth(patientId, body);
  }

  @Post('treatment-plans/:planId/items')
  @RequirePermissions('medical.write')
  addItem(@Param('planId') planId: string, @Body() body: { title: string; toothNum?: number; price?: number; serviceId?: string }) {
    return this.svc.addPlanItem(planId, body);
  }

  @Post('treatment-plans/:planId/diary')
  @RequirePermissions('medical.write')
  diary(@Param('planId') planId: string, @Body() body: { notes: string; toothNum?: number }) {
    return this.svc.addDiaryEntry(planId, body.notes, body.toothNum);
  }

  @Post('patients/:patientId/imaging')
  @RequirePermissions('medical.write')
  addImaging(@Param('patientId') patientId: string, @Body() body: { type: string; fileUrl: string; title?: string; toothNum?: number }) {
    return this.svc.addImaging(patientId, body);
  }

  @Post('consents')
  @RequirePermissions('medical.write')
  consent(@OrgId() orgId: string, @Body() body: { patientId: string; type: string }) {
    return this.svc.signConsent(orgId, body);
  }

  @Get('treatment-plans/:planId')
  @RequirePermissions('medical.read')
  plan(@Param('planId') planId: string) {
    return this.svc.getPlan(planId);
  }

  @Patch('treatment-plans/:planId/status')
  @RequirePermissions('medical.write')
  planStatus(@Param('planId') planId: string, @Body() body: { status: string }) {
    return this.svc.updatePlanStatus(planId, body.status);
  }

  @Patch('treatment-plans/items/:itemId')
  @RequirePermissions('medical.write')
  toggleItem(@Param('itemId') itemId: string, @Body() body: { isCompleted: boolean }) {
    return this.svc.togglePlanItem(itemId, body.isCompleted);
  }

  @Post('treatment-plans/:planId/recalculate')
  @RequirePermissions('medical.write')
  recalc(@Param('planId') planId: string) {
    return this.svc.recalcPlanTotal(planId);
  }

  @Post('treatment-plans/:planId/reorder')
  @RequirePermissions('medical.write')
  reorder(@Param('planId') planId: string, @Body() body: { itemIds: string[] }) {
    return this.svc.reorderPlanItems(planId, body.itemIds);
  }

  @Post('treatment-plans/:planId/alternative')
  @RequirePermissions('medical.write')
  alternative(@OrgId() orgId: string, @Param('planId') planId: string, @Body() body: { title: string }) {
    return this.svc.createAlternativePlan(orgId, planId, body.title);
  }

  @Patch('treatment-plans/items/:itemId/complete')
  @RequirePermissions('medical.write')
  completeItem(
    @OrgId() orgId: string,
    @Param('itemId') itemId: string,
    @Body() body: { isCompleted: boolean; branchId?: string },
  ) {
    return this.svc.completePlanItemWithMaterials(orgId, itemId, body.branchId || 'seed-branch-main', body.isCompleted);
  }

  @Post('treatment-plans/:planId/diary/photo')
  @RequirePermissions('medical.write')
  diaryPhoto(@Param('planId') planId: string, @Body() body: { notes: string; photoUrl?: string; toothNum?: number }) {
    return this.svc.addDiaryWithPhoto(planId, body.notes, body.photoUrl, body.toothNum);
  }

  @Get('patients/:patientId/photos')
  @RequirePermissions('medical.read')
  photos(@Param('patientId') patientId: string) {
    return this.svc.listPhotoPairs(patientId);
  }
}
