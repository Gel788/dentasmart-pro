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
import { BookingAssistantService } from './booking-assistant.service';
import { DictationService } from './dictation.service';
import { CrmAssistantController, CrmAssistantService } from './crm-assistant';
import { DocumentsController, DocumentsService } from './documents';
import { ReportsController, ReportsService } from './reports';
import { BookingRequestsController, BookingRequestsService } from './booking-requests';
import { RemindersController } from './reminders.controller';
import { RemindersService } from './reminders.service';
import { IntegrationsController } from './integrations.controller';
import { IntegrationsService } from './integrations.service';
import { SterilizationController } from './sterilization.controller';
import { SterilizationService } from './sterilization.service';
import { WorkspaceController } from './workspace.controller';
import { PatientImportService } from './patient-import.service';
import { WorkspaceService } from './workspace.service';
import { FlowController } from './flow.controller';
import { FlowService } from './flow.service';
import { ShowcaseController } from './showcase.controller';
import { ShowcaseService } from './showcase.service';
import { ClinicConfigController } from './clinic-config.controller';
import { ClinicConfigService } from './clinic-config.service';
import { MarketController, OpenApiController } from './market.controller';
import { MarketService } from './market.service';

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
    BookingRequestsController,
    CrmAssistantController,
    DocumentsController,
    ReportsController,
    RemindersController,
    IntegrationsController,
    SterilizationController,
    WorkspaceController,
    FlowController,
    ShowcaseController,
    ClinicConfigController,
    MarketController,
    OpenApiController,
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
    BookingAssistantService,
    DictationService,
    CrmAssistantService,
    DocumentsService,
    ReportsService,
    BookingRequestsService,
    RemindersService,
    IntegrationsService,
    SterilizationService,
    WorkspaceService,
    PatientImportService,
    FlowService,
    ShowcaseService,
    ClinicConfigService,
    MarketService,
  ],
})
export class DomainsModule {}
