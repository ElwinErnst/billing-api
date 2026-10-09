import {
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { MercadoPagoConfig, PreApproval } from 'mercadopago';
import Stripe from 'stripe';
import { DataSource, Repository } from 'typeorm';
import { AccessTokenPayload } from '../auth/types/access-token-payload.type';
import { CreateMerchantProviderConnectionDto } from './dto/create-merchant-provider-connection.dto';
import { MerchantAccountEntity } from './entities/merchant-account.entity';
import { MerchantProviderConnectionEntity } from './entities/merchant-provider-connection.entity';
import { MerchantProviderEventEntity } from './entities/merchant-provider-event.entity';
import { MerchantSubscriptionEntity } from './entities/merchant-subscription.entity';
import { SecretCipher } from './secret-cipher';
import { verifyMercadoPagoSignature } from './mercadopago-signature';

export function mercadoPagoNotificationIdentity(signature: string, requestId: string): string {
  return createHash('sha256').update(`${signature}\n${requestId}`).digest('hex');
}

@Injectable()
export class MerchantProviderService {
  constructor(
    @InjectRepository(MerchantAccountEntity)
    private readonly merchants: Repository<MerchantAccountEntity>,
    @InjectRepository(MerchantProviderConnectionEntity)
    private readonly connections: Repository<MerchantProviderConnectionEntity>,
    @InjectRepository(MerchantSubscriptionEntity)
    private readonly subscriptions: Repository<MerchantSubscriptionEntity>,
    private readonly dataSource: DataSource,
    private readonly cipher: SecretCipher,
  ) {}

  async createConnection(auth: AccessTokenPayload, merchantId: string, dto: CreateMerchantProviderConnectionDto) {
    await this.requireMerchant(auth, merchantId);
    if (!this.cipher.enabled) {
      throw new InternalServerErrorException('Merchant provider secrets require BILLING_SECRET_ENC_KEY');
    }
    const connection = this.connections.create({
      merchantId,
      clientAppId: dto.clientAppId ?? null,
      environmentId: dto.environmentId ?? null,
      provider: dto.provider,
      status: 'active',
      encryptedAccessSecret: this.cipher.encrypt(dto.accessSecret),
      encryptedWebhookSecret: this.cipher.encrypt(dto.webhookSecret),
    });
    return this.serialize(await this.connections.save(connection));
  }

  async listConnections(auth: AccessTokenPayload, merchantId: string) {
    await this.requireMerchant(auth, merchantId);
    const rows = await this.connections.find({ where: { merchantId }, order: { createdAt: 'ASC' } });
    return rows.map((row) => this.serialize(row));
  }

  async disableConnection(auth: AccessTokenPayload, merchantId: string, connectionId: string) {
    await this.requireMerchant(auth, merchantId);
    const connection = await this.connections.findOne({ where: { id: connectionId, merchantId } });
    if (!connection) throw new NotFoundException('Merchant provider connection not found');
    connection.status = 'disabled';
    return this.serialize(await this.connections.save(connection));
  }

  /** Resolve merchant credentials only from an active merchant-owned connection. */
  async resolveCredentials(connectionId: string, merchantId: string, provider: 'stripe' | 'mercadopago') {
    const connection = await this.connections.findOne({ where: { id: connectionId, merchantId, provider, status: 'active' } });
    if (!connection) throw new NotFoundException('Active merchant provider connection not found');
    try {
      return {
        accessSecret: this.cipher.decrypt(connection.encryptedAccessSecret),
        webhookSecret: this.cipher.decrypt(connection.encryptedWebhookSecret),
      };
    } catch {
      throw new InternalServerErrorException('Merchant provider credentials could not be resolved');
    }
  }

  async handleStripeWebhook(connectionId: string, rawBody: Buffer | undefined, signature: string | undefined) {
    if (!rawBody || !signature) throw new ForbiddenException('Missing Stripe webhook signature');
    const connection = await this.requireWebhookConnection(connectionId, 'stripe');
    const secrets = this.decryptSecrets(connection);
    let event: Stripe.Event;
    try {
      event = Stripe.webhooks.constructEvent(rawBody, signature, secrets.webhookSecret);
    } catch {
      throw new ForbiddenException('Invalid Stripe webhook signature');
    }
    const object = event.data.object as { id?: unknown; status?: unknown; current_period_start?: unknown; current_period_end?: unknown };
    if (event.type.startsWith('customer.subscription.') && typeof object.id === 'string') {
      await this.applySubscriptionEvent(connection, event.id, event.type, object.id, this.stripeStatus(event.type, object.status), object.current_period_start, object.current_period_end, event.created);
    } else {
      await this.recordEvent(connection, event.id, event.type);
    }
    return { received: true };
  }

  async handleMercadoPagoWebhook(connectionId: string, dataId: string | undefined, signature: string | undefined, requestId: string | undefined, eventType: string | undefined) {
    if (!dataId || !eventType) throw new ForbiddenException('Missing Mercado Pago webhook event identity');
    const connection = await this.requireWebhookConnection(connectionId, 'mercadopago');
    const secrets = this.decryptSecrets(connection);
    verifyMercadoPagoSignature({ dataId, signature, requestId }, secrets.webhookSecret);

    // MP signs the resource id in the query, not the JSON body. Fetch the
    // authoritative resource using this connection's own credential.
    if (!eventType.includes('subscription') && !eventType.includes('preapproval')) {
      await this.recordEvent(connection, `${eventType}:${dataId}`, eventType);
      return { received: true };
    }
    try {
      const provider = new MercadoPagoConfig({ accessToken: secrets.accessSecret });
      const preApproval = await new PreApproval(provider).get({ id: dataId });
    const notificationId = mercadoPagoNotificationIdentity(signature!, requestId!);
    await this.applySubscriptionEvent(
        connection,
        notificationId,
        eventType,
        dataId,
        preApproval.status === 'authorized' ? 'active' : 'canceled',
        preApproval.date_created ? Date.parse(preApproval.date_created) / 1000 : undefined,
        preApproval.next_payment_date ? Date.parse(preApproval.next_payment_date) / 1000 : undefined,
        Date.now() / 1000,
      );
    } catch (error) {
      if (error instanceof ForbiddenException || error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException('Mercado Pago webhook resource could not be verified');
    }
    return { received: true };
  }

  private async requireMerchant(auth: AccessTokenPayload, merchantId: string) {
    if (auth.actorType === 'service_account' || !auth.roles.includes('OWNER')) {
      throw new ForbiddenException('Only tenant owners can manage merchant billing');
    }
    const merchant = await this.merchants.findOne({ where: { id: merchantId, ownerTenantId: auth.tenantId, status: 'active' } });
    if (!merchant) throw new NotFoundException('Merchant account not found');
    return merchant;
  }

  private async requireWebhookConnection(connectionId: string, provider: 'stripe' | 'mercadopago') {
    const connection = await this.connections.findOne({ where: { id: connectionId, provider, status: 'active' } });
    if (!connection) throw new NotFoundException('Active merchant provider connection not found');
    return connection;
  }

  private decryptSecrets(connection: MerchantProviderConnectionEntity) {
    try {
      return {
        accessSecret: this.cipher.decrypt(connection.encryptedAccessSecret),
        webhookSecret: this.cipher.decrypt(connection.encryptedWebhookSecret),
      };
    } catch {
      throw new InternalServerErrorException('Merchant provider credentials could not be resolved');
    }
  }

  private async recordEvent(connection: MerchantProviderConnectionEntity, eventId: string, eventType: string) {
    await this.applySubscriptionEvent(connection, eventId, eventType, null, null);
  }

  private async applySubscriptionEvent(
    connection: MerchantProviderConnectionEntity,
    eventId: string,
    eventType: string,
    providerSubscriptionId: string | null,
    status: 'active' | 'canceled' | null,
    periodStart?: unknown,
    periodEnd?: unknown,
    eventCreatedAt?: number,
  ) {
    if (!eventId || eventId.length > 191) throw new ForbiddenException('Invalid provider event identity');
    await this.dataSource.transaction(async (manager) => {
      const insert = await manager.createQueryBuilder().insert().into(MerchantProviderEventEntity).values({
        merchantId: connection.merchantId,
        connectionId: connection.id,
        providerEventId: eventId,
        eventType,
      }).orIgnore().returning(['id']).execute();
      if (!insert.identifiers.length || !providerSubscriptionId || !status) return;

      const subscription = await manager.getRepository(MerchantSubscriptionEntity).findOne({
        where: { merchantId: connection.merchantId, providerConnectionId: connection.id, providerSubscriptionId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!subscription) return;
      const incomingEventAt = this.epochDate(eventCreatedAt);
      if (status === 'active' && subscription.status === 'canceled') return;
      if (status === 'active' && incomingEventAt && subscription.providerEventCreatedAt && incomingEventAt <= subscription.providerEventCreatedAt) return;
      if (status === 'canceled' && incomingEventAt && subscription.providerEventCreatedAt && incomingEventAt < subscription.providerEventCreatedAt) return;
      subscription.status = status;
      if (incomingEventAt) subscription.providerEventCreatedAt = incomingEventAt;
      subscription.canceledAt = status === 'canceled' ? (subscription.canceledAt ?? new Date()) : null;
      const start = this.epochDate(periodStart);
      const end = this.epochDate(periodEnd);
      if (start) subscription.currentPeriodStartedAt = start;
      if (end && (!start || end > start)) subscription.currentPeriodEndsAt = end;
      await manager.getRepository(MerchantSubscriptionEntity).save(subscription);
    });
  }

  private stripeStatus(type: string, rawStatus: unknown): 'active' | 'canceled' {
    if (type === 'customer.subscription.deleted') return 'canceled';
    return rawStatus === 'active' || rawStatus === 'trialing' ? 'active' : 'canceled';
  }

  private epochDate(value: unknown): Date | null {
    return typeof value === 'number' && Number.isFinite(value) ? new Date(value * 1000) : null;
  }

  private serialize(connection: MerchantProviderConnectionEntity) {
    return {
      id: connection.id,
      merchantId: connection.merchantId,
      provider: connection.provider,
      clientAppId: connection.clientAppId,
      environmentId: connection.environmentId,
      status: connection.status,
      createdAt: connection.createdAt,
      updatedAt: connection.updatedAt,
    };
  }
}
