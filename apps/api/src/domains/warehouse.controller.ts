import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { OrgId } from '../common/org.decorator';
import { WarehouseService } from './warehouse.service';

@ApiTags('warehouse')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('warehouse')
export class WarehouseController {
  constructor(private readonly svc: WarehouseService) {}

  @Get('items')
  @RequirePermissions('warehouse.read')
  items(@OrgId() orgId: string) {
    return this.svc.listItems(orgId);
  }

  @Get('movements')
  @RequirePermissions('warehouse.read')
  movements(@OrgId() orgId: string) {
    return this.svc.listMovements(orgId);
  }

  @Get('purchase-orders')
  @RequirePermissions('warehouse.read')
  orders(@OrgId() orgId: string) {
    return this.svc.listPurchaseOrders(orgId);
  }

  @Get('low-stock')
  @RequirePermissions('warehouse.read')
  lowStock(@OrgId() orgId: string) {
    return this.svc.lowStock(orgId);
  }

  @Get('expiring')
  @RequirePermissions('warehouse.read')
  expiring(@OrgId() orgId: string) {
    return this.svc.expiring(orgId);
  }

  @Get('material-cost')
  @RequirePermissions('warehouse.read')
  materialCost(@OrgId() orgId: string) {
    return this.svc.materialCost(orgId);
  }

  @Post('items')
  @RequirePermissions('warehouse.write')
  createItem(@OrgId() orgId: string, @Body() body: { name: string; sku?: string; category?: string; minStock?: number }) {
    return this.svc.createItem(orgId, body);
  }

  @Post('movements')
  @RequirePermissions('warehouse.write')
  movement(@OrgId() orgId: string, @Body() body: { itemId: string; branchId: string; type: string; quantity: number; notes?: string }) {
    return this.svc.addMovement(orgId, body);
  }

  @Get('inventory/active')
  @RequirePermissions('warehouse.read')
  activeInventory(@OrgId() orgId: string, @Query('branchId') branchId: string) {
    return this.svc.getActiveInventory(orgId, branchId);
  }

  @Post('inventory/start')
  @RequirePermissions('warehouse.write')
  startInventory(@OrgId() orgId: string, @Body() body: { branchId: string }) {
    return this.svc.startInventory(orgId, body.branchId);
  }

  @Patch('inventory/lines/:lineId')
  @RequirePermissions('warehouse.write')
  updateLine(@Param('lineId') lineId: string, @Body() body: { actualQty: number }) {
    return this.svc.updateCountLine(lineId, body.actualQty);
  }

  @Post('inventory/:sessionId/complete')
  @RequirePermissions('warehouse.write')
  completeInventory(
    @OrgId() orgId: string,
    @Param('sessionId') sessionId: string,
    @Body() body: { branchId: string },
  ) {
    return this.svc.completeInventory(sessionId, orgId, body.branchId);
  }

  @Get('material-norms')
  @RequirePermissions('warehouse.read')
  norms(@OrgId() orgId: string) {
    return this.svc.listMaterialNorms(orgId);
  }

  @Post('material-norms')
  @RequirePermissions('warehouse.write')
  createNorm(@OrgId() orgId: string, @Body() body: { serviceId: string; itemId: string; quantity: number }) {
    return this.svc.createMaterialNorm(orgId, body);
  }

  @Post('material-norms/:id/delete')
  @RequirePermissions('warehouse.write')
  deleteNorm(@Param('id') id: string) {
    return this.svc.deleteMaterialNorm(id);
  }
}
