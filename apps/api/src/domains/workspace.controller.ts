import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '@dentasmart/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { CurrentUser } from '../common/current-user.decorator';
import { OrgId } from '../common/org.decorator';
import { ClinicalService } from './clinical.service';
import { ImportPatientsDto } from './dto/import-patients.dto';
import { PatientImportService } from './patient-import.service';
import { WorkspaceService, type ComposeBody } from './workspace.service';

@ApiTags('workspace')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('workspace')
export class WorkspaceController {
  constructor(
    private readonly workspace: WorkspaceService,
    private readonly patientImport: PatientImportService,
    private readonly clinical: ClinicalService,
  ) {}

  /** An empty draft plan, so a service can be added to a patient who has none yet. */
  @Post('patients/:patientId/plans')
  @RequirePermissions('medical.write')
  newPlan(@OrgId() orgId: string, @CurrentUser() user: AuthUser, @Param('patientId') patientId: string) {
    return this.clinical.createPlan(orgId, { patientId, title: 'План лечения', doctorId: user.employee?.id });
  }

  @Post('plans/:planId/items')
  @RequirePermissions('medical.write')
  addItem(
    @OrgId() orgId: string,
    @Param('planId') planId: string,
    @Body() body: { serviceId: string; phaseId?: string; toothNum?: number | null },
  ) {
    return this.clinical.addPlanItem(orgId, planId, {
      serviceId: body.serviceId,
      phaseId: body.phaseId && body.phaseId !== 'loose' ? body.phaseId : undefined,
      toothNum: body.toothNum ?? undefined,
    });
  }

  /** The line editor sends quantity × unit price less a discount; the plan total follows. */
  @Post('plans/:planId/items/:itemId')
  @RequirePermissions('medical.write')
  editItem(
    @OrgId() orgId: string,
    @Param('itemId') itemId: string,
    @Body() body: { qty?: number; unitPrice?: number; discountPercent?: number; price?: number; toothNum?: number | null },
  ) {
    const qty = Number(body.qty) > 0 ? Number(body.qty) : 1;
    const discount = Math.min(100, Math.max(0, Number(body.discountPercent) || 0));
    const price = body.unitPrice != null && Number.isFinite(Number(body.unitPrice))
      ? Math.round(Number(body.unitPrice) * qty * (1 - discount / 100) * 100) / 100
      : body.price;
    return this.clinical.updatePlanItem(orgId, itemId, {
      ...(price != null ? { price } : { discountPercent: discount }),
      ...(body.toothNum !== undefined ? { toothNum: body.toothNum } : {}),
    });
  }

  /** Whether the patient sees what each price is made of (owner only). */
  @Post('plans/:planId/disclosure')
  @RequirePermissions('org.manage')
  disclosure(@OrgId() orgId: string, @Param('planId') planId: string, @Body() body: { showBreakdown?: boolean }) {
    return this.workspace.setDisclosure(orgId, planId, body.showBreakdown !== false);
  }

  @Post('plans/:planId/apply-template')
  @RequirePermissions('medical.write')
  applyTemplate(@OrgId() orgId: string, @Param('planId') planId: string, @Body() body: { templateId: string; toothNum?: number | null }) {
    return this.clinical.applyTemplate(orgId, planId, body.templateId, body.toothNum ?? null);
  }

  @Post('plans/:planId/template')
  @RequirePermissions('medical.write')
  saveTemplate(@OrgId() orgId: string, @Param('planId') planId: string, @Body() body: { name: string }) {
    return this.clinical.saveAsTemplate(orgId, planId, body.name);
  }

  @Post('plans/:planId/installment')
  @RequirePermissions('medical.write')
  installment(@OrgId() orgId: string, @Param('planId') planId: string, @Body() body: { months?: number }) {
    return this.workspace.setInstallment(orgId, planId, Number(body.months) || 0);
  }

  @Post('import')
  @RequirePermissions('patient.write')
  importPatients(@OrgId() orgId: string, @Body() body: ImportPatientsDto) {
    return this.patientImport.run(orgId, body);
  }

  @Get('recall')
  @RequirePermissions('patient.read')
  recall(@OrgId() orgId: string) {
    return this.workspace.recall(orgId);
  }

  @Get('today')
  @RequirePermissions('patient.read')
  today(@OrgId() orgId: string, @CurrentUser() user: AuthUser) {
    return this.workspace.today(orgId, user.permissions, user.employee?.id);
  }

  @Get('home')
  @RequirePermissions('patient.read')
  home(@OrgId() orgId: string, @CurrentUser() user: AuthUser) {
    return this.workspace.home(orgId, user.permissions, user.employee?.id);
  }

  @Get('search')
  @RequirePermissions('patient.read')
  search(@OrgId() orgId: string, @Query('q') q = '') {
    return this.workspace.search(orgId, q);
  }

  @Get('catalog')
  @RequirePermissions('patient.read')
  catalog(@OrgId() orgId: string) {
    return this.workspace.catalog(orgId);
  }

  @Get('schedule/range')
  @RequirePermissions('schedule.read')
  scheduleRange(@OrgId() orgId: string, @Query('from') from: string, @Query('to') to: string) {
    return this.workspace.scheduleRange(orgId, from, to);
  }

  @Get('schedule')
  @RequirePermissions('schedule.read')
  schedule(@OrgId() orgId: string, @Query('date') date?: string) {
    return this.workspace.schedule(orgId, date);
  }

  @Post('appointments')
  @RequirePermissions('schedule.write')
  book(
    @OrgId() orgId: string,
    @Body() body: { patientId: string; startsAt: string; durationMin?: number; doctorId?: string; cabinetId?: string; serviceId?: string },
  ) {
    return this.workspace.book(orgId, body);
  }

  @Get('plans/abandoned')
  @RequirePermissions('medical.read')
  abandoned(@OrgId() orgId: string) {
    return this.workspace.abandoned(orgId);
  }

  @Get('families/:familyKey')
  @RequirePermissions('medical.read')
  family(@OrgId() orgId: string, @Param('familyKey') familyKey: string) {
    return this.workspace.family(orgId, familyKey);
  }

  @Post('plans/compose')
  @RequirePermissions('medical.write')
  compose(@OrgId() orgId: string, @CurrentUser() user: AuthUser, @Body() body: ComposeBody) {
    return this.workspace.compose(orgId, body.patientId, user.employee?.id, body);
  }

  @Post('plans/from-chart')
  @RequirePermissions('medical.write')
  fromChart(@OrgId() orgId: string, @CurrentUser() user: AuthUser, @Body() body: { patientId: string }) {
    return this.workspace.proposeFromChart(orgId, body.patientId, user.employee?.id);
  }

  @Get('plans/:planId/sheet')
  @RequirePermissions('medical.read')
  sheet(@OrgId() orgId: string, @Param('planId') planId: string) {
    return this.workspace.planSheet(orgId, planId);
  }

  @Post('plans/:planId/save')
  @RequirePermissions('medical.write')
  saveDraft(
    @OrgId() orgId: string,
    @CurrentUser() user: AuthUser,
    @Param('planId') planId: string,
    @Body() body: { discountPercent?: number },
  ) {
    return this.workspace.saveDraft(orgId, planId, body, user.id);
  }

  @Get('plans/:planId/versions')
  @RequirePermissions('medical.read')
  versions(@OrgId() orgId: string, @Param('planId') planId: string) {
    return this.workspace.versions(orgId, planId);
  }

  @Post('plans/:planId/versions/:versionId/restore')
  @RequirePermissions('medical.write')
  restore(
    @OrgId() orgId: string,
    @CurrentUser() user: AuthUser,
    @Param('planId') planId: string,
    @Param('versionId') versionId: string,
  ) {
    return this.workspace.restoreVersion(orgId, planId, versionId, user.id);
  }

  @Post('plans/:planId/accept-partial')
  @RequirePermissions('medical.write')
  acceptPartial(
    @OrgId() orgId: string,
    @CurrentUser() user: AuthUser,
    @Param('planId') planId: string,
    @Body() body: { signedName: string; signatureSvg: string; phaseIds: string[] },
  ) {
    return this.workspace.acceptPartial(orgId, planId, body, user.employee?.id);
  }

  @Post('plans/:planId/phases/:phaseId/book')
  @RequirePermissions('schedule.write')
  bookPhase(
    @OrgId() orgId: string,
    @CurrentUser() user: AuthUser,
    @Param('planId') planId: string,
    @Param('phaseId') phaseId: string,
  ) {
    return this.workspace.bookPhase(orgId, planId, phaseId, user.employee?.id);
  }

  @Post('plans/:planId/accept')
  @RequirePermissions('medical.write')
  accept(
    @OrgId() orgId: string,
    @CurrentUser() user: AuthUser,
    @Param('planId') planId: string,
    @Body() body: { signedName: string; signatureSvg: string },
  ) {
    return this.workspace.accept(orgId, planId, body, user.employee?.id);
  }

  @Post('plans/:planId/abandon')
  @RequirePermissions('medical.write')
  abandon(@OrgId() orgId: string, @Param('planId') planId: string) {
    return this.workspace.abandon(orgId, planId);
  }

  @Get('patients/:patientId/brief')
  @RequirePermissions('patient.read')
  brief(@OrgId() orgId: string, @Param('patientId') patientId: string) {
    return this.workspace.brief(orgId, patientId);
  }

  @Get('patients/:patientId/visits')
  @RequirePermissions('patient.read')
  visits(@OrgId() orgId: string, @Param('patientId') patientId: string) {
    return this.workspace.visitsOf(orgId, patientId);
  }

  @Get('patients/:patientId/card')
  @RequirePermissions('patient.read')
  card(@OrgId() orgId: string, @Param('patientId') patientId: string) {
    return this.workspace.card(orgId, patientId);
  }

  @Post('patients/:patientId/chart')
  @RequirePermissions('medical.write')
  chart(
    @OrgId() orgId: string,
    @Param('patientId') patientId: string,
    @Body() body: { toothNum: number; formula?: 'ADULT' | 'CHILD'; surface: string; condition: string; diagnosis?: string },
  ) {
    return this.workspace.paint(orgId, patientId, body);
  }

  @Post('patients/:patientId/perio')
  @RequirePermissions('medical.write')
  perio(
    @OrgId() orgId: string,
    @Param('patientId') patientId: string,
    @Body()
    body: {
      notes?: string;
      teeth: { toothNum: number; mobility?: number; furcation?: number; missing?: boolean; sites: { position: number; pocket?: number; recession?: number; bleeding?: boolean }[] }[];
    },
  ) {
    return this.workspace.savePerio(orgId, patientId, body);
  }
}
