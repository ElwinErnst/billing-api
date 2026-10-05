import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { createHmac } from 'crypto';
import { ForbiddenException } from '@nestjs/common';
import { AccessTokenPayload } from '../auth/types/access-token-payload.type';
import { MerchantAccountEntity } from './entities/merchant-account.entity';
import { MerchantProviderConnectionEntity } from './entities/merchant-provider-connection.entity';
import { MerchantProviderEventEntity } from './entities/merchant-provider-event.entity';
import { MerchantSubscriptionEntity } from './entities/merchant-subscription.entity';
import { mercadoPagoNotificationIdentity, MerchantProviderService } from './merchant-provider.service';
import { SecretCipher } from './secret-cipher';

function repository(initial: any[] = []) {
  const rows = initial;
  const matches = (row: any, where: any) => Object.entries(where).every(([key, value]) => row[key] === value);
  return {
    rows,
    create: (value: any) => ({ ...value }),
    save: async (value: any) => {
      const old = value.id ? rows.find((row) => row.id === value.id) : null;
      if (old) Object.assign(old, value);
      else { value.id ??= `id-${rows.length + 1}`; value.createdAt ??= new Date(); rows.push(value); }
      return value;
    },
    findOne: async ({ where }: any) => rows.find((row) => matches(row, where)) ?? null,
    find: async ({ where }: any) => rows.filter((row) => matches(row, where)),
  };
}

function harness() {
  const merchants = repository([
    { id: 'merchant-a', ownerTenantId: 'tenant-a', status: 'active' },
    { id: 'merchant-b', ownerTenantId: 'tenant-b', status: 'active' },
  ]);
  const connections = repository();
  const subscriptions = repository();
  const events = repository();
  const manager = {
    createQueryBuilder: () => {
      const builder: any = {
        insert: () => builder,
        into: () => builder,
        values: (value: any) => { builder.value = value; return builder; },
        orIgnore: () => builder,
        returning: () => builder,
        execute: async () => {
          const found = events.rows.some((row) => row.connectionId === builder.value.connectionId && row.providerEventId === builder.value.providerEventId);
          if (found) return { identifiers: [] };
          await events.save(builder.value);
          return { identifiers: [{ id: 'event' }] };
        },
      };
      return builder;
    },
    getRepository: (entity: any) => entity === MerchantSubscriptionEntity ? subscriptions : events,
  };
  const dataSource = { transaction: async (work: (manager: any) => Promise<any>) => work(manager) };
  const cipher = new SecretCipher({ get: () => ({ secretEncryptionKey: 'a'.repeat(64) }) } as any);
  const service = new MerchantProviderService(merchants as any, connections as any, subscriptions as any, dataSource as any, cipher);
  return { service, merchants, connections, subscriptions, events };
}

const ownerA: AccessTokenPayload = { sub: 'owner-a', tenantId: 'tenant-a', roles: ['OWNER'] };
const ownerB: AccessTokenPayload = { sub: 'owner-b', tenantId: 'tenant-b', roles: ['OWNER'] };

test('merchant provider secrets are encrypted at rest and never serialized', async () => {
  const { service, connections } = harness();
  const connection = await service.createConnection(ownerA, 'merchant-a', {
    provider: 'stripe', accessSecret: 'sk_live_a', webhookSecret: 'whsec_a',
  });
  assert.equal(connection.merchantId, 'merchant-a');
  assert.equal('encryptedAccessSecret' in connection, false);
  assert.equal('accessSecret' in connection, false);
  assert.match(connections.rows[0].encryptedAccessSecret, /^v1:/);
  assert.notEqual(connections.rows[0].encryptedAccessSecret, 'sk_live_a');
  assert.deepEqual(await service.resolveCredentials(connection.id, 'merchant-a', 'stripe'), {
    accessSecret: 'sk_live_a', webhookSecret: 'whsec_a',
  });
  await assert.rejects(service.resolveCredentials(connection.id, 'merchant-b', 'stripe'));
});

test('merchant connection creation fails closed when the cipher key is unavailable', async () => {
  const { service } = harness();
  const unencrypted = new SecretCipher({ get: () => ({}) } as any);
  const unprotected = new MerchantProviderService(
    repository([{ id: 'merchant-a', ownerTenantId: 'tenant-a', status: 'active' }]) as any,
    repository() as any, repository() as any, { transaction: async () => undefined } as any, unencrypted,
  );
  await assert.rejects(
    unprotected.createConnection(ownerA, 'merchant-a', { provider: 'stripe', accessSecret: 'x', webhookSecret: 'y' }),
  );
  void service;
});

test('Stripe webhook signatures and reconciliation remain bound to one merchant connection', async () => {
  const { service, connections, subscriptions, events } = harness();
  const a = await service.createConnection(ownerA, 'merchant-a', { provider: 'stripe', accessSecret: 'sk_a', webhookSecret: 'whsec_a' });
  const b = await service.createConnection(ownerB, 'merchant-b', { provider: 'stripe', accessSecret: 'sk_b', webhookSecret: 'whsec_b' });
  subscriptions.rows.push({
    id: 'sub-a', merchantId: 'merchant-a', providerConnectionId: a.id,
    providerSubscriptionId: 'sub_external_a', status: 'active', canceledAt: null,
  });
  const event = { id: 'evt-1', type: 'customer.subscription.deleted', data: { object: { id: 'sub_external_a', status: 'canceled' } } };
  const raw = Buffer.from(JSON.stringify(event));
  const ts = Math.floor(Date.now() / 1000);
  const signature = `t=${ts},v1=${createHmac('sha256', 'whsec_b').update(`${ts}.${raw.toString()}`).digest('hex')}`;

  await service.handleStripeWebhook(b.id, raw, signature);
  assert.equal(subscriptions.rows[0].status, 'active');
  assert.equal(events.rows[0].merchantId, 'merchant-b');
  assert.equal(events.rows[0].connectionId, b.id);
  assert.notEqual(events.rows[0].merchantId, subscriptions.rows[0].merchantId);

  await assert.rejects(service.handleStripeWebhook(a.id, raw, signature), ForbiddenException);
  assert.equal(subscriptions.rows[0].status, 'active');
  assert.equal(connections.rows.length, 2);
});

test('duplicate verified provider event is idempotent', async () => {
  const { service, subscriptions, events } = harness();
  const connection = await service.createConnection(ownerA, 'merchant-a', { provider: 'stripe', accessSecret: 'sk_a', webhookSecret: 'whsec_a' });
  subscriptions.rows.push({
    id: 'sub-a', merchantId: 'merchant-a', providerConnectionId: connection.id,
    providerSubscriptionId: 'sub_external_a', status: 'active', canceledAt: null,
  });
  const event = { id: 'evt-duplicate', type: 'customer.subscription.deleted', data: { object: { id: 'sub_external_a', status: 'canceled' } } };
  const raw = Buffer.from(JSON.stringify(event));
  const ts = Math.floor(Date.now() / 1000);
  const signature = `t=${ts},v1=${createHmac('sha256', 'whsec_a').update(`${ts}.${raw.toString()}`).digest('hex')}`;
  await service.handleStripeWebhook(connection.id, raw, signature);
  subscriptions.rows[0].status = 'active';
  await service.handleStripeWebhook(connection.id, raw, signature);
  assert.equal(events.rows.length, 1);
  assert.equal(subscriptions.rows[0].status, 'active');
});

test('older signed Stripe event cannot reactivate a subscription after a newer cancellation', async () => {
  const { service, subscriptions } = harness();
  const connection = await service.createConnection(ownerA, 'merchant-a', { provider: 'stripe', accessSecret: 'sk_a', webhookSecret: 'whsec_a' });
  subscriptions.rows.push({
    id: 'sub-a', merchantId: 'merchant-a', providerConnectionId: connection.id,
    providerSubscriptionId: 'sub_external_a', status: 'active', canceledAt: null, providerEventCreatedAt: null,
  });
  const send = async (id: string, type: string, status: string, created: number) => {
    const raw = Buffer.from(JSON.stringify({ id, type, created, data: { object: { id: 'sub_external_a', status } } }));
    const ts = Math.floor(Date.now() / 1000);
    const signature = `t=${ts},v1=${createHmac('sha256', 'whsec_a').update(`${ts}.${raw.toString()}`).digest('hex')}`;
    await service.handleStripeWebhook(connection.id, raw, signature);
  };
  await send('evt-newer', 'customer.subscription.deleted', 'canceled', 200);
  await send('evt-older', 'customer.subscription.updated', 'active', 100);
  assert.equal(subscriptions.rows[0].status, 'canceled');
  assert.equal(subscriptions.rows[0].providerEventCreatedAt.toISOString(), new Date(200 * 1000).toISOString());
});

test('Mercado Pago rejects an event signed for a different merchant connection before recording it', async () => {
  const { service, events } = harness();
  const connection = await service.createConnection(ownerA, 'merchant-a', { provider: 'mercadopago', accessSecret: 'mp_a', webhookSecret: 'mp_whsec_a' });
  await assert.rejects(
    service.handleMercadoPagoWebhook(connection.id, 'preapproval-1', 'ts=1700000000,v1=invalid', 'request-1', 'subscription_preapproval'),
    ForbiddenException,
  );
  assert.equal(events.rows.length, 0);
});

test('Mercado Pago replay key distinguishes notifications for one subscription but is stable on retry', () => {
  const first = mercadoPagoNotificationIdentity('ts=1,v1=signed-a', 'request-a');
  const second = mercadoPagoNotificationIdentity('ts=2,v1=signed-b', 'request-b');
  assert.notEqual(first, second);
  assert.equal(first, mercadoPagoNotificationIdentity('ts=1,v1=signed-a', 'request-a'));
});
