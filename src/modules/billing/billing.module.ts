import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ReplayModule } from "../../common/replay/replay.module";
import { InternalServiceGuard } from "../../common/guards/internal-service.guard";
import { AuthDirectoryService } from "../../common/modules/auth-directory/auth-directory.service";
import { BillingInternalController } from "./billing-internal.controller";
import { BillingCustomerEntity } from "./entities/billing-customer.entity";
import { BillingPaymentIntentEntity } from "./entities/billing-payment-intent.entity";
import { BillingPeriodCloseEntity } from "./entities/billing-period-close.entity";
import { BillingSubscriptionEntity } from "./entities/billing-subscription.entity";
import { BillingUsageEventEntity } from "./entities/billing-usage-event.entity";
import { ProviderConnectionEntity } from "./entities/provider-connection.entity";
import { WebhookEndpointEntity } from "./entities/webhook-endpoint.entity";
import { BillingController } from "./billing.controller";
import { ProviderConnectionsController } from "./provider-connections.controller";
import { WebhookEndpointsController } from "./webhook-endpoints.controller";
import { BillingService } from "./billing.service";
import { ProviderConnectionService } from "./provider-connection.service";
import { ProviderSecretResolver } from "./provider-secret.resolver";
import { WebhookEndpointService } from "./webhook-endpoint.service";
import { OutboundWebhookService } from "./outbound-webhook.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      BillingCustomerEntity,
      BillingPaymentIntentEntity,
      BillingPeriodCloseEntity,
      BillingSubscriptionEntity,
      BillingUsageEventEntity,
      ProviderConnectionEntity,
      WebhookEndpointEntity,
    ]),
    ReplayModule,
  ],
  controllers: [
    BillingController,
    BillingInternalController,
    ProviderConnectionsController,
    WebhookEndpointsController,
  ],
  providers: [
    BillingService,
    ProviderConnectionService,
    ProviderSecretResolver,
    WebhookEndpointService,
    OutboundWebhookService,
    AuthDirectoryService,
    InternalServiceGuard,
  ],
  exports: [BillingService],
})
export class BillingModule {}
