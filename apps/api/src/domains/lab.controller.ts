import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { OrgId } from '../common/org.decorator';
import { LabService } from './lab.service';

@ApiTags('lab')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('lab')
export class LabController {
  constructor(private readonly svc: LabService) {}

  @Get('orders')
  @RequirePermissions('medical.read')
  orders(@OrgId() orgId: string) {
    return this.svc.listOrders(orgId);
  }

  @Post('orders')
  @RequirePermissions('medical.write')
  create(
    @OrgId() orgId: string,
    @Body() body: { title: string; patientId?: string; doctorId?: string; shade?: string; dueAt?: string; costAmount?: number },
  ) {
    return this.svc.createOrder(orgId, body);
  }

  @Patch('orders/:id/status')
  @RequirePermissions('medical.write')
  status(@Param('id') id: string, @Body() body: { status: string }) {
    return this.svc.updateStatus(id, body.status);
  }

  @Patch('orders/:id/scan')
  @RequirePermissions('medical.write')
  scan(@OrgId() orgId: string, @Param('id') id: string, @Body() body: { fileUrl: string }) {
    return this.svc.attachScan(orgId, id, body.fileUrl);
  }

  @Post('orders/:id/messages')
  @RequirePermissions('medical.write')
  message(@Param('id') id: string, @Body() body: { text: string; authorId?: string }) {
    return this.svc.addMessage(id, body.text, body.authorId);
  }
}
