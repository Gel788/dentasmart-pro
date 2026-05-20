import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '@dentasmart/shared';
import { CurrentUser } from '../common/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { CreatePatientDto } from './dto/create-patient.dto';
import { PatientsService } from './patients.service';

@ApiTags('patients')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('patients')
export class PatientsController {
  constructor(private readonly patients: PatientsService) {}

  @Get()
  @RequirePermissions('patient.read')
  list(
    @CurrentUser() user: AuthUser,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.patients.findAll(
      user.organizationId,
      search,
      page ? +page : 1,
      pageSize ? +pageSize : 20,
    );
  }

  @Get(':id')
  @RequirePermissions('patient.read')
  one(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.patients.findOne(user.organizationId, id);
  }

  @Get(':id/full')
  @RequirePermissions('patient.read')
  full(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.patients.findFull(user.organizationId, id);
  }

  @Patch(':id')
  @RequirePermissions('patient.write')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CreatePatientDto) {
    return this.patients.update(user.organizationId, id, dto, user.id);
  }

  @Post()
  @RequirePermissions('patient.write')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreatePatientDto) {
    return this.patients.create(user, dto);
  }

  @Post('import')
  @RequirePermissions('patient.write')
  importBulk(@CurrentUser() user: AuthUser, @Body() body: { rows: CreatePatientDto[] }) {
    return this.patients.importBulk(user, body.rows ?? []);
  }
}
