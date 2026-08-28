export type BillingConfig = {
  provider: string;
  publicBaseUrl: string;
  portalReturnUrl: string;
  trialDays: number;
  closeDuePeriodsIntervalMs: number;
  mercadopagoAccessToken: string;
  mercadopagoPublicKey: string;
  mercadopagoWebhookSecret: string;
  mercadopagoApiBaseUrl: string;
  mercadopagoCurrency: string;
  outboundWebhookSecret: string;
  stripeSecretKey: string;
  stripeWebhookSecret: string;
  stripePublishableKey: string;
};
