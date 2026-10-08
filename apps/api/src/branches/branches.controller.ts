import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { OrgId } from '../common/org.decorator';
import { BranchesService } from './branches.service';

@ApiTags('branches')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('branches')
export class BranchesController {
  constructor(private readonly branches: BranchesService) {}

  @Get()
  @RequirePermissions('branch.read')
  list(@OrgId() orgId: string) {
    return this.branches.findAll(orgId);
  }

  @Get('overview')
  @RequirePermissions('branch.read')
  overview(@OrgId() orgId: string) {
    return this.branches.overview(orgId);
  }

  @Post()
  @RequirePermissions('branch.write')
  create(@OrgId() orgId: string, @Body() body: { name: string; address?: string; phone?: string }) {
    return this.branches.createBranch(orgId, body);
  }

  @Post(':branchId/cabinets')
  @RequirePermissions('branch.write')
  createCabinet(
    @OrgId() orgId: string,
    @Param('branchId') branchId: string,
    @Body() body: { name: string; number?: string; purpose?: string },
  ) {
    return this.branches.createCabinet(branchId, orgId, body);
  }
}
