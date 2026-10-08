import { Module } from '@nestjs/common';
import { ClinicalController } from './clinical.controller';
import { ClinicalService } from './clinical.service';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';
import { WarehouseController } from './warehouse.controller';
import { WarehouseService } from './warehouse.service';
import { LabController } from './lab.controller';
import { LabService } from './lab.service';
import { MarketingController } from './marketing.controller';
import { MarketingService } from './marketing.service';
import { CommunicationsController } from './communications.controller';
import { CommunicationsService } from './communications.service';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { EmployeesController } from './employees.controller';
import { EmployeesService } from './employees.service';
import { QueueController } from './queue.controller';
import { QueueService } from './queue.service';
import { WidgetController } from './widget.controller';
import { WidgetService } from './widget.service';
import { RemindersController } from './reminders.controller';
import { RemindersService } from './reminders.service';
import { IntegrationsController } from './integrations.controller';
import { IntegrationsService } from './integrations.service';
import { SterilizationController } from './sterilization.controller';
import { SterilizationService } from './sterilization.service';

@Module({
  controllers: [
    ClinicalController,
    FinanceController,
    WarehouseController,
    LabController,
    MarketingController,
    CommunicationsController,
    AnalyticsController,
    EmployeesController,
    QueueController,
    WidgetController,
    RemindersController,
    IntegrationsController,
    SterilizationController,
  ],
  providers: [
    ClinicalService,
    FinanceService,
    WarehouseService,
    LabService,
    MarketingService,
    CommunicationsService,
    AnalyticsService,
    EmployeesService,
    QueueService,
    WidgetService,
    RemindersService,
    IntegrationsService,
    SterilizationService,
  ],
})
export class DomainsModule {}
