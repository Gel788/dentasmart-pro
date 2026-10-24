import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { OrgId } from '../common/org.decorator';
import { RouteService } from './route.service';

@ApiTags('route')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('route')
export class RouteController {
  constructor(private readonly route: RouteService) {}

  @Get('patients/:patientId')
  @RequirePermissions('patient.read')
  forPatient(@OrgId() orgId: string, @Param('patientId') patientId: string) {
    return this.route.forPatient(orgId, patientId);
  }
}
