export type BillingCycle = 'monthly' | 'yearly';

export type SubscriptionRenewalInput = {
  /** Status the payment maps to right now (e.g. 'ACTIVE', 'CANCELED', 'PENDING'). */
  mappedStatus: string;
  /** Provider payment id of the event being applied (null if the provider omitted it). */
  incomingPaymentId: string | null;
  /** Subscription status BEFORE this event was applied. */
  previousStatus: string;
  /** Provider payment id that was last applied to this subscription. */
  lastAppliedPaymentId: string | null;
  /** Current period end BEFORE this event. */
  currentPeriodEndsAt: Date | null;
  billingCycle: BillingCycle;
  /** Injectable clock for tests. */
  now?: Date;
};

export type SubscriptionRenewalResult = {
  periodEndsAt: Date | null;
  /** True when this event advanced the period (a real, new activation/renewal). */
  extended: boolean;
};

function addCycle(base: Date, billingCycle: BillingCycle): Date {
  const next = new Date(base);
  if (billingCycle === 'yearly') {
    next.setUTCFullYear(next.getUTCFullYear() + 1);
  } else {
    next.setUTCMonth(next.getUTCMonth() + 1);
  }
  return next;
}

/**
 * Decide the subscription's period end when applying a provider payment event.
 *
 * Fixes a business-logic replay: the previous code recomputed
 * `currentPeriodEndsAt = now + cycle` on every ACTIVE event, so replaying an
 * already-approved payment id (e.g. re-hitting the public return URL or a
 * re-delivered webhook) extended the paid period for free.
 *
 * Guarantees:
 * - Idempotent: re-applying the SAME payment id to an already-ACTIVE
 *   subscription does not extend the period again.
 * - Monotonic: a genuine new activation/renewal extends from
 *   `max(now, currentPeriodEndsAt)`, so periods stack instead of resetting to
 *   `now` (and a late event can never shrink an existing period).
 * - Non-ACTIVE events leave the period untouched.
 */
export function resolveSubscriptionRenewal(
  input: SubscriptionRenewalInput,
): SubscriptionRenewalResult {
  const now = input.now ?? new Date();

  if (input.mappedStatus !== 'ACTIVE') {
    return { periodEndsAt: input.currentPeriodEndsAt, extended: false };
  }

  const alreadyAppliedThisPayment =
    input.incomingPaymentId !== null &&
    input.previousStatus === 'ACTIVE' &&
    input.lastAppliedPaymentId === input.incomingPaymentId;

  if (alreadyAppliedThisPayment) {
    // Replay of an event we already applied — do not extend again.
    return { periodEndsAt: input.currentPeriodEndsAt, extended: false };
  }

  const base =
    input.currentPeriodEndsAt && input.currentPeriodEndsAt > now
      ? input.currentPeriodEndsAt
      : now;

  return { periodEndsAt: addCycle(base, input.billingCycle), extended: true };
}
