import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { WidgetBookDto, WidgetLookupDto, WidgetRescheduleDto } from './dto/widget.dto';
import { WidgetService } from './widget.service';

/** Anonymous endpoints: reads stay generous for the booking form, writes and lookups are tight. */
const WRITE_LIMIT = { default: { limit: 10, ttl: 10 * 60_000 } };
const LOOKUP_LIMIT = { default: { limit: 10, ttl: 10 * 60_000 } };

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
    @Query('durationMin') durationMin?: string,
  ) {
    return this.svc.publicSlots(orgSlug, branchId, from, to, durationMin ? +durationMin : 30);
  }

  @Get(':orgSlug/visits')
  @Throttle(LOOKUP_LIMIT)
  visits(@Param('orgSlug') orgSlug: string, @Query() query: WidgetLookupDto) {
    return this.svc.visitsByPhone(orgSlug, query);
  }

  @Post(':orgSlug/reschedule')
  @Throttle(WRITE_LIMIT)
  reschedule(@Param('orgSlug') orgSlug: string, @Body() body: WidgetRescheduleDto) {
    return this.svc.reschedule(orgSlug, body);
  }

  @Post(':orgSlug/book')
  @Throttle(WRITE_LIMIT)
  book(@Param('orgSlug') orgSlug: string, @Body() body: WidgetBookDto) {
    return this.svc.book(orgSlug, body);
  }
}
