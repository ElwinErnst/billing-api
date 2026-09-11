import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { BillingConfig } from './types/billing-config.type';
import type { ProviderConnectionEntity } from './entities/provider-connection.entity';

export type MercadoPagoCredentials = { accessToken: string };
export type StripeCredentials = { secretKey: string };

/**
 * Resolves a ProviderConnection's `secretReference` to actual provider
 * credentials. Today this is env-based: a named reference maps to
 * `MERCADOPAGO_ACCESS_TOKEN_<REF>` / `STRIPE_SECRET_KEY_<REF>`; a null reference
 * (or a missing named var) falls back to the deployment's global config. The
 * token is never persisted — only the reference is. Swapping this for a KMS /
 * encrypted store later is a single-class change.
 */
@Injectable()
export class ProviderSecretResolver {
  constructor(private readonly configService: ConfigService) {}

  private get billing(): BillingConfig {
    return this.configService.get<BillingConfig>('billing')!;
  }

  private envSuffix(secretReference: string): string {
    return secretReference.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  }

  resolveMercadoPago(
    connection: ProviderConnectionEntity | null,
  ): MercadoPagoCredentials {
    const named = connection?.secretReference
      ? process.env[`MERCADOPAGO_ACCESS_TOKEN_${this.envSuffix(connection.secretReference)}`]
      : undefined;
    const accessToken = named || this.billing.mercadopagoAccessToken;
    if (!accessToken) {
      throw new InternalServerErrorException(
        'Mercado Pago access token is not configured for this connection',
      );
    }
    return { accessToken };
  }

  resolveStripe(connection: ProviderConnectionEntity | null): StripeCredentials {
    const named = connection?.secretReference
      ? process.env[`STRIPE_SECRET_KEY_${this.envSuffix(connection.secretReference)}`]
      : undefined;
    const secretKey = named || this.billing.stripeSecretKey;
    if (!secretKey) {
      throw new InternalServerErrorException(
        'Stripe secret key is not configured for this connection',
      );
    }
    return { secretKey };
  }
}
