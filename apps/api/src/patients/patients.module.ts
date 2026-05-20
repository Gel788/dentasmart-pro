import { Module } from '@nestjs/common';
import { PatientsController } from './patients.controller';
import { PatientsService } from './patients.service';
import { AuditService } from '../common/audit.service';

@Module({
  controllers: [PatientsController],
  providers: [PatientsService, AuditService],
})
export class PatientsModule {}
