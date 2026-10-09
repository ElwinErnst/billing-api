import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { getMetadataArgsStorage } from 'typeorm';
import { BillingService } from './billing.service';
import { BillingCustomerEntity } from './entities/billing-customer.entity';
import { BillingPeriodCloseEntity } from './entities/billing-period-close.entity';
import { BillingSubscriptionEntity } from './entities/billing-subscription.entity';

const auth = { sub: 'user-1', tenantId: 'tenant-1', roles: ['OWNER'] } as const;
const dto = {
  industry: 'GENERAL' as const,
  tier: 'BASE' as const,
  billingCycle: 'monthly' as const,
  billingEmail: 'billing@example.test',
};

function columnNullable(entity: Function, propertyName: string) {
  return getMetadataArgsStorage().columns.find(
    (column) => column.target === entity && column.propertyName === propertyName,
  )?.options.nullable;
}

test('platform subscription and period-close tenant columns are nullable in ORM metadata', () => {
  assert.equal(columnNullable(BillingSubscriptionEntity, 'tenantId'), true);
  assert.equal(columnNullable(BillingPeriodCloseEntity, 'tenantId'), true);
});

test('account customer persistence keeps tenant customer identity separate', async () => {
  const rows: Array<Record<string, unknown>> = [
    { id: 'tenant-customer', tenantId: 'tenant-1', billingAccountId: null },
  ];
  const service = Object.create(BillingService.prototype) as BillingService;
  Object.defineProperty(service, 'billing', { value: { provider: 'mock' } });
  (service as any).customersRepo = {
    findOne: async ({ where }: any) => rows.find((row) => row.billingAccountId === where.billingAccountId) ?? null,
    create: (row: Record<string, unknown>) => row,
    save: async (row: Record<string, unknown>) => {
      if (row.tenantId != null && rows.some((existing) => existing.tenantId === row.tenantId)) {
        throw new Error('unique tenant_id violation');
      }
      rows.push(row);
      return row;
    },
  };

  const accountCustomer = await (service as any).findOrCreateBillingAccountCustomer(
    { billingAccountId: 'billing-1', coveredTenantIds: ['tenant-1', 'tenant-2'] },
    dto,
  );

  assert.equal(accountCustomer.tenantId, null);
  assert.equal(accountCustomer.billingAccountId, 'billing-1');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].tenantId, 'tenant-1');
});

test('direct checkout is rejected when an active account subscription already covers the tenant', async () => {
  const service = Object.create(BillingService.prototype) as BillingService;
  let providerCheckoutCalled = false;
  Object.defineProperty(service, 'billing', { value: { provider: 'mock' } });
  (service as any).findReusablePendingCheckout = async () => null;
  (service as any).createMockCheckoutSession = async () => {
    providerCheckoutCalled = true;
  };
  (service as any).subscriptionsRepo = {
    findOne: async () => null,
    find: async ({ where }: any) => where.status && where.billingAccountId
      ? [{ id: 'platform-1', status: 'ACTIVE', coveredTenantIds: ['tenant-1'] }]
      : [],
  };

  await assert.rejects(
    (service as any).createCheckoutSessionForOwner(auth, dto, {
      tenantId: 'tenant-1', billingAccountId: null, organizationId: null,
      coveredTenantIds: null, clientAppId: null, environmentId: null,
    }),
    /already covered by an organization platform subscription/i,
  );
  assert.equal(providerCheckoutCalled, false);
});

test('account checkout is rejected when covered tenant has a pending direct checkout', async () => {
  const service = Object.create(BillingService.prototype) as BillingService;
  let providerCheckoutCalled = false;
  Object.defineProperty(service, 'billing', { value: { provider: 'mock' } });
  (service as any).findReusablePendingCheckout = async () => null;
  (service as any).createMockCheckoutSession = async () => {
    providerCheckoutCalled = true;
  };
  (service as any).subscriptionsRepo = {
    findOne: async () => null,
    find: async ({ where }: any) => where.tenantId
      ? [{ id: 'direct-1', status: 'PENDING', tenantId: 'tenant-1', billingAccountId: null }]
      : [],
  };

  await assert.rejects(
    (service as any).createCheckoutSessionForOwner(auth, dto, {
      tenantId: null, billingAccountId: 'billing-1', organizationId: 'org-1',
      coveredTenantIds: ['tenant-1'], clientAppId: null, environmentId: null,
    }),
    /cancel existing tenant subscriptions/i,
  );
  assert.equal(providerCheckoutCalled, false);
});

test('canceling one subscription retains another active subscription entitlement', async () => {
  const profiles: Array<{ tenantId: string; planCode: string }> = [];
  const current = {
    id: 'account-sub', tenantId: null, billingAccountId: 'billing-1',
    coveredTenantIds: ['tenant-1'], status: 'CANCELED', basePlan: 'BASE',
    industryPackage: 'GENERAL', apiAddons: [],
  };
  const other = {
    id: 'direct-sub', tenantId: 'tenant-1', billingAccountId: null,
    coveredTenantIds: null, status: 'ACTIVE', basePlan: 'GROWTH',
    industryPackage: 'GENERAL', apiAddons: [],
  };
  const service = Object.create(BillingService.prototype) as BillingService;
  (service as any).authDirectory = {
    getTenant: async () => ({ billingBypass: false }),
    updateTenantBillingProfile: async (tenantId: string, profile: any) => profiles.push({ tenantId, planCode: profile.planCode }),
  };
  (service as any).subscriptionsRepo = { find: async () => [other] };
  (service as any).audit = { emit: async () => undefined };

  await (service as any).applyTenantPlanFromSubscription(current);

  assert.deepEqual(profiles, [{ tenantId: 'tenant-1', planCode: 'GROWTH' }]);
});

test('a changed mock checkout coverage safely abandons the prior pending checkout', async () => {
  const pending = {
    id: 'pending-1', provider: 'mock', status: 'PENDING',
    providerCheckoutSessionId: 'mock_chk_old', checkoutUrl: 'https://checkout.test/old',
    billingAccountId: 'billing-1', organizationId: 'org-1',
    coveredTenantIds: ['tenant-1'], basePlan: 'BASE', industryPackage: 'GENERAL',
    billingCycle: 'monthly', seats: 1, apiAddons: [],
  };
  const saved: Array<Record<string, unknown>> = [];
  const service = Object.create(BillingService.prototype) as BillingService;
  Object.defineProperty(service, 'billing', { value: { provider: 'mock' } });
  (service as any).subscriptionsRepo = {
    find: async ({ where }: any) => where.status === 'PENDING' ? [pending] : [],
    findOne: async () => null,
    save: async (row: Record<string, unknown>) => { saved.push({ ...row }); return row; },
  };
  (service as any).customersRepo = {
    findOne: async () => ({ id: 'account-customer', tenantId: null, billingAccountId: 'billing-1' }),
    save: async (row: Record<string, unknown>) => row,
  };
  let checkoutCreated = false;
  (service as any).createMockCheckoutSession = async () => {
    checkoutCreated = true;
    return { subscriptionId: 'new' };
  };

  await (service as any).createCheckoutSessionForOwner(auth, dto, {
    tenantId: null, billingAccountId: 'billing-1', organizationId: 'org-1',
    coveredTenantIds: ['tenant-1', 'tenant-2'], clientAppId: null, environmentId: null,
  });

  assert.equal(saved[0].status, 'CANCELED');
  assert.equal(saved[0].checkoutUrl, null);
  assert.equal(saved[0].providerCheckoutSessionId, null);
  assert.equal(checkoutCreated, true);
});

test('an open Stripe pending checkout is expired at provider before local replacement', async () => {
  const pending = {
    id: 'pending-stripe', provider: 'stripe', status: 'PENDING',
    providerCheckoutSessionId: 'cs_open', checkoutUrl: 'https://checkout.test/open',
  };
  let expireCalled = false;
  const service = Object.create(BillingService.prototype) as BillingService;
  Object.defineProperty(service, 'billing', { value: { stripeSecretKey: 'test' } });
  (service as any).stripeClient = {
    checkout: { sessions: {
      retrieve: async () => ({ status: 'open' }),
      expire: async () => { expireCalled = true; return { status: 'expired' }; },
    } },
  };
  (service as any).subscriptionsRepo = { save: async (row: Record<string, unknown>) => row };

  await (service as any).abandonPendingCheckout(pending);

  assert.equal(expireCalled, true);
  assert.equal(pending.status, 'CANCELED');
  assert.equal(pending.checkoutUrl, null);
});

test('late provider notifications cannot reactivate an abandoned checkout', () => {
  const service = Object.create(BillingService.prototype) as BillingService;
  const abandoned = {
    status: 'CANCELED', providerSubscriptionId: null,
    providerCheckoutSessionId: null, checkoutUrl: null,
  };
  const canceledSubscription = {
    status: 'CANCELED', providerSubscriptionId: 'sub_old',
    providerCheckoutSessionId: null, checkoutUrl: null,
  };

  assert.equal((service as any).isAbandonedPendingCheckout(abandoned), true);
  assert.equal((service as any).isAbandonedPendingCheckout(canceledSubscription), false);
});

test('a Mercado Pago preference is expired at provider before local replacement', async () => {
  const pending = {
    id: 'pending-mp', provider: 'mercadopago', status: 'PENDING',
    providerCheckoutSessionId: 'preference-1', checkoutUrl: 'https://checkout.test/mp',
  };
  let updateBody: Record<string, unknown> | null = null;
  const service = Object.create(BillingService.prototype) as BillingService;
  (service as any).mercadoPagoPreferenceClient = {
    get: async () => ({ expires: false, items: [{ title: 'Platform plan' }] }),
    update: async ({ updatePreferenceRequest }: any) => {
      updateBody = updatePreferenceRequest;
      return {
        expires: true,
        expiration_date_to: updatePreferenceRequest.expiration_date_to,
      };
    },
  };
  (service as any).subscriptionsRepo = { save: async (row: Record<string, unknown>) => row };

  await (service as any).abandonPendingCheckout(pending);

  assert.equal((updateBody?.items as unknown[]).length, 1);
  assert.equal(updateBody?.expires, true);
  assert.equal(pending.status, 'CANCELED');
  assert.equal(pending.checkoutUrl, null);
});
