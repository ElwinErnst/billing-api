import { registerAs } from '@nestjs/config';

export default registerAs('billing', () => ({
  provider: process.env.BILLING_PROVIDER ?? 'mock',
  allowMockCheckoutActivation:
    process.env.BILLING_ALLOW_MOCK_CHECKOUT_ACTIVATION === 'true' ||
    ((process.env.NODE_ENV ?? 'development') !== 'production' &&
      (process.env.BILLING_PROVIDER ?? 'mock') === 'mock'),
  publicBaseUrl: process.env.BILLING_PUBLIC_BASE_URL ?? 'http://localhost:3020/api',
  portalReturnUrl: process.env.BILLING_PORTAL_RETURN_URL ?? 'http://localhost:3003/app/billing',
  trialDays: Number(process.env.BILLING_TRIAL_DAYS ?? 14),
  closeDuePeriodsIntervalMs: Number(
    process.env.BILLING_CLOSE_DUE_PERIODS_INTERVAL_MS ?? 300000,
  ),
  mercadopagoAccessToken: process.env.MERCADOPAGO_ACCESS_TOKEN ?? '',
  mercadopagoPublicKey: process.env.MERCADOPAGO_PUBLIC_KEY ?? '',
  mercadopagoWebhookSecret: process.env.MERCADOPAGO_WEBHOOK_SECRET ?? '',
  mercadopagoApiBaseUrl: process.env.MERCADOPAGO_API_BASE_URL ?? 'https://api.mercadopago.com',
  mercadopagoCurrency: (process.env.MERCADOPAGO_CURRENCY ?? 'ARS').toUpperCase(),
  // Shared secret used to sign outbound webhooks to consumer apps. When empty,
  // outbound delivery is skipped (never send an event a consumer can't verify).
  // Phase 4 (self-serve API keys) will move this to per-tenant secrets.
  outboundWebhookSecret: process.env.BILLING_OUTBOUND_WEBHOOK_SECRET ?? '',
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? '',
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? '',
  stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY ?? '',
}));
