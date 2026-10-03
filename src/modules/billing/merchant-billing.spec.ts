import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { AccessTokenPayload } from '../auth/types/access-token-payload.type';
import { MerchantBillingService } from './merchant-billing.service';

function memoryRepository() {
  const rows: Array<Record<string, any>> = [];
  let nextId = 1;
  const matches = (row: Record<string, any>, where: Record<string, any>) =>
    Object.entries(where).every(([key, value]) => row[key] === value);

  return {
    rows,
    create: (value: Record<string, any>) => ({ ...value }),
    save: async (value: Record<string, any>) => {
      const row = value.id
        ? rows.find((candidate) => candidate.id === value.id) ?? value
        : value;
      if (!row.id) row.id = `id-${nextId++}`;
      if (!row.createdAt) row.createdAt = new Date();
      row.updatedAt = new Date();
      if (!rows.includes(row)) rows.push(row);
      return row;
    },
    findOne: async ({ where }: { where: Record<string, any> }) =>
      rows.find((row) => matches(row, where)) ?? null,
    find: async ({ where }: { where: Record<string, any> }) =>
      rows.filter((row) => matches(row, where)),
  };
}

function createService() {
  const merchants = memoryRepository();
  const products = memoryRepository();
  const prices = memoryRepository();
  const customers = memoryRepository();
  const subscriptions = memoryRepository();
  const service = new MerchantBillingService(
    merchants as any,
    products as any,
    prices as any,
    customers as any,
    subscriptions as any,
  );
  return { service, merchants, products, prices, customers, subscriptions };
}

const tenantOwner: AccessTokenPayload = {
  sub: 'owner-user',
  tenantId: 'saas-tenant',
  roles: ['OWNER'],
};

test('merchant owner can define catalog, customer, and subscription in isolated merchant tables', async () => {
  const { service, merchants, products, prices, customers, subscriptions } = createService();
  const merchant = await service.createMerchant(tenantOwner, { name: 'Northwind SaaS' });
  const product = await service.createProduct(tenantOwner, merchant.id, {
    name: 'Analytics',
    description: 'Monthly analytics subscription',
  });
  const price = await service.createPrice(tenantOwner, merchant.id, product.id, {
    currency: 'USD',
    unitAmountCents: 4900,
    billingInterval: 'monthly',
  });
  const customer = await service.createCustomer(tenantOwner, merchant.id, {
    externalCustomerId: 'customer-acme',
    externalTenantId: 'acme-workspace',
    name: 'Acme',
    email: 'billing@acme.test',
  });
  const subscription = await service.createSubscription(tenantOwner, merchant.id, {
    customerId: customer.id,
    priceId: price.id,
  });

  assert.equal(merchant.ownerTenantId, tenantOwner.tenantId);
  assert.equal(customer.externalTenantId, 'acme-workspace');
  assert.equal(subscription.status, 'active');
  assert.ok(subscription.currentPeriodEndsAt > subscription.currentPeriodStartedAt);
  assert.equal(merchants.rows.length, 1);
  assert.equal(products.rows.length, 1);
  assert.equal(prices.rows.length, 1);
  assert.equal(customers.rows.length, 1);
  assert.equal(subscriptions.rows.length, 1);
});

test('merchant IDs are tenant-scoped and cross-tenant callers cannot enumerate or mutate them', async () => {
  const { service, merchants, products } = createService();
  const merchant = await service.createMerchant(tenantOwner, { name: 'Private merchant' });
  const otherOwner = { ...tenantOwner, tenantId: 'different-saas-tenant' };

  await assert.rejects(
    service.listProducts(otherOwner, merchant.id),
    (error: unknown) => error instanceof NotFoundException,
  );
  await assert.rejects(
    service.createProduct(otherOwner, merchant.id, { name: 'Unauthorized' }),
    (error: unknown) => error instanceof NotFoundException,
  );
  assert.equal(merchants.rows.length, 1);
  assert.equal(products.rows.length, 0);
});

test('merchant subscriptions require customer and price ownership by that merchant', async () => {
  const { service } = createService();
  const first = await service.createMerchant(tenantOwner, { name: 'Merchant One' });
  const second = await service.createMerchant(tenantOwner, { name: 'Merchant Two' });
  const product = await service.createProduct(tenantOwner, second.id, { name: 'Second product' });
  const price = await service.createPrice(tenantOwner, second.id, product.id, {
    currency: 'EUR',
    unitAmountCents: 1500,
    billingInterval: 'yearly',
  });
  const customer = await service.createCustomer(tenantOwner, second.id, {
    externalCustomerId: 'customer-2',
  });

  await assert.rejects(
    service.createSubscription(tenantOwner, first.id, {
      customerId: customer.id,
      priceId: price.id,
    }),
    (error: unknown) => error instanceof NotFoundException,
  );
});

test('merchant external customer IDs are unique within the merchant boundary', async () => {
  const { service } = createService();
  const merchant = await service.createMerchant(tenantOwner, { name: 'Merchant' });
  await service.createCustomer(tenantOwner, merchant.id, {
    externalCustomerId: 'customer-1',
  });

  await assert.rejects(
    service.createCustomer(tenantOwner, merchant.id, {
      externalCustomerId: 'customer-1',
    }),
    (error: unknown) => error instanceof ConflictException,
  );
});

test('service accounts cannot manage merchant catalog or subscriptions', async () => {
  const { service, merchants } = createService();
  const serviceToken = { ...tenantOwner, actorType: 'service_account' as const };

  await assert.rejects(service.createMerchant(serviceToken, { name: 'No' }));
  assert.equal(merchants.rows.length, 0);
});

test('merchant cancellation is idempotent and does not touch platform billing repositories', async () => {
  const { service, subscriptions } = createService();
  const merchant = await service.createMerchant(tenantOwner, { name: 'Merchant' });
  const product = await service.createProduct(tenantOwner, merchant.id, { name: 'Plan' });
  const price = await service.createPrice(tenantOwner, merchant.id, product.id, {
    currency: 'USD',
    unitAmountCents: 1000,
    billingInterval: 'monthly',
  });
  const customer = await service.createCustomer(tenantOwner, merchant.id, {
    externalCustomerId: 'customer-1',
  });
  const created = await service.createSubscription(tenantOwner, merchant.id, {
    customerId: customer.id,
    priceId: price.id,
  });

  const canceled = await service.cancelSubscription(tenantOwner, merchant.id, created.id);
  const canceledAgain = await service.cancelSubscription(tenantOwner, merchant.id, created.id);

  assert.equal(canceled.status, 'canceled');
  assert.equal(canceledAgain.status, 'canceled');
  assert.equal(subscriptions.rows.length, 1);
  assert.equal(subscriptions.rows[0].canceledAt.getTime(), canceled.canceledAt.getTime());
});
