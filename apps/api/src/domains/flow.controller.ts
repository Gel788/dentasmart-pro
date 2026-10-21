import { BadRequestException, Body, Controller, Get, Param, Post, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '@dentasmart/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { CurrentUser } from '../common/current-user.decorator';
import { IdempotencyKey } from '../common/idempotency.decorator';
import { OrgId } from '../common/org.decorator';
import { FlowService } from './flow.service';
import { DictationService } from './dictation.service';

const AUDIO = /^(audio|video)\/(webm|ogg|mp4|mpeg|mp3|wav|x-wav|x-m4a|m4a|aac|flac)/;

@ApiTags('flow')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('flow')
export class FlowController {
  constructor(private readonly flow: FlowService, private readonly dictation: DictationService) {}

  @Get('dictation')
  @RequirePermissions('medical.write')
  dictationStatus() {
    return { enabled: this.dictation.enabled };
  }

  /** A dictated (audio) or typed account of the visit back as a draft protocol; nothing is saved. */
  @Post('visits/:id/dictation')
  @RequirePermissions('medical.write')
  @UseInterceptors(FileInterceptor('audio', {
    limits: { fileSize: 12 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => (AUDIO.test(file.mimetype) ? cb(null, true) : cb(new BadRequestException('Этот формат записи не принимается'), false)),
  }))
  dictate(@OrgId() orgId: string, @CurrentUser() user: AuthUser, @Param('id') id: string, @UploadedFile() audio: Express.Multer.File | undefined, @Body() body: { text?: string }) {
    return this.dictation.draft(orgId, id, user.id, { audio: audio ? { buffer: audio.buffer, mimetype: audio.mimetype } : undefined, text: typeof body?.text === 'string' ? body.text : undefined });
  }

  @Get('retention')
  @RequirePermissions('analytics.read')
  retention(@OrgId() orgId: string) {
    return this.flow.retention(orgId);
  }

  @Get('caller')
  @RequirePermissions('patient.read')
  caller(@OrgId() orgId: string, @Query('phone') phone = '') {
    return this.flow.caller(orgId, phone);
  }

  @Get('visits/:id')
  @RequirePermissions('patient.read')
  visit(@OrgId() orgId: string, @Param('id') id: string) {
    return this.flow.visit(orgId, id);
  }

  @Post('visits/:id/confirm')
  @RequirePermissions('schedule.write')
  confirm(@OrgId() orgId: string, @Param('id') id: string) {
    return this.flow.confirm(orgId, id);
  }

  @Post('visits/:id/check-in')
  @RequirePermissions('schedule.write')
  checkIn(@OrgId() orgId: string, @Param('id') id: string) {
    return this.flow.checkIn(orgId, id);
  }

  @Post('visits/:id/start')
  @RequirePermissions('medical.write')
  start(@OrgId() orgId: string, @Param('id') id: string) {
    return this.flow.start(orgId, id);
  }

  @Post('visits/:id/no-show')
  @RequirePermissions('schedule.write')
  noShow(@OrgId() orgId: string, @Param('id') id: string, @Body() body: { reason: string }) {
    return this.flow.noShow(orgId, id, body.reason);
  }

  @Post('visits/:id/remind')
  @RequirePermissions('schedule.write')
  remind(@OrgId() orgId: string, @Param('id') id: string) {
    return this.flow.remind(orgId, id);
  }

  @Post('visits/:id/note')
  @RequirePermissions('medical.write')
  note(
    @OrgId() orgId: string,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { complaints?: string; anamnesis?: string; objective?: string; diagnosis?: string; treatment?: string; recommendations?: string; reason?: string },
  ) {
    return this.flow.saveNote(orgId, id, user.id, body);
  }

  @Post('visits/:id/items')
  @RequirePermissions('medical.write')
  addItem(
    @OrgId() orgId: string,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { serviceId: string; toothNum?: number | null },
  ) {
    return this.flow.addVisitItem(orgId, id, body, user.employee?.id);
  }

  @Post('visits/:id/complete')
  @RequirePermissions('medical.write')
  complete(@OrgId() orgId: string, @Param('id') id: string, @Body() body: { followUpDate?: string; followUpReason?: string; doneItemIds?: string[] }) {
    return this.flow.complete(orgId, id, body);
  }

  @Post('visits/:id/prescriptions')
  @RequirePermissions('medical.write')
  prescribe(
    @OrgId() orgId: string,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { drug: string; dose: string; sig: string; days?: number },
  ) {
    return this.flow.prescribe(orgId, id, body, user.employee?.id);
  }

  @Post('visits/:id/pay')
  @RequirePermissions('finance.write')
  pay(
    @OrgId() orgId: string,
    @CurrentUser() user: AuthUser,
    @IdempotencyKey() idempotencyKey: string | undefined,
    @Param('id') id: string,
    @Body() body: { amount: number; method: string },
  ) {
    return this.flow.pay(orgId, id, body, { userId: user.id, idempotencyKey });
  }

  @Get('patients/:patientId/imaging')
  @RequirePermissions('medical.read')
  imaging(@OrgId() orgId: string, @Param('patientId') patientId: string) {
    return this.flow.imaging(orgId, patientId);
  }

  @Post('patients/:patientId/studies')
  @RequirePermissions('medical.write')
  study(
    @OrgId() orgId: string,
    @Param('patientId') patientId: string,
    @Body() body: { type: string; fileUrl: string; title?: string; toothNum?: number; appointmentId?: string; phaseId?: string; seriesKey?: string; sliceIndex?: number },
  ) {
    return this.flow.addStudy(orgId, patientId, body);
  }

  @Post('patients/:patientId/shots')
  @RequirePermissions('medical.write')
  shot(
    @OrgId() orgId: string,
    @Param('patientId') patientId: string,
    @Body() body: { moment: string; slot: string; fileUrl: string; toothNum?: number; phaseId?: string; appointmentId?: string },
  ) {
    return this.flow.addShot(orgId, patientId, body);
  }

  @Post('studies/:studyId/annotations')
  @RequirePermissions('medical.write')
  annotate(
    @Param('studyId') studyId: string,
    @Body() body: { toothNum?: number; kind: string; label: string; x: number; y: number; w: number; h: number; sliceIndex?: number; source?: string; confidence?: number },
  ) {
    return this.flow.annotate(studyId, body);
  }

  @Post('annotations/:id/accept')
  @RequirePermissions('medical.write')
  acceptMark(@OrgId() orgId: string, @Param('id') id: string) {
    return this.flow.acceptMark(orgId, id);
  }

  @Post('annotations/:id/hide')
  @RequirePermissions('medical.write')
  hideMark(@OrgId() orgId: string, @Param('id') id: string) {
    return this.flow.hideMark(orgId, id);
  }
}
