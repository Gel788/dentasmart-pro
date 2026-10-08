import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '@dentasmart/shared';
import { CurrentUser } from '../common/current-user.decorator';
import { OrgId } from '../common/org.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';
import { AppointmentsService } from './appointments.service';
import { VisitNoteDto } from './dto/visit-note.dto';
import { CreateBlockDto } from './dto/create-block.dto';
import { CreateToMakeDto } from './dto/create-to-make.dto';

@ApiTags('appointments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appointments: AppointmentsService) {}

  @Get('slots')
  @RequirePermissions('schedule.read')
  slots(
    @OrgId() orgId: string,
    @Query('branchId') branchId: string,
    @Query('durationMin') durationMin: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.appointments.suggestSlots(orgId, branchId, +(durationMin || 30), from, to);
  }

  @Get('day')
  @RequirePermissions('schedule.read')
  day(@OrgId() orgId: string, @Query('branchId') branchId: string, @Query('date') date: string) {
    return this.appointments.dayBoard(orgId, branchId, date);
  }

  @Get('to-make')
  @RequirePermissions('schedule.read')
  toMake(@OrgId() orgId: string, @Query('branchId') branchId: string) {
    return this.appointments.listToMake(orgId, branchId);
  }

  @Post('to-make')
  @RequirePermissions('schedule.write')
  createToMake(@OrgId() orgId: string, @Body() dto: CreateToMakeDto) {
    return this.appointments.createToMake(orgId, dto);
  }

  @Post('to-make/:id/schedule')
  @RequirePermissions('schedule.write')
  scheduleToMake(@OrgId() orgId: string, @Param('id') id: string) {
    return this.appointments.scheduleToMake(orgId, id);
  }

  @Delete('to-make/:id')
  @RequirePermissions('schedule.write')
  deleteToMake(@OrgId() orgId: string, @Param('id') id: string) {
    return this.appointments.deleteToMake(orgId, id);
  }

  @Post('blocks')
  @RequirePermissions('schedule.write')
  createBlock(@OrgId() orgId: string, @Body() dto: CreateBlockDto) {
    return this.appointments.createBlock(orgId, dto);
  }

  @Delete('blocks/:id')
  @RequirePermissions('schedule.write')
  deleteBlock(@OrgId() orgId: string, @Param('id') id: string) {
    return this.appointments.deleteBlock(orgId, id);
  }

  @Get()
  @RequirePermissions('schedule.read')
  list(
    @CurrentUser() user: AuthUser,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('branchId') branchId?: string,
    @Query('doctorId') doctorId?: string,
    @Query('cabinetId') cabinetId?: string,
  ) {
    return this.appointments.findByRange(
      user.organizationId,
      from,
      to,
      branchId,
      doctorId,
      cabinetId,
    );
  }

  @Post()
  @RequirePermissions('schedule.write')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateAppointmentDto) {
    return this.appointments.create(user, dto);
  }

  @Get(':id/workflow')
  @RequirePermissions('schedule.read')
  workflow(@OrgId() orgId: string, @Param('id') id: string) {
    return this.appointments.getWorkflowContext(orgId, id);
  }

  @Post(':id/note')
  @RequirePermissions('schedule.write')
  saveNote(@OrgId() orgId: string, @Param('id') id: string, @Body() body: VisitNoteDto) {
    return this.appointments.saveVisitNote(orgId, id, body);
  }

  @Patch(':id/status')
  @RequirePermissions('schedule.write')
  updateStatus(
    @OrgId() orgId: string,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { status: string; noShowReason?: string },
  ) {
    return this.appointments.updateStatus(orgId, id, body.status, user.id, body.noShowReason);
  }

  @Patch(':id')
  @RequirePermissions('schedule.write')
  update(
    @OrgId() orgId: string,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateAppointmentDto,
  ) {
    return this.appointments.update(orgId, id, dto, user.id);
  }
}
