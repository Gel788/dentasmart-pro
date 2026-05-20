import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { BranchesModule } from './branches/branches.module';
import { PatientsModule } from './patients/patients.module';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { DomainsModule } from './domains/domains.module';
import { ServicesCatalogModule } from './services-catalog/services.module';
import { SettingsModule } from './settings/settings.module';
import { UploadsModule } from './uploads/uploads.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    HealthModule,
    AuthModule,
    BranchesModule,
    PatientsModule,
    AppointmentsModule,
    ServicesCatalogModule,
    SettingsModule,
    UploadsModule,
    DomainsModule,
  ],
})
export class AppModule {}
