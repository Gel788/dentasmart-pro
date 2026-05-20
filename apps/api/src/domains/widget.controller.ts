import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { WidgetService } from './widget.service';

@ApiTags('widget')
@Controller('public/widget')
export class WidgetController {
  constructor(private readonly svc: WidgetService) {}

  @Get(':orgSlug/config')
  config(@Param('orgSlug') orgSlug: string) {
    return this.svc.getConfig(orgSlug);
  }

  @Get(':orgSlug/services')
  services(@Param('orgSlug') orgSlug: string) {
    return this.svc.publicServices(orgSlug);
  }

  @Get(':orgSlug/slots')
  slots(
    @Param('orgSlug') orgSlug: string,
    @Query('branchId') branchId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.svc.publicSlots(orgSlug, branchId, from, to);
  }

  @Post(':orgSlug/book')
  book(
    @Param('orgSlug') orgSlug: string,
    @Body() body: {
      branchId: string;
      serviceId?: string;
      startsAt: string;
      endsAt: string;
      firstName: string;
      lastName: string;
      phone: string;
      email?: string;
    },
  ) {
    return this.svc.book(orgSlug, body);
  }
}
