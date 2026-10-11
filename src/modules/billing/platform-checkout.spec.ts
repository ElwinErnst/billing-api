import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { BillingService } from './billing.service';

const auth = { sub: 'user-1', tenantId: 'current-tenant', roles: ['OWNER'] } as const;
const input = {
  organizationId: 'org-1',
  billingAccountId: 'billing-1',
  coveredTenantIds: ['tenant-1', 'tenant-2'],
  industry: 'GENERAL' as const,
  tier: 'BASE' as const,
  billingCycle: 'monthly' as const,
};

test('platform checkout uses only the Auth-authorized account and tenant set', async () => {
  const authDirectory = {
    authorizePlatformSubscription: async () => ({
      organizationId: 'org-1',
      billingAccountId: 'billing-1',
      coveredTenantIds: ['tenant-2', 'tenant-1'],
    }),
  };
  const service = Object.create(BillingService.prototype) as BillingService;
  (service as any).authDirectory = authDirectory;
  let receivedOwner: unknown;
  (service as any).createCheckoutSessionForOwner = async (
    _auth: unknown,
    _dto: unknown,
    owner: unknown,
  ) => {
    receivedOwner = owner;
    return { subscriptionId: 'subscription-1' };
  };

  await service.createPlatformCheckoutSession(auth, input);

  assert.deepEqual(receivedOwner, {
    tenantId: null,
    clientAppId: null,
    environmentId: null,
    billingAccountId: 'billing-1',
    organizationId: 'org-1',
    coveredTenantIds: ['tenant-2', 'tenant-1'],
  });
});

test('platform checkout rejects an Auth result that does not match requested coverage', async () => {
  const authDirectory = {
    authorizePlatformSubscription: async () => ({
      organizationId: 'org-1',
      billingAccountId: 'billing-1',
      coveredTenantIds: ['tenant-1'],
    }),
  };
  const service = Object.create(BillingService.prototype) as BillingService;
  (service as any).authDirectory = authDirectory;
  let checkoutStarted = false;
  (service as any).createCheckoutSessionForOwner = async () => {
    checkoutStarted = true;
  };

  await assert.rejects(
    service.createPlatformCheckoutSession(auth, input),
    /invalid platform subscription authorization/i,
  );
  assert.equal(checkoutStarted, false);
});

test('service-account tokens cannot initiate platform subscriptions', async () => {
  let authorizationCalled = false;
  const service = Object.create(BillingService.prototype) as BillingService;
  (service as any).authDirectory = {
    authorizePlatformSubscription: async () => {
      authorizationCalled = true;
      throw new Error('unexpected');
    },
  };

  await assert.rejects(
    service.createPlatformCheckoutSession(
      { ...auth, actorType: 'service_account' },
      input,
    ),
    /require a user account/i,
  );
  assert.equal(authorizationCalled, false);
});
