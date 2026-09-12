import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
import { BillingPaymentIntentEntity } from './entities/billing-payment-intent.entity';
import { WebhookEndpointService } from './webhook-endpoint.service';
import type { BillingConfig } from './types/billing-config.type';

export type OutboundPaymentEvent = 'payment.approved' | 'payment.failed';

type DeliveryTarget = { url: string; secret: string; label: string };

type TargetResult = {
  label: string;
  delivered: boolean;
  attempts: number;
};

type DeliveryResult = {
  delivered: boolean;
  eventId: string;
  targets: TargetResult[];
  skippedReason?: 'no-targets' | 'no-secret';
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

  constructor(
    private readonly configService: ConfigService,
    private readonly webhookEndpoints: WebhookEndpointService,
  ) {}

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

    // Registered endpoints for this payment's app/environment subscribed to the
    // event — each signed with its own secret.
    const registered = await this.webhookEndpoints.resolveTargets(
      intent.tenantId,
      intent.clientAppId,
      intent.environmentId,
      event,
    );
    const targets: DeliveryTarget[] = registered.map((endpoint) => ({
      url: endpoint.url,
      secret: endpoint.secret,
      label: `endpoint:${endpoint.id}`,
    }));

    // Legacy path: a webhookUrl passed on the intent, signed with the global
    // secret. Kept for backward compatibility with pre-endpoint consumers.
    if (intent.webhookUrl) {
      if (this.secret) {
        targets.push({
          url: intent.webhookUrl,
          secret: this.secret,
          label: 'legacy-webhookUrl',
        });
      } else {
        // Never send an unsigned event; surface the misconfiguration.
        this.logger.warn(
          `Outbound webhook secret is not configured; skipping legacy delivery of ${event} for intent ${intent.id}`,
        );
      }
    }

    if (targets.length === 0) {
      return {
        delivered: false,
        eventId,
        targets: [],
        skippedReason: intent.webhookUrl ? 'no-secret' : 'no-targets',
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

    const results: TargetResult[] = [];
    for (const target of targets) {
      results.push(
        await this.deliverToTarget(target, event, eventId, rawBody, intent.id),
      );
    }

    return {
      delivered: results.some((r) => r.delivered),
      eventId,
      targets: results,
    };
  }

  /** Deliver one signed event to a single target, with bounded retries. */
  private async deliverToTarget(
    target: DeliveryTarget,
    event: OutboundPaymentEvent,
    eventId: string,
    rawBody: string,
    intentId: string,
  ): Promise<TargetResult> {
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
          response = await fetch(target.url, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-sytadel-event-id': eventId,
              'x-sytadel-signature': OutboundWebhookService.signature(
                target.secret,
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
          return { label: target.label, delivered: true, attempts: attempt };
        }
        this.logger.warn(
          `Outbound webhook ${event} for intent ${intentId} -> ${target.label} got HTTP ${response.status} (attempt ${attempt})`,
        );
      } catch (error) {
        this.logger.warn(
          `Outbound webhook ${event} for intent ${intentId} -> ${target.label} failed (attempt ${attempt}): ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    this.logger.error(
      `Outbound webhook ${event} for intent ${intentId} -> ${target.label} exhausted retries; eventId=${eventId}`,
    );
    return {
      label: target.label,
      delivered: false,
      attempts: OutboundWebhookService.MAX_ATTEMPTS,
    };
  }
}
