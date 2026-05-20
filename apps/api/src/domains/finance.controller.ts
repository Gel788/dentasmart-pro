import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { OrgId } from '../common/org.decorator';
import { CurrentUser } from '../common/current-user.decorator';
import { AuthUser } from '@dentasmart/shared';
import { FinanceService } from './finance.service';

@ApiTags('finance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('finance')
export class FinanceController {
  constructor(private readonly svc: FinanceService) {}

  @Get('summary')
  @RequirePermissions('finance.read')
  summary(@OrgId() orgId: string) {
    return this.svc.summary(orgId);
  }

  @Get('invoices')
  @RequirePermissions('finance.read')
  invoices(@OrgId() orgId: string, @Query('patientId') patientId?: string) {
    return this.svc.listInvoices(orgId, patientId);
  }

  @Get('payments')
  @RequirePermissions('finance.read')
  payments(@OrgId() orgId: string, @Query('patientId') patientId?: string) {
    return this.svc.listPayments(orgId, patientId);
  }

  @Get('promo-codes')
  @RequirePermissions('finance.read')
  promos(@OrgId() orgId: string) {
    return this.svc.listPromos(orgId);
  }

  @Get('price-lists')
  @RequirePermissions('finance.read')
  priceLists(@OrgId() orgId: string) {
    return this.svc.listPriceLists(orgId);
  }

  @Get('invoices/:id')
  @RequirePermissions('finance.read')
  invoice(@OrgId() orgId: string, @Param('id') id: string) {
    return this.svc.getInvoice(orgId, id);
  }

  @Post('invoices')
  @RequirePermissions('finance.write')
  createInvoice(@OrgId() orgId: string, @Body() body: { patientId: string; number: string; totalAmount: number }) {
    return this.svc.createInvoice(orgId, body);
  }

  @Post('invoices/from-plan/:planId')
  @RequirePermissions('finance.write')
  invoiceFromPlan(@OrgId() orgId: string, @Param('planId') planId: string) {
    return this.svc.createInvoiceFromPlan(orgId, planId);
  }

  @Post('invoices/from-appointment/:appointmentId')
  @RequirePermissions('finance.write')
  invoiceFromAppointment(@OrgId() orgId: string, @Param('appointmentId') appointmentId: string) {
    return this.svc.createInvoiceFromAppointment(orgId, appointmentId);
  }

  @Post('payments')
  @RequirePermissions('finance.write')
  createPayment(
    @OrgId() orgId: string,
    @Body() body: { patientId: string; amount: number; method: string; invoiceId?: string },
  ) {
    return this.svc.createPayment(orgId, body);
  }

  @Post('promo-codes')
  @RequirePermissions('finance.write')
  createPromo(@OrgId() orgId: string, @Body() body: { code: string; discountPct?: number }) {
    return this.svc.createPromo(orgId, body);
  }

  @Get('cash-shift/current')
  @RequirePermissions('finance.read')
  currentShift(@OrgId() orgId: string, @Query('branchId') branchId: string) {
    return this.svc.getOpenShift(orgId, branchId || 'seed-branch-main');
  }

  @Get('cash-shifts')
  @RequirePermissions('finance.read')
  shifts(@OrgId() orgId: string) {
    return this.svc.listShifts(orgId);
  }

  @Post('cash-shift/open')
  @RequirePermissions('finance.write')
  openShift(
    @OrgId() orgId: string,
    @CurrentUser() user: AuthUser,
    @Body() body: { branchId: string; openingCash: number },
  ) {
    return this.svc.openShift(orgId, { ...body, userId: user.id });
  }

  @Post('cash-shift/:id/close')
  @RequirePermissions('finance.write')
  closeShift(
    @OrgId() orgId: string,
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { closingCash: number; notes?: string },
  ) {
    return this.svc.closeShift(orgId, id, { ...body, userId: user.id });
  }

  @Get('deposits')
  @RequirePermissions('finance.read')
  deposits(@OrgId() orgId: string) {
    return this.svc.listDeposits(orgId);
  }

  @Post('deposits/top-up')
  @RequirePermissions('finance.write')
  topUp(@OrgId() orgId: string, @Body() body: { patientId: string; amount: number }) {
    return this.svc.topUpDeposit(orgId, body.patientId, body.amount);
  }

  @Post('deposits/pay')
  @RequirePermissions('finance.write')
  payDeposit(@OrgId() orgId: string, @Body() body: { patientId: string; amount: number; invoiceId?: string }) {
    return this.svc.payFromDeposit(orgId, body.patientId, body.amount, body.invoiceId);
  }

  @Get('installments')
  @RequirePermissions('finance.read')
  installments(@OrgId() orgId: string) {
    return this.svc.listInstallments(orgId);
  }

  @Post('installments')
  @RequirePermissions('finance.write')
  createInstallment(
    @OrgId() orgId: string,
    @Body() body: { patientId: string; invoiceId?: string; totalAmount: number; months: number },
  ) {
    return this.svc.createInstallment(orgId, body);
  }

  @Post('installments/lines/:lineId/pay')
  @RequirePermissions('finance.write')
  payLine(@OrgId() orgId: string, @Param('lineId') lineId: string, @Body() body: { patientId: string }) {
    return this.svc.payInstallmentLine(orgId, lineId, body.patientId);
  }

  @Get('family-groups')
  @RequirePermissions('finance.read')
  families(@OrgId() orgId: string) {
    return this.svc.listFamilyGroups(orgId);
  }

  @Post('family-groups')
  @RequirePermissions('finance.write')
  createFamily(@OrgId() orgId: string, @Body() body: { name: string; patientIds: string[] }) {
    return this.svc.createFamilyGroup(orgId, body);
  }

  @Get('payroll-rules')
  @RequirePermissions('finance.read')
  payrollRules(@OrgId() orgId: string) {
    return this.svc.listPayrollRules(orgId);
  }

  @Post('payroll-rules')
  @RequirePermissions('finance.write')
  createPayrollRule(
    @OrgId() orgId: string,
    @Body() body: { name: string; ruleType: string; paramsJson: object },
  ) {
    return this.svc.createPayrollRule(orgId, body);
  }

  @Get('payroll-entries')
  @RequirePermissions('finance.read')
  payrollEntries(@OrgId() orgId: string) {
    return this.svc.listPayrollEntries(orgId);
  }

  @Get('loyalty')
  @RequirePermissions('finance.read')
  loyalty(@OrgId() orgId: string) {
    return this.svc.listLoyalty(orgId);
  }
}
