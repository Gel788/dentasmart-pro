import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { OrgId } from '../common/org.decorator';
import { EmployeesService } from './employees.service';

@ApiTags('employees')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('employees')
export class EmployeesController {
  constructor(private readonly svc: EmployeesService) {}

  @Get('roles')
  @RequirePermissions('employee.read')
  roles(@OrgId() orgId: string) {
    return this.svc.listRoles(orgId);
  }

  @Get()
  @RequirePermissions('employee.read')
  list(@OrgId() orgId: string) {
    return this.svc.list(orgId);
  }

  @Post()
  @RequirePermissions('employee.write')
  create(
    @OrgId() orgId: string,
    @Body()
    body: {
      email: string;
      password: string;
      firstName: string;
      lastName: string;
      middleName?: string;
      phone?: string;
      specialization?: string;
      roleCode: string;
      branchIds?: string[];
    },
  ) {
    return this.svc.create(orgId, { ...body, branchIds: body.branchIds ?? [] });
  }

  @Patch(':id')
  @RequirePermissions('employee.write')
  update(
    @OrgId() orgId: string,
    @Param('id') id: string,
    @Body()
    body: {
      firstName?: string;
      lastName?: string;
      specialization?: string;
      status?: string;
      phone?: string;
      branchIds?: string[];
    },
  ) {
    return this.svc.update(orgId, id, body);
  }

  @Get('schedules')
  @RequirePermissions('employee.read')
  schedules(@OrgId() orgId: string, @Query('branchId') branchId?: string) {
    return this.svc.listSchedules(orgId, branchId);
  }

  @Post('schedules')
  @RequirePermissions('employee.write')
  createSchedule(
    @OrgId() orgId: string,
    @Body()
    body: { employeeId: string; branchId: string; dayOfWeek: number; startsAt: string; endsAt: string },
  ) {
    return this.svc.createSchedule(orgId, body);
  }

  @Delete('schedules/:id')
  @RequirePermissions('employee.write')
  deleteSchedule(@OrgId() orgId: string, @Param('id') id: string) {
    return this.svc.deleteSchedule(orgId, id);
  }

  @Get('payroll')
  @RequirePermissions('finance.read')
  payroll(@OrgId() orgId: string) {
    return this.svc.payroll(orgId);
  }
}
