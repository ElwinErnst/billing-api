/**
 * Events a consumer app can subscribe a webhook endpoint to. Today the billing
 * pipeline emits payment.approved / payment.failed (see OutboundWebhookService);
 * payment.refunded is reserved for the refund flow. Kept as a closed allowlist
 * so an endpoint can't subscribe to a typo'd event name.
 */
export const WEBHOOK_EVENTS = [
  'payment.approved',
  'payment.failed',
  'payment.refunded',
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export function isWebhookEvent(value: string): value is WebhookEvent {
  return (WEBHOOK_EVENTS as readonly string[]).includes(value);
}
