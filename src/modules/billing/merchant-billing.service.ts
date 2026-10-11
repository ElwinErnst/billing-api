import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AccessTokenPayload } from '../auth/types/access-token-payload.type';
import { CreateMerchantAccountDto } from './dto/create-merchant-account.dto';
import { CreateMerchantCustomerDto } from './dto/create-merchant-customer.dto';
import { CreateMerchantPriceDto } from './dto/create-merchant-price.dto';
import { CreateMerchantProductDto } from './dto/create-merchant-product.dto';
import { CreateMerchantSubscriptionDto } from './dto/create-merchant-subscription.dto';
import { MerchantAccountEntity } from './entities/merchant-account.entity';
import { MerchantCustomerEntity } from './entities/merchant-customer.entity';
import { MerchantPriceEntity } from './entities/merchant-price.entity';
import { MerchantProductEntity } from './entities/merchant-product.entity';
import { MerchantSubscriptionEntity } from './entities/merchant-subscription.entity';
import { MerchantProviderConnectionEntity } from './entities/merchant-provider-connection.entity';

@Injectable()
export class MerchantBillingService {
  constructor(
    @InjectRepository(MerchantAccountEntity)
    private readonly merchantsRepo: Repository<MerchantAccountEntity>,
    @InjectRepository(MerchantProductEntity)
    private readonly productsRepo: Repository<MerchantProductEntity>,
    @InjectRepository(MerchantPriceEntity)
    private readonly pricesRepo: Repository<MerchantPriceEntity>,
    @InjectRepository(MerchantCustomerEntity)
    private readonly customersRepo: Repository<MerchantCustomerEntity>,
    @InjectRepository(MerchantSubscriptionEntity)
    private readonly subscriptionsRepo: Repository<MerchantSubscriptionEntity>,
    @InjectRepository(MerchantProviderConnectionEntity)
    private readonly providerConnectionsRepo: Repository<MerchantProviderConnectionEntity>,
  ) {}

  async createMerchant(auth: AccessTokenPayload, dto: CreateMerchantAccountDto) {
    this.assertTenantOwner(auth);
    const merchant = await this.merchantsRepo.save(this.merchantsRepo.create({
      ownerTenantId: auth.tenantId,
      name: dto.name.trim(),
      status: 'active',
    }));
    return this.serializeMerchant(merchant);
  }

  async listMerchants(auth: AccessTokenPayload) {
    this.assertTenantOwner(auth);
    const merchants = await this.merchantsRepo.find({
      where: { ownerTenantId: auth.tenantId },
      order: { createdAt: 'ASC' },
    });
    return merchants.map((merchant) => this.serializeMerchant(merchant));
  }

  async createProduct(
    auth: AccessTokenPayload,
    merchantId: string,
    dto: CreateMerchantProductDto,
  ) {
    await this.requireMerchant(auth, merchantId);
    const product = await this.productsRepo.save(this.productsRepo.create({
      merchantId,
      name: dto.name.trim(),
      description: dto.description?.trim() || null,
      status: 'active',
    }));
    return this.serializeProduct(product);
  }

  async listProducts(auth: AccessTokenPayload, merchantId: string) {
    await this.requireMerchant(auth, merchantId);
    const products = await this.productsRepo.find({
      where: { merchantId },
      order: { createdAt: 'ASC' },
    });
    return products.map((product) => this.serializeProduct(product));
  }

  async archiveProduct(
    auth: AccessTokenPayload,
    merchantId: string,
    productId: string,
  ) {
    await this.requireMerchant(auth, merchantId);
    const product = await this.productsRepo.findOne({
      where: { id: productId, merchantId },
    });
    if (!product) throw new NotFoundException('Merchant product not found');
    product.status = 'archived';
    return this.serializeProduct(await this.productsRepo.save(product));
  }

  async createPrice(
    auth: AccessTokenPayload,
    merchantId: string,
    productId: string,
    dto: CreateMerchantPriceDto,
  ) {
    await this.requireMerchant(auth, merchantId);
    const product = await this.productsRepo.findOne({
      where: { id: productId, merchantId, status: 'active' },
    });
    if (!product) throw new NotFoundException('Active merchant product not found');
    const price = await this.pricesRepo.save(this.pricesRepo.create({
      merchantId,
      productId,
      currency: dto.currency,
      unitAmountCents: dto.unitAmountCents,
      billingInterval: dto.billingInterval,
      status: 'active',
    }));
    return this.serializePrice(price);
  }

  async listPrices(
    auth: AccessTokenPayload,
    merchantId: string,
    productId: string,
  ) {
    await this.requireMerchant(auth, merchantId);
    const product = await this.productsRepo.findOne({
      where: { id: productId, merchantId },
    });
    if (!product) throw new NotFoundException('Merchant product not found');
    const prices = await this.pricesRepo.find({
      where: { merchantId, productId },
      order: { createdAt: 'ASC' },
    });
    return prices.map((price) => this.serializePrice(price));
  }

  async archivePrice(
    auth: AccessTokenPayload,
    merchantId: string,
    priceId: string,
  ) {
    await this.requireMerchant(auth, merchantId);
    const price = await this.pricesRepo.findOne({
      where: { id: priceId, merchantId },
    });
    if (!price) throw new NotFoundException('Merchant price not found');
    price.status = 'archived';
    return this.serializePrice(await this.pricesRepo.save(price));
  }

  async createCustomer(
    auth: AccessTokenPayload,
    merchantId: string,
    dto: CreateMerchantCustomerDto,
  ) {
    await this.requireMerchant(auth, merchantId);
    const externalCustomerId = dto.externalCustomerId.trim();
    const existing = await this.customersRepo.findOne({
      where: { merchantId, externalCustomerId },
    });
    if (existing) {
      throw new ConflictException('Merchant customer already exists');
    }
    const customer = await this.customersRepo.save(this.customersRepo.create({
      merchantId,
      externalCustomerId,
      externalTenantId: dto.externalTenantId?.trim() || null,
      name: dto.name?.trim() || null,
      email: dto.email?.trim() || null,
    }));
    return this.serializeCustomer(customer);
  }

  async listCustomers(auth: AccessTokenPayload, merchantId: string) {
    await this.requireMerchant(auth, merchantId);
    const customers = await this.customersRepo.find({
      where: { merchantId },
      order: { createdAt: 'ASC' },
    });
    return customers.map((customer) => this.serializeCustomer(customer));
  }

  async createSubscription(
    auth: AccessTokenPayload,
    merchantId: string,
    dto: CreateMerchantSubscriptionDto,
  ) {
    await this.requireMerchant(auth, merchantId);
    if (Boolean(dto.providerConnectionId) !== Boolean(dto.providerSubscriptionId)) {
      throw new ConflictException('Provider connection and subscription ID must be supplied together');
    }
    if (dto.providerConnectionId) {
      const providerConnection = await this.providerConnectionsRepo.findOne({
        where: { id: dto.providerConnectionId, merchantId, status: 'active' },
      });
      if (!providerConnection) throw new NotFoundException('Active merchant provider connection not found');
    }
    const [customer, price] = await Promise.all([
      this.customersRepo.findOne({ where: { id: dto.customerId, merchantId } }),
      this.pricesRepo.findOne({
        where: { id: dto.priceId, merchantId, status: 'active' },
      }),
    ]);
    if (!customer) throw new NotFoundException('Merchant customer not found');
    if (!price) throw new NotFoundException('Active merchant price not found');

    const product = await this.productsRepo.findOne({
      where: { id: price.productId, merchantId, status: 'active' },
    });
    if (!product) throw new NotFoundException('Active merchant product not found');

    const startedAt = new Date();
    const subscription = await this.subscriptionsRepo.save(
      this.subscriptionsRepo.create({
        merchantId,
        customerId: customer.id,
        productId: product.id,
        priceId: price.id,
        providerConnectionId: dto.providerConnectionId ?? null,
        providerSubscriptionId: dto.providerSubscriptionId?.trim() || null,
        status: 'active',
        currentPeriodStartedAt: startedAt,
        currentPeriodEndsAt: this.nextPeriodEnd(startedAt, price.billingInterval),
        canceledAt: null,
      }),
    );
    return this.serializeSubscription(subscription);
  }

  async listSubscriptions(auth: AccessTokenPayload, merchantId: string) {
    await this.requireMerchant(auth, merchantId);
    const subscriptions = await this.subscriptionsRepo.find({
      where: { merchantId },
      order: { createdAt: 'DESC' },
    });
    return subscriptions.map((subscription) => this.serializeSubscription(subscription));
  }

  async cancelSubscription(
    auth: AccessTokenPayload,
    merchantId: string,
    subscriptionId: string,
  ) {
    await this.requireMerchant(auth, merchantId);
    const subscription = await this.subscriptionsRepo.findOne({
      where: { id: subscriptionId, merchantId },
    });
    if (!subscription) throw new NotFoundException('Merchant subscription not found');
    if (subscription.status !== 'canceled') {
      subscription.status = 'canceled';
      subscription.canceledAt = new Date();
    }
    return this.serializeSubscription(await this.subscriptionsRepo.save(subscription));
  }

  private async requireMerchant(auth: AccessTokenPayload, merchantId: string) {
    this.assertTenantOwner(auth);
    const merchant = await this.merchantsRepo.findOne({
      where: { id: merchantId, ownerTenantId: auth.tenantId },
    });
    if (!merchant) throw new NotFoundException('Merchant account not found');
    if (merchant.status !== 'active') {
      throw new ForbiddenException('Merchant account is disabled');
    }
    return merchant;
  }

  private assertTenantOwner(auth: AccessTokenPayload) {
    if (auth.actorType === 'service_account' || !auth.roles.includes('OWNER')) {
      throw new ForbiddenException('Only tenant owners can manage merchant billing');
    }
  }

  private nextPeriodEnd(startedAt: Date, interval: 'monthly' | 'yearly') {
    const end = new Date(startedAt);
    const originalDay = end.getUTCDate();
    end.setUTCDate(1);
    if (interval === 'monthly') {
      end.setUTCMonth(end.getUTCMonth() + 1);
    } else {
      end.setUTCFullYear(end.getUTCFullYear() + 1);
    }
    const lastDay = new Date(Date.UTC(
      end.getUTCFullYear(),
      end.getUTCMonth() + 1,
      0,
    )).getUTCDate();
    end.setUTCDate(Math.min(originalDay, lastDay));
    return end;
  }

  private serializeMerchant(merchant: MerchantAccountEntity) {
    return {
      id: merchant.id,
      ownerTenantId: merchant.ownerTenantId,
      name: merchant.name,
      status: merchant.status,
      createdAt: merchant.createdAt,
      updatedAt: merchant.updatedAt,
    };
  }

  private serializeProduct(product: MerchantProductEntity) {
    return {
      id: product.id,
      merchantId: product.merchantId,
      name: product.name,
      description: product.description,
      status: product.status,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
    };
  }

  private serializePrice(price: MerchantPriceEntity) {
    return {
      id: price.id,
      merchantId: price.merchantId,
      productId: price.productId,
      currency: price.currency,
      unitAmountCents: price.unitAmountCents,
      billingInterval: price.billingInterval,
      status: price.status,
      createdAt: price.createdAt,
      updatedAt: price.updatedAt,
    };
  }

  private serializeCustomer(customer: MerchantCustomerEntity) {
    return {
      id: customer.id,
      merchantId: customer.merchantId,
      externalCustomerId: customer.externalCustomerId,
      externalTenantId: customer.externalTenantId,
      name: customer.name,
      email: customer.email,
      createdAt: customer.createdAt,
      updatedAt: customer.updatedAt,
    };
  }

  private serializeSubscription(subscription: MerchantSubscriptionEntity) {
    return {
      id: subscription.id,
      merchantId: subscription.merchantId,
      customerId: subscription.customerId,
      productId: subscription.productId,
      priceId: subscription.priceId,
      providerConnectionId: subscription.providerConnectionId,
      providerSubscriptionId: subscription.providerSubscriptionId,
      status: subscription.status,
      currentPeriodStartedAt: subscription.currentPeriodStartedAt,
      currentPeriodEndsAt: subscription.currentPeriodEndsAt,
      canceledAt: subscription.canceledAt,
      createdAt: subscription.createdAt,
      updatedAt: subscription.updatedAt,
    };
  }
}
