import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { InternalServiceGuard } from '../../common/guards/internal-service.guard';
import { BillingService } from './billing.service';
import { RecordUsageEventDto } from './dto/record-usage-event.dto';

@Controller('internal/billing')
@UseGuards(InternalServiceGuard)
export class BillingInternalController {
  constructor(private readonly billingService: BillingService) {}

  @Post('usage-events')
  recordUsageEvent(@Body() dto: RecordUsageEventDto) {
    return this.billingService.recordUsageEvent(dto);
  }

  @Post('close-due-periods')
  closeDuePeriods() {
    return this.billingService.closeDuePeriods();
  }
}
