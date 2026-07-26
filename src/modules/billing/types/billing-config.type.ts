export type BillingConfig = {
  provider: string;
  publicBaseUrl: string;
  portalReturnUrl: string;
  trialDays: number;
  closeDuePeriodsIntervalMs: number;
  mercadopagoAccessToken: string;
  mercadopagoPublicKey: string;
  mercadopagoApiBaseUrl: string;
  mercadopagoCurrency: string;
  stripeSecretKey: string;
  stripeWebhookSecret: string;
  stripePublishableKey: string;
};
