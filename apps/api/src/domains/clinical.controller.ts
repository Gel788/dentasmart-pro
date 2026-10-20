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

  @Get('catalog')
  @RequirePermissions('medical.read')
  catalog(@OrgId() orgId: string) {
    return this.svc.priceCatalog(orgId);
  }

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
  async imaging(@OrgId() orgId: string, @Param('patientId') patientId: string) {
    await this.svc.ownPatient(orgId, patientId);
    return this.svc.listImaging(patientId);
  }

  @Get('consents')
  @RequirePermissions('medical.read')
  consents(@OrgId() orgId: string, @Query('patientId') patientId?: string) {
    return this.svc.listConsents(orgId, patientId);
  }

  @Get('patients/:patientId/teeth')
  @RequirePermissions('medical.read')
  async teeth(@OrgId() orgId: string, @Param('patientId') patientId: string) {
    await this.svc.ownPatient(orgId, patientId);
    return this.svc.getToothChart(patientId);
  }

  @Get('patients/:patientId/chart')
  @RequirePermissions('medical.read')
  async chart(@OrgId() orgId: string, @Param('patientId') patientId: string) {
    await this.svc.ownPatient(orgId, patientId);
    return this.svc.chartBundle(patientId);
  }

  @Post('patients/:patientId/teeth')
  @RequirePermissions('medical.write')
  async upsertTooth(
    @OrgId() orgId: string,
    @Param('patientId') patientId: string,
    @Body() body: { toothNum: number; formula: 'ADULT' | 'CHILD'; condition: string; diagnosis?: string; surfaces?: string[]; layer?: string },
  ) {
    await this.svc.ownPatient(orgId, patientId);
    return this.svc.upsertTooth(patientId, body);
  }

  @Post('treatment-plans/:planId/items')
  @RequirePermissions('medical.write')
  addItem(
    @OrgId() orgId: string,
    @Param('planId') planId: string,
    @Body()
    body: {
      title: string;
      toothNum?: number;
      price?: number;
      serviceId?: string;
      surfaces?: string[];
      phase?: number;
      discountPercent?: number;
      durationMin?: number;
    },
  ) {
    return this.svc.addPlanItem(orgId, planId, body);
  }

  @Post('treatment-plans/:planId/diary')
  @RequirePermissions('medical.write')
  async diary(@OrgId() orgId: string, @Param('planId') planId: string, @Body() body: { notes: string; toothNum?: number }) {
    await this.svc.ownPlan(orgId, planId);
    return this.svc.addDiaryEntry(planId, body.notes, body.toothNum);
  }

  @Post('patients/:patientId/imaging')
  @RequirePermissions('medical.write')
  async addImaging(@OrgId() orgId: string, @Param('patientId') patientId: string, @Body() body: { type: string; fileUrl: string; title?: string; toothNum?: number }) {
    await this.svc.ownPatient(orgId, patientId);
    return this.svc.addImaging(patientId, body);
  }

  @Post('consents')
  @RequirePermissions('medical.write')
  consent(@OrgId() orgId: string, @Body() body: { patientId: string; type: string }) {
    return this.svc.signConsent(orgId, body);
  }

  @Get('treatment-plans/:planId')
  @RequirePermissions('medical.read')
  async plan(@OrgId() orgId: string, @Param('planId') planId: string) {
    await this.svc.ownPlan(orgId, planId);
    return this.svc.getPlan(planId);
  }

  @Patch('treatment-plans/:planId/status')
  @RequirePermissions('medical.write')
  async planStatus(@OrgId() orgId: string, @Param('planId') planId: string, @Body() body: { status: string }) {
    await this.svc.ownPlan(orgId, planId);
    return this.svc.updatePlanStatus(planId, body.status);
  }

  @Patch('treatment-plans/items/:itemId')
  @RequirePermissions('medical.write')
  toggleItem(
    @OrgId() orgId: string,
    @Param('itemId') itemId: string,
    @Body()
    body: {
      isCompleted?: boolean;
      status?: string;
      price?: number;
      serviceId?: string;
      discountPercent?: number;
      phase?: number;
      surfaces?: string[];
      toothNum?: number | null;
    },
  ) {
    if (
      body.price != null ||
      body.serviceId ||
      body.discountPercent != null ||
      body.phase != null ||
      body.surfaces ||
      body.toothNum !== undefined
    ) {
      return this.svc.updatePlanItem(orgId, itemId, body);
    }
    if (body.status) return this.svc.setItemStatus(itemId, body.status);
    return this.svc.togglePlanItem(itemId, !!body.isCompleted);
  }

  @Post('treatment-plans/:planId/accept')
  @RequirePermissions('medical.write')
  async accept(@OrgId() orgId: string, @Param('planId') planId: string) {
    await this.svc.ownPlan(orgId, planId);
    return this.svc.acceptPlan(planId);
  }

  @Patch('treatment-plans/:planId/discount')
  @RequirePermissions('medical.write')
  async discount(@OrgId() orgId: string, @Param('planId') planId: string, @Body() body: { discountPercent: number }) {
    await this.svc.ownPlan(orgId, planId);
    return this.svc.setPlanDiscount(planId, body.discountPercent);
  }

  @Post('treatment-plans/:planId/schedule')
  @RequirePermissions('schedule.write')
  schedule(
    @OrgId() orgId: string,
    @Param('planId') planId: string,
    @Body() body: { itemIds: string[]; branchId: string; startsAt: string; doctorId?: string; cabinetId?: string },
  ) {
    return this.svc.schedulePlanItems(orgId, planId, body);
  }

  @Post('treatment-plans/:planId/recalculate')
  @RequirePermissions('medical.write')
  async recalc(@OrgId() orgId: string, @Param('planId') planId: string) {
    await this.svc.ownPlan(orgId, planId);
    return this.svc.recalcPlanTotal(planId);
  }

  @Post('treatment-plans/:planId/reorder')
  @RequirePermissions('medical.write')
  async reorder(@OrgId() orgId: string, @Param('planId') planId: string, @Body() body: { itemIds: string[] }) {
    await this.svc.ownPlan(orgId, planId);
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
    return this.svc.completePlanItemWithMaterials(orgId, itemId, body.branchId, body.isCompleted);
  }

  @Post('treatment-plans/:planId/diary/photo')
  @RequirePermissions('medical.write')
  async diaryPhoto(@OrgId() orgId: string, @Param('planId') planId: string, @Body() body: { notes: string; photoUrl?: string; toothNum?: number }) {
    await this.svc.ownPlan(orgId, planId);
    return this.svc.addDiaryWithPhoto(planId, body.notes, body.photoUrl, body.toothNum);
  }

  @Get('patients/:patientId/photos')
  @RequirePermissions('medical.read')
  async photos(@OrgId() orgId: string, @Param('patientId') patientId: string) {
    await this.svc.ownPatient(orgId, patientId);
    return this.svc.listPhotoPairs(patientId);
  }

  @Get('patients/:patientId/perio')
  @RequirePermissions('medical.read')
  perio(@OrgId() orgId: string, @Param('patientId') patientId: string) {
    return this.svc.listPerio(orgId, patientId);
  }

  @Post('patients/:patientId/perio')
  @RequirePermissions('medical.write')
  createPerio(
    @OrgId() orgId: string,
    @Param('patientId') patientId: string,
    @Body() body: { notes?: string; teeth: { toothNum: number; missing?: boolean; mobility?: number; furcation?: number; sites?: { position: number; pocket: number; recession: number; bleeding: boolean }[] }[] },
  ) {
    return this.svc.createPerio(orgId, patientId, body);
  }

  @Get('oms/tariffs')
  @RequirePermissions('medical.read')
  omsTariffs() {
    return this.svc.omsTariffs();
  }

  @Get('patients/:patientId/oms')
  @RequirePermissions('medical.read')
  oms(@OrgId() orgId: string, @Param('patientId') patientId: string) {
    return this.svc.omsState(orgId, patientId);
  }

  @Post('patients/:patientId/oms/policy')
  @RequirePermissions('medical.write')
  omsPolicy(
    @OrgId() orgId: string,
    @Param('patientId') patientId: string,
    @Body() body: { number: string; smoName: string; region?: string; validFrom?: string; validTo?: string },
  ) {
    return this.svc.saveOmsPolicy(orgId, patientId, body);
  }

  @Post('patients/:patientId/oms/cases')
  @RequirePermissions('medical.write')
  openOms(
    @OrgId() orgId: string,
    @Param('patientId') patientId: string,
    @Body() body: { branchId: string; doctorId?: string },
  ) {
    return this.svc.openOmsCase(orgId, patientId, body.branchId, body.doctorId);
  }

  @Post('oms/cases/:caseId/lines')
  @RequirePermissions('medical.write')
  omsLine(
    @OrgId() orgId: string,
    @Param('caseId') caseId: string,
    @Body() body: { code: string; title: string; toothNum?: number; quantity?: number; tariff?: number },
  ) {
    return this.svc.addOmsLine(orgId, caseId, body);
  }

  @Post('oms/cases/:caseId/close')
  @RequirePermissions('medical.write')
  closeOms(
    @OrgId() orgId: string,
    @Param('caseId') caseId: string,
    @Body() body: { icd10: string; result?: string },
  ) {
    return this.svc.closeOmsCase(orgId, caseId, body);
  }
}
