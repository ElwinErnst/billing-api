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
import { MerchantAccountEntity } from "./entities/merchant-account.entity";
import { MerchantProductEntity } from "./entities/merchant-product.entity";
import { MerchantPriceEntity } from "./entities/merchant-price.entity";
import { MerchantCustomerEntity } from "./entities/merchant-customer.entity";
import { MerchantSubscriptionEntity } from "./entities/merchant-subscription.entity";
import { BillingUsageEventEntity } from "./entities/billing-usage-event.entity";
import { ProviderConnectionEntity } from "./entities/provider-connection.entity";
import { WebhookEndpointEntity } from "./entities/webhook-endpoint.entity";
import { BillingController } from "./billing.controller";
import { ProviderConnectionsController } from "./provider-connections.controller";
import { WebhookEndpointsController } from "./webhook-endpoints.controller";
import { BillingService } from "./billing.service";
import { MerchantBillingController } from "./merchant-billing.controller";
import { MerchantBillingService } from "./merchant-billing.service";
import { ProviderConnectionService } from "./provider-connection.service";
import { ProviderSecretResolver } from "./provider-secret.resolver";
import { WebhookEndpointService } from "./webhook-endpoint.service";
import { SecretCipher } from "./secret-cipher";
import { OutboundWebhookService } from "./outbound-webhook.service";
import { AuditModule } from "../audit/audit.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      BillingCustomerEntity,
      BillingPaymentIntentEntity,
      BillingPeriodCloseEntity,
      BillingSubscriptionEntity,
      MerchantAccountEntity,
      MerchantProductEntity,
      MerchantPriceEntity,
      MerchantCustomerEntity,
      MerchantSubscriptionEntity,
      BillingUsageEventEntity,
      ProviderConnectionEntity,
      WebhookEndpointEntity,
    ]),
    ReplayModule,
    AuditModule,
  ],
  controllers: [
    BillingController,
    MerchantBillingController,
    BillingInternalController,
    ProviderConnectionsController,
    WebhookEndpointsController,
  ],
  providers: [
    BillingService,
    MerchantBillingService,
    ProviderConnectionService,
    ProviderSecretResolver,
    WebhookEndpointService,
    SecretCipher,
    OutboundWebhookService,
    AuthDirectoryService,
    InternalServiceGuard,
  ],
  exports: [BillingService],
})
export class BillingModule {}
