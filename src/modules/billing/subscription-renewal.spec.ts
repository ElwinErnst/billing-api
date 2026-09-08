import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import { resolveSubscriptionRenewal } from './subscription-renewal';

const NOW = new Date('2026-06-01T00:00:00.000Z');

function plusMonth(base: Date): Date {
  const d = new Date(base);
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d;
}

test('first activation extends the period from now', () => {
  const res = resolveSubscriptionRenewal({
    mappedStatus: 'ACTIVE',
    incomingPaymentId: 'pay-1',
    previousStatus: 'PENDING',
    lastAppliedPaymentId: null,
    currentPeriodEndsAt: null,
    billingCycle: 'monthly',
    now: NOW,
  });
  assert.equal(res.extended, true);
  assert.equal(res.periodEndsAt?.getTime(), plusMonth(NOW).getTime());
});

test('replaying the SAME payment id on an active sub does NOT extend (the bug fix)', () => {
  const periodEnd = plusMonth(NOW); // already granted by pay-1
  const res = resolveSubscriptionRenewal({
    mappedStatus: 'ACTIVE',
    incomingPaymentId: 'pay-1',
    previousStatus: 'ACTIVE',
    lastAppliedPaymentId: 'pay-1',
    currentPeriodEndsAt: periodEnd,
    billingCycle: 'monthly',
    now: NOW,
  });
  assert.equal(res.extended, false);
  assert.equal(res.periodEndsAt, periodEnd); // unchanged, same instance
});

test('replaying the same payment repeatedly is stable (no drift)', () => {
  const periodEnd = plusMonth(NOW);
  let current = periodEnd;
  for (let i = 0; i < 5; i++) {
    const res = resolveSubscriptionRenewal({
      mappedStatus: 'ACTIVE',
      incomingPaymentId: 'pay-1',
      previousStatus: 'ACTIVE',
      lastAppliedPaymentId: 'pay-1',
      currentPeriodEndsAt: current,
      billingCycle: 'monthly',
      now: NOW,
    });
    assert.equal(res.extended, false);
    current = res.periodEndsAt!;
  }
  assert.equal(current.getTime(), periodEnd.getTime());
});

test('a genuine new payment stacks the period from the future end (monotonic)', () => {
  const futureEnd = plusMonth(NOW);
  const res = resolveSubscriptionRenewal({
    mappedStatus: 'ACTIVE',
    incomingPaymentId: 'pay-2', // different from last applied
    previousStatus: 'ACTIVE',
    lastAppliedPaymentId: 'pay-1',
    currentPeriodEndsAt: futureEnd,
    billingCycle: 'monthly',
    now: NOW,
  });
  assert.equal(res.extended, true);
  assert.equal(res.periodEndsAt?.getTime(), plusMonth(futureEnd).getTime());
});

test('a new payment after the period lapsed extends from now, not the stale end', () => {
  const pastEnd = new Date('2026-01-01T00:00:00.000Z'); // before NOW
  const res = resolveSubscriptionRenewal({
    mappedStatus: 'ACTIVE',
    incomingPaymentId: 'pay-2',
    previousStatus: 'ACTIVE',
    lastAppliedPaymentId: 'pay-1',
    currentPeriodEndsAt: pastEnd,
    billingCycle: 'monthly',
    now: NOW,
  });
  assert.equal(res.extended, true);
  assert.equal(res.periodEndsAt?.getTime(), plusMonth(NOW).getTime());
});

test('non-ACTIVE events leave the period untouched', () => {
  const periodEnd = plusMonth(NOW);
  for (const status of ['PENDING', 'REJECTED', 'CANCELED']) {
    const res = resolveSubscriptionRenewal({
      mappedStatus: status,
      incomingPaymentId: 'pay-9',
      previousStatus: 'ACTIVE',
      lastAppliedPaymentId: 'pay-1',
      currentPeriodEndsAt: periodEnd,
      billingCycle: 'monthly',
      now: NOW,
    });
    assert.equal(res.extended, false);
    assert.equal(res.periodEndsAt, periodEnd);
  }
});
