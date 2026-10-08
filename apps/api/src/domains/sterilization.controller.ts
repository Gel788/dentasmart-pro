import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { OrgId } from '../common/org.decorator';
import { SterilizationService } from './sterilization.service';
import { CreateCycleDto } from './dto/create-cycle.dto';

@ApiTags('sterilization')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('sterilization')
export class SterilizationController {
  constructor(private readonly svc: SterilizationService) {}

  @Get('cycles')
  @RequirePermissions('medical.read')
  list(@OrgId() orgId: string) {
    return this.svc.list(orgId);
  }

  @Post('cycles')
  @RequirePermissions('medical.write')
  create(@OrgId() orgId: string, @Body() body: CreateCycleDto) {
    return this.svc.create(orgId, body);
  }
}
