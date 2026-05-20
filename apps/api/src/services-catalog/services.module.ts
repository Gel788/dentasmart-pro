import { Module } from '@nestjs/common';
import { ServicesCatalogController } from './services.controller';
import { ServicesCatalogService } from './services.service';

@Module({
  controllers: [ServicesCatalogController],
  providers: [ServicesCatalogService],
})
export class ServicesCatalogModule {}
