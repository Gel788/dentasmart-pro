import { Module } from '@nestjs/common';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';
import { AuditService } from '../common/audit.service';

@Module({
  controllers: [AppointmentsController],
  providers: [AppointmentsService, AuditService],
})
export class AppointmentsModule {}
