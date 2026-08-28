import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
import { BillingPaymentIntentEntity } from './entities/billing-payment-intent.entity';
import type { BillingConfig } from './types/billing-config.type';

export type OutboundPaymentEvent = 'payment.approved' | 'payment.failed';

type DeliveryResult = {
  delivered: boolean;
  eventId: string;
  attempts: number;
  skippedReason?: 'no-url' | 'no-secret';
};

/**
 * Signs and delivers payment events to the consumer app's webhook URL.
 *
 * This is the inverse of the internal-service HMAC: here Sytadel is the signer
 * and the consumer verifies. The scheme mirrors Stripe's so it is familiar and
 * trivial to verify:
 *
 *   header  x-sytadel-signature: t=<unixMillis>,v1=<hex>
 *   header  x-sytadel-event-id:  <uuid>            (dedupe key)
 *   signed  `${t}.${rawBody}` with HMAC-SHA256(secret)
 *
 * The consumer recomputes the HMAC over the exact raw body it received and
 * compares in constant time; a forged body fails because payment state is always
 * re-fetched from the provider before we emit (a webhook cannot fabricate a
 * payment).
 */
@Injectable()
export class OutboundWebhookService {
  private readonly logger = new Logger(OutboundWebhookService.name);
  private static readonly MAX_ATTEMPTS = 3;
  private static readonly BACKOFF_MS = [0, 500, 2000];
  private static readonly TIMEOUT_MS = 5000;

  constructor(private readonly configService: ConfigService) {}

  private get secret(): string {
    return this.configService.get<BillingConfig>('billing')!.outboundWebhookSecret;
  }

  /**
   * Build the `t=...,v1=...` signature header value for a raw body. Exposed so
   * tests and reference consumers can verify against the exact same routine.
   */
  static signature(secret: string, tsMs: number, rawBody: string): string {
    const v1 = createHmac('sha256', secret)
      .update(`${tsMs}.${rawBody}`)
      .digest('hex');
    return `t=${tsMs},v1=${v1}`;
  }

  /** Constant-time verification helper (for the reference consumer / tests). */
  static verify(secret: string, header: string, rawBody: string): boolean {
    const parts = Object.fromEntries(
      header.split(',').map((kv) => kv.split('=') as [string, string]),
    );
    if (!parts.t || !parts.v1) {
      return false;
    }
    const expected = createHmac('sha256', secret)
      .update(`${parts.t}.${rawBody}`)
      .digest('hex');
    const a = Buffer.from(parts.v1);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  async deliverPaymentEvent(
    intent: BillingPaymentIntentEntity,
  ): Promise<DeliveryResult> {
    const event: OutboundPaymentEvent =
      intent.status === 'APPROVED' ? 'payment.approved' : 'payment.failed';
    const eventId = randomUUID();

    if (!intent.webhookUrl) {
      return { delivered: false, eventId, attempts: 0, skippedReason: 'no-url' };
    }

    if (!this.secret) {
      // Never send an unsigned event: a consumer that cannot verify is worse
      // than no delivery. Surface the misconfiguration loudly instead.
      this.logger.warn(
        `Outbound webhook secret is not configured; skipping ${event} for intent ${intent.id}`,
      );
      return {
        delivered: false,
        eventId,
        attempts: 0,
        skippedReason: 'no-secret',
      };
    }

    const payload = {
      event,
      eventId,
      paymentIntentId: intent.id,
      status: intent.status,
      provider: intent.provider,
      amountCents: intent.amountCents,
      currency: intent.currency,
      externalReference: intent.externalReference,
      metadata: intent.metadata ?? undefined,
    };
    const rawBody = JSON.stringify(payload);

    for (let attempt = 1; attempt <= OutboundWebhookService.MAX_ATTEMPTS; attempt++) {
      const backoff = OutboundWebhookService.BACKOFF_MS[attempt - 1] ?? 2000;
      if (backoff > 0) {
        await new Promise((resolve) => setTimeout(resolve, backoff));
      }

      try {
        const tsMs = Date.now();
        const controller = new AbortController();
        const timer = setTimeout(
          () => controller.abort(),
          OutboundWebhookService.TIMEOUT_MS,
        );
        let response: Response;
        try {
          response = await fetch(intent.webhookUrl, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-sytadel-event-id': eventId,
              'x-sytadel-signature': OutboundWebhookService.signature(
                this.secret,
                tsMs,
                rawBody,
              ),
            },
            body: rawBody,
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timer);
        }

        if (response.ok) {
          return { delivered: true, eventId, attempts: attempt };
        }
        this.logger.warn(
          `Outbound webhook ${event} for intent ${intent.id} got HTTP ${response.status} (attempt ${attempt})`,
        );
      } catch (error) {
        this.logger.warn(
          `Outbound webhook ${event} for intent ${intent.id} failed (attempt ${attempt}): ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    this.logger.error(
      `Outbound webhook ${event} for intent ${intent.id} exhausted retries; eventId=${eventId}`,
    );
    return {
      delivered: false,
      eventId,
      attempts: OutboundWebhookService.MAX_ATTEMPTS,
    };
  }
}
