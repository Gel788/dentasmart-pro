import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OrgId } from '../common/org.decorator';
import { ServicesCatalogService } from './services.service';

@ApiTags('services')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('services')
export class ServicesCatalogController {
  constructor(private readonly svc: ServicesCatalogService) {}

  @Get()
  list(@OrgId() orgId: string) {
    return this.svc.list(orgId);
  }

  @Post()
  create(@OrgId() orgId: string, @Body() body: { name: string; durationMin?: number; basePrice?: number; code?: string }) {
    return this.svc.create(orgId, body);
  }
}
