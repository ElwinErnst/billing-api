import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { hasMatchingPlatformAuthorization } from './platform-subscription-ownership';

const authorization = {
  organizationId: 'org-1',
  billingAccountId: 'billing-1',
  coveredTenantIds: ['tenant-1', 'tenant-2'],
};

test('accepts the Auth authorization for the same account and tenant set regardless of order', () => {
  assert.equal(
    hasMatchingPlatformAuthorization(authorization, {
      ...authorization,
      coveredTenantIds: ['tenant-2', 'tenant-1'],
    }),
    true,
  );
});

test('rejects mismatched account, organization, or covered tenants', () => {
  assert.equal(
    hasMatchingPlatformAuthorization(authorization, {
      ...authorization,
      billingAccountId: 'billing-other',
    }),
    false,
  );
  assert.equal(
    hasMatchingPlatformAuthorization(authorization, {
      ...authorization,
      organizationId: 'org-other',
    }),
    false,
  );
  assert.equal(
    hasMatchingPlatformAuthorization(authorization, {
      ...authorization,
      coveredTenantIds: ['tenant-1'],
    }),
    false,
  );
});
