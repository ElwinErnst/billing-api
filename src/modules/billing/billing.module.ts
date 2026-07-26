import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InternalServiceGuard } from '../../common/guards/internal-service.guard';
import { AuthDirectoryService } from '../../common/modules/auth-directory/auth-directory.service';
import { BillingInternalController } from './billing-internal.controller';
import { BillingCustomerEntity } from './entities/billing-customer.entity';
import { BillingPeriodCloseEntity } from './entities/billing-period-close.entity';
import { BillingSubscriptionEntity } from './entities/billing-subscription.entity';
import { BillingUsageEventEntity } from './entities/billing-usage-event.entity';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      BillingCustomerEntity,
      BillingPeriodCloseEntity,
      BillingSubscriptionEntity,
      BillingUsageEventEntity,
    ]),
  ],
  controllers: [BillingController, BillingInternalController],
  providers: [BillingService, AuthDirectoryService, InternalServiceGuard],
  exports: [BillingService],
})
export class BillingModule {}
