import {
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
import { MercadoPagoConfig, Payment, Preference } from 'mercadopago';
import Stripe from 'stripe';
import { Repository } from 'typeorm';
import { AuthDirectoryService } from '../../common/modules/auth-directory/auth-directory.service';
import { AccessTokenPayload } from '../auth/types/access-token-payload.type';
import {
  BILLING_CATALOG,
  BillingApiAddonCode,
  BillingCatalogApiAddon,
  BillingCatalogOffer,
  BillingIndustryCode,
  BillingTierCode,
} from './billing.catalog';
import { CreateCheckoutSessionDto } from './dto/create-checkout-session.dto';
import { RecordUsageEventDto } from './dto/record-usage-event.dto';
import { BillingCustomerEntity } from './entities/billing-customer.entity';
import { BillingPeriodCloseEntity } from './entities/billing-period-close.entity';
import { BillingSubscriptionEntity } from './entities/billing-subscription.entity';
import { BillingUsageEventEntity } from './entities/billing-usage-event.entity';
import type { BillingConfig } from './types/billing-config.type';

@Injectable()
export class BillingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BillingService.name);
  private stripeClient: Stripe | null = null;
  private mercadoPagoClient: MercadoPagoConfig | null = null;
  private mercadoPagoPaymentClient: Payment | null = null;
  private mercadoPagoPreferenceClient: Preference | null = null;
  private closeDuePeriodsTimer: NodeJS.Timeout | null = null;

  constructor(
    @InjectRepository(BillingCustomerEntity)
    private readonly customersRepo: Repository<BillingCustomerEntity>,
    @InjectRepository(BillingPeriodCloseEntity)
    private readonly periodClosesRepo: Repository<BillingPeriodCloseEntity>,
    @InjectRepository(BillingSubscriptionEntity)
    private readonly subscriptionsRepo: Repository<BillingSubscriptionEntity>,
    @InjectRepository(BillingUsageEventEntity)
    private readonly usageEventsRepo: Repository<BillingUsageEventEntity>,
    private readonly configService: ConfigService,
    private readonly authDirectory: AuthDirectoryService,
  ) {}

  onModuleInit() {
    const intervalMs = this.billing.closeDuePeriodsIntervalMs;
    if (intervalMs <= 0) {
      return;
    }

    this.closeDuePeriodsTimer = setInterval(() => {
      void this.closeDuePeriods().catch((error: unknown) => {
        console.error('Failed to close due billing periods', error);
      });
    }, intervalMs);
  }

  onModuleDestroy() {
    if (this.closeDuePeriodsTimer) {
      clearInterval(this.closeDuePeriodsTimer);
      this.closeDuePeriodsTimer = null;
    }
  }

  getCatalog() {
    return BILLING_CATALOG;
  }

  async getTenantBillingOverview(tenantId: string) {
    const [customer, latestSubscription, recentPeriodClosures] = await Promise.all([
      this.customersRepo.findOne({ where: { tenantId } }),
      this.subscriptionsRepo.findOne({ where: { tenantId }, order: { createdAt: 'DESC' } }),
      this.periodClosesRepo.find({
        where: { tenantId },
        order: { closedAt: 'DESC' },
        take: 6,
      }),
    ]);
    const subscription = await this.enforceSubscriptionStanding(latestSubscription);
    const usage = await this.getUsageSummary(tenantId, subscription);

    return {
      tenantId,
      customer,
      subscription: this.serializeSubscription(subscription),
      usage,
      recentPeriodClosures: recentPeriodClosures.map((entry) => ({
        id: entry.id,
        subscriptionId: entry.subscriptionId,
        periodStartedAt: entry.periodStartedAt.toISOString(),
        periodEndedAt: entry.periodEndedAt.toISOString(),
        currency: entry.currency,
        baseAmountCents: entry.baseAmountCents,
        addonAmountCents: entry.addonAmountCents,
        overageAmountCents: entry.overageAmountCents,
        totalAmountCents: entry.totalAmountCents,
        summary: entry.summary,
        closedAt: entry.closedAt.toISOString(),
      })),
      catalog: BILLING_CATALOG,
      provider: this.billing.provider,
      publishableKey:
        this.billing.provider === 'stripe'
          ? this.billing.stripePublishableKey || null
          : this.billing.provider === 'mercadopago'
            ? this.billing.mercadopagoPublicKey || null
            : null,
    };
  }

  async createPortalSession(auth: AccessTokenPayload) {
    this.assertOwner(auth);

    const customer = await this.customersRepo.findOne({
      where: { tenantId: auth.tenantId },
    });

    if (!customer?.providerCustomerId) {
      throw new NotFoundException('No billing customer found for this tenant');
    }

    if (this.billing.provider !== 'stripe') {
      throw new ForbiddenException('Billing portal is only available with Stripe');
    }

    const stripe = this.getStripe();
    const session = await stripe.billingPortal.sessions.create({
      customer: customer.providerCustomerId,
      return_url: this.billing.portalReturnUrl,
    });

    return {
      provider: this.billing.provider,
      url: session.url,
    };
  }

  async createCheckoutSession(auth: AccessTokenPayload, dto: CreateCheckoutSessionDto) {
    this.assertOwner(auth);
    const offer = this.findOffer(dto.industry, dto.tier);
    const addOns = this.normalizeAddOns(dto.addOns);

    if (!offer.selfServe) {
      throw new ForbiddenException('This plan requires a sales process');
    }

    this.assertAddOnsAllowed(dto.tier, addOns);

    const seats = dto.seats ?? 1;
    const existingPendingCheckout = await this.findReusablePendingCheckout(
      auth.tenantId,
      dto,
      seats,
      addOns,
    );
    if (existingPendingCheckout) {
      return existingPendingCheckout;
    }

    await this.assertNoConflictingActiveSubscription(
      auth.tenantId,
      dto,
      seats,
      addOns,
    );

    const addonAmountCents = this.calculateAddonAmount(dto.billingCycle, addOns);
    const amountCents = this.calculateAmount(
      dto.industry,
      dto.tier,
      dto.billingCycle,
      seats,
      addOns,
    );
    const customer = await this.findOrCreateCustomer(auth.tenantId, dto);

    if (this.billing.provider === 'stripe') {
      return this.createStripeCheckoutSession(
        auth,
        dto,
        offer,
        seats,
        amountCents,
        addonAmountCents,
        addOns,
        customer,
      );
    }

    if (this.billing.provider === 'mercadopago') {
      return this.createMercadoPagoCheckoutSession(
        auth,
        dto,
        offer,
        seats,
        amountCents,
        addonAmountCents,
        addOns,
        customer,
      );
    }

    return this.createMockCheckoutSession(
      auth,
      dto,
      seats,
      amountCents,
      addonAmountCents,
      addOns,
      customer,
    );
  }

  async scheduleCancellation(auth: AccessTokenPayload) {
    this.assertOwner(auth);

    const activeSubscription = await this.subscriptionsRepo.findOne({
      where: { tenantId: auth.tenantId, status: 'ACTIVE' },
      order: { createdAt: 'DESC' },
    });

    const subscription = await this.enforceSubscriptionStanding(activeSubscription);
    if (!subscription || subscription.status !== 'ACTIVE') {
      throw new NotFoundException('No active subscription found for this tenant');
    }

    subscription.cancelAtPeriodEnd = true;
    subscription.scheduledChangeEffectiveAt = subscription.currentPeriodEndsAt;
    subscription.dataDeletionDueAt = subscription.currentPeriodEndsAt
      ? this.buildDataDeletionDueAt(subscription.currentPeriodEndsAt)
      : null;
    await this.subscriptionsRepo.save(subscription);

    return {
      ok: true,
      subscriptionId: subscription.id,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      effectiveAt: subscription.currentPeriodEndsAt?.toISOString() ?? null,
      dataDeletionDueAt: subscription.dataDeletionDueAt?.toISOString() ?? null,
    };
  }

  async activateMockCheckout(subscriptionId: string, token?: string) {
    const subscription = await this.subscriptionsRepo.findOne({ where: { id: subscriptionId } });
    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    if (subscription.status !== 'PENDING') {
      throw new ForbiddenException('Mock checkout activation is no longer valid');
    }

    if (!token || !subscription.providerCheckoutSessionId) {
      throw new ForbiddenException('Missing mock checkout activation token');
    }

    if (subscription.providerCheckoutSessionId !== token) {
      throw new ForbiddenException('Invalid mock checkout activation token');
    }

    subscription.status = 'ACTIVE';
    subscription.activatedAt = new Date();
    subscription.currentPeriodEndsAt = this.buildPeriodEnd(subscription.billingCycle);
    subscription.providerSubscriptionId = `mock-sub-${subscription.id}`;
    subscription.providerCheckoutSessionId = null;
    await this.subscriptionsRepo.save(subscription);
    await this.applyTenantPlanFromSubscription(subscription);

    return {
      ok: true,
      subscriptionId: subscription.id,
      status: subscription.status,
      currentPeriodEndsAt: subscription.currentPeriodEndsAt?.toISOString() ?? null,
    };
  }

  async recordUsageEvent(dto: RecordUsageEventDto) {
    const event = this.usageEventsRepo.create({
      tenantId: dto.tenantId,
      addonCode: dto.addonCode,
      metric: dto.metric,
      quantity: Math.max(1, dto.quantity),
      sourceService: dto.sourceService,
      actorType: dto.actorType ?? null,
      clientAppId: dto.clientAppId ?? null,
      serviceAccountId: dto.serviceAccountId ?? null,
      metadata: dto.metadata ?? null,
    });

    const saved = await this.usageEventsRepo.save(event);
    return {
      ok: true,
      id: saved.id,
      createdAt: saved.createdAt.toISOString(),
    };
  }

  async closeDuePeriods() {
    const now = new Date();
    const dueSubscriptions = await this.subscriptionsRepo.find({
      where: { status: 'ACTIVE' },
      order: { currentPeriodEndsAt: 'ASC' },
    });

    const closable = dueSubscriptions.filter(
      (subscription) =>
        subscription.currentPeriodEndsAt &&
        subscription.currentPeriodEndsAt <= now,
    );

    const results = [];
    for (const subscription of closable) {
      const hasBillingBypass = await this.isBillingBypassEnabled(
        subscription.tenantId,
      );
      const expiredPeriodEndedAt = subscription.currentPeriodEndsAt ?? now;
      const closed = await this.closeSubscriptionPeriod(subscription);
      const updated =
        subscription.provider === 'mercadopago' && !hasBillingBypass
          ? await this.revokeSubscriptionForNonPayment(
              subscription,
              expiredPeriodEndedAt,
            )
          : await this.enforceSubscriptionStanding(subscription, now);
      if (closed) {
        results.push({
          ...closed,
          status: updated?.status ?? subscription.status,
        });
      }
    }

    return {
      ok: true,
      closed: results.length,
      items: results,
    };
  }

  async handleStripeWebhook(rawBody: Buffer | undefined, signature: string | undefined) {
    if (this.billing.provider !== 'stripe') {
      return { ok: true, ignored: true, reason: 'provider_not_stripe' };
    }

    if (!rawBody || !signature) {
      throw new ForbiddenException('Missing Stripe webhook signature');
    }

    const stripe = this.getStripe();

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(
        rawBody,
        signature,
        this.billing.stripeWebhookSecret,
      );
    } catch {
      throw new ForbiddenException('Invalid Stripe webhook signature');
    }

    switch (event.type) {
      case 'checkout.session.completed':
        await this.handleStripeCheckoutCompleted(
          event.data.object as Stripe.Checkout.Session,
        );
        break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await this.handleStripeSubscriptionUpdated(
          event.data.object as Stripe.Subscription,
        );
        break;
      default:
        break;
    }

    return { ok: true };
  }

  async handleMercadoPagoWebhook(input: {
    dataId?: string;
    topic?: string;
    signature?: string;
    requestId?: string;
  }) {
    if (this.billing.provider !== 'mercadopago') {
      return { ok: true, ignored: true, reason: 'provider_not_mercadopago' };
    }

    // Authenticate the notification. This endpoint is unauthenticated and
    // un-throttled (deliveries must not be dropped), so the signature is the
    // only thing standing between a stranger and triggering payment syncs.
    this.assertValidMercadoPagoSignature(input);

    if (input.topic && input.topic !== 'payment') {
      return { ok: true, ignored: true, reason: 'unsupported_topic' };
    }

    if (!input.dataId) {
      return { ok: true, ignored: true, reason: 'missing_payment_id' };
    }

    await this.synchronizeMercadoPagoPayment(input.dataId);
    return { ok: true };
  }

  /**
   * Verify Mercado Pago's `x-signature` HMAC over the manifest
   * `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`. Enforced only when a
   * webhook secret is configured; otherwise we log once and proceed so
   * environments that haven't set it yet keep working (payments are still
   * re-fetched authoritatively from the MP API downstream).
   */
  private assertValidMercadoPagoSignature(input: {
    dataId?: string;
    signature?: string;
    requestId?: string;
  }): void {
    const secret = this.billing.mercadopagoWebhookSecret;
    if (!secret) {
      this.logger.warn(
        'MERCADOPAGO_WEBHOOK_SECRET is not set — webhook signature verification is DISABLED.',
      );
      return;
    }

    if (!input.signature || !input.requestId || !input.dataId) {
      throw new ForbiddenException('Missing Mercado Pago webhook signature');
    }

    const parts = Object.fromEntries(
      input.signature.split(',').map((kv) => {
        const [k, v] = kv.split('=');
        return [k?.trim(), v?.trim()];
      }),
    );
    const ts = parts['ts'];
    const v1 = parts['v1'];
    if (!ts || !v1) {
      throw new ForbiddenException('Malformed Mercado Pago webhook signature');
    }

    // MP lowercases the id in the manifest when it is alphanumeric.
    const id = input.dataId.toLowerCase();
    const manifest = `id:${id};request-id:${input.requestId};ts:${ts};`;
    const expected = createHmac('sha256', secret)
      .update(manifest)
      .digest('hex');

    const a = Buffer.from(expected);
    const b = Buffer.from(v1);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new ForbiddenException('Invalid Mercado Pago webhook signature');
    }
  }

  async handleMercadoPagoReturn(input: {
    paymentId?: string;
    status?: string;
    subscriptionId?: string;
  }) {
    const redirectUrl = new URL(this.billing.portalReturnUrl);
    redirectUrl.searchParams.set('billing', 'pending');

    if (input.subscriptionId) {
      redirectUrl.searchParams.set('subscriptionId', input.subscriptionId);
    }

    if (this.billing.provider !== 'mercadopago') {
      redirectUrl.searchParams.set('billing', 'canceled');
      return redirectUrl.toString();
    }

    if (input.paymentId) {
      const subscription = await this.synchronizeMercadoPagoPayment(input.paymentId);
      if (subscription) {
        redirectUrl.searchParams.set('subscriptionId', subscription.id);
        redirectUrl.searchParams.set(
          'billing',
          subscription.status === 'ACTIVE'
            ? 'success'
            : subscription.status === 'CANCELED'
              ? 'canceled'
              : 'pending',
        );
        return redirectUrl.toString();
      }
    }

    if (input.status === 'approved') {
      redirectUrl.searchParams.set('billing', 'success');
    } else if (input.status === 'rejected' || input.status === 'cancelled') {
      redirectUrl.searchParams.set('billing', 'canceled');
    }

    return redirectUrl.toString();
  }

  private get billing() {
    return this.configService.get<BillingConfig>('billing')!;
  }

  private getStripe() {
    if (this.stripeClient) {
      return this.stripeClient;
    }

    if (!this.billing.stripeSecretKey) {
      throw new InternalServerErrorException('Stripe secret key is not configured');
    }

    this.stripeClient = new Stripe(this.billing.stripeSecretKey);
    return this.stripeClient;
  }

  private getMercadoPagoConfig() {
    if (this.mercadoPagoClient) {
      return this.mercadoPagoClient;
    }

    if (!this.billing.mercadopagoAccessToken) {
      throw new InternalServerErrorException(
        'Mercado Pago access token is not configured',
      );
    }

    this.mercadoPagoClient = new MercadoPagoConfig({
      accessToken: this.billing.mercadopagoAccessToken,
    });
    return this.mercadoPagoClient;
  }

  private getMercadoPagoPreference() {
    if (this.mercadoPagoPreferenceClient) {
      return this.mercadoPagoPreferenceClient;
    }

    this.mercadoPagoPreferenceClient = new Preference(this.getMercadoPagoConfig());
    return this.mercadoPagoPreferenceClient;
  }

  private getMercadoPagoPayment() {
    if (this.mercadoPagoPaymentClient) {
      return this.mercadoPagoPaymentClient;
    }

    this.mercadoPagoPaymentClient = new Payment(this.getMercadoPagoConfig());
    return this.mercadoPagoPaymentClient;
  }

  private findOffer(industry: BillingIndustryCode, tier: BillingTierCode) {
    const offer = BILLING_CATALOG.offers.find(
      (entry) => entry.industry === industry && entry.tier === tier,
    );

    if (!offer) {
      throw new NotFoundException('Billing offer not found');
    }

    return offer;
  }

  private async createMockCheckoutSession(
    auth: AccessTokenPayload,
    dto: CreateCheckoutSessionDto,
    seats: number,
    amountCents: number,
    addonAmountCents: number,
    addOns: BillingApiAddonCode[],
    customer: BillingCustomerEntity,
  ) {
    const activationToken = `mock_chk_${randomUUID()}`;
    const subscription = await this.subscriptionsRepo.save(
      this.subscriptionsRepo.create({
        tenantId: auth.tenantId,
        provider: this.billing.provider,
        providerSubscriptionId: null,
        providerCheckoutSessionId: activationToken,
        status: 'PENDING',
        basePlan: dto.tier,
        industryPackage: dto.industry,
        billingCycle: dto.billingCycle,
        seats,
        currency: 'USD',
        amountCents,
        addonAmountCents,
        apiAddons: addOns,
        trialEndsAt: this.buildTrialEnd(this.billing.trialDays),
      }),
    );

    subscription.checkoutUrl = `${this.billing.publicBaseUrl}/billing/checkout/mock/${subscription.id}/activate?token=${encodeURIComponent(activationToken)}&returnUrl=${encodeURIComponent(dto.successUrl ?? this.billing.portalReturnUrl)}`;
    await this.subscriptionsRepo.save(subscription);

    return {
      provider: this.billing.provider,
      subscriptionId: subscription.id,
      checkoutUrl: subscription.checkoutUrl!,
      amountCents: subscription.amountCents,
      currency: subscription.currency,
      summary: {
        tier: subscription.basePlan,
        industry: subscription.industryPackage,
        billingCycle: subscription.billingCycle,
        seats: subscription.seats,
        addOns: subscription.apiAddons ?? [],
      },
      customer,
    };
  }

  private async createStripeCheckoutSession(
    auth: AccessTokenPayload,
    dto: CreateCheckoutSessionDto,
    offer: BillingCatalogOffer,
    seats: number,
    amountCents: number,
    addonAmountCents: number,
    addOns: BillingApiAddonCode[],
    customer: BillingCustomerEntity,
  ) {
    const stripe = this.getStripe();
    const recurringInterval: Stripe.Checkout.SessionCreateParams.LineItem.PriceData.Recurring.Interval =
      dto.billingCycle === 'yearly' ? 'year' : 'month';

    if (!customer.providerCustomerId) {
      const stripeCustomer = await stripe.customers.create({
        email: customer.billingEmail ?? undefined,
        name: customer.companyName ?? undefined,
        metadata: {
          tenantId: auth.tenantId,
        },
      });
      customer.provider = 'stripe';
      customer.providerCustomerId = stripeCustomer.id;
      await this.customersRepo.save(customer);
    }

    const subscription = await this.subscriptionsRepo.save(
      this.subscriptionsRepo.create({
        tenantId: auth.tenantId,
        provider: 'stripe',
        providerSubscriptionId: null,
        providerCheckoutSessionId: null,
        status: 'PENDING',
        basePlan: dto.tier,
        industryPackage: dto.industry,
        billingCycle: dto.billingCycle,
        seats,
        currency: 'USD',
        amountCents,
        addonAmountCents,
        apiAddons: addOns,
        trialEndsAt: this.buildTrialEnd(this.billing.trialDays),
      }),
    );

    const successUrl =
      dto.successUrl ??
      `${this.billing.portalReturnUrl}?billing=success&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl =
      dto.cancelUrl ?? `${this.billing.portalReturnUrl}?billing=canceled`;

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customer.providerCustomerId,
      success_url: successUrl,
      cancel_url: cancelUrl,
      allow_promotion_codes: true,
      client_reference_id: subscription.id,
      metadata: {
        tenantId: auth.tenantId,
        subscriptionId: subscription.id,
        industry: dto.industry,
        tier: dto.tier,
        billingCycle: dto.billingCycle,
        seats: String(seats),
        addOns: addOns.join(','),
      },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            recurring: {
              interval: recurringInterval,
            },
            product_data: {
              name: offer.name,
              description: `${offer.description} (${seats} seat${seats === 1 ? '' : 's'})`,
            },
            unit_amount: amountCents - addonAmountCents,
          },
        },
        ...addOns.map((code) => {
          const addon = this.findApiAddon(code);
          const unitAmount =
            dto.billingCycle === 'yearly'
              ? addon.yearlyPriceCents
              : addon.monthlyPriceCents;

          return {
            quantity: 1,
            price_data: {
              currency: 'usd',
              recurring: {
                interval: recurringInterval,
              },
              product_data: {
                name: addon.name,
                description: addon.description,
              },
              unit_amount: unitAmount,
            },
          };
        }),
      ],
      subscription_data: {
        metadata: {
          tenantId: auth.tenantId,
          subscriptionId: subscription.id,
          industry: dto.industry,
          tier: dto.tier,
          seats: String(seats),
          addOns: addOns.join(','),
        },
        ...(this.billing.trialDays > 0
          ? { trial_period_days: this.billing.trialDays }
          : {}),
      },
    });

    subscription.providerCheckoutSessionId = checkoutSession.id;
    subscription.checkoutUrl = checkoutSession.url;
    await this.subscriptionsRepo.save(subscription);

    return {
      provider: 'stripe',
      subscriptionId: subscription.id,
      checkoutUrl: checkoutSession.url!,
      amountCents: subscription.amountCents,
      currency: subscription.currency,
      summary: {
        tier: subscription.basePlan,
        industry: subscription.industryPackage,
        billingCycle: subscription.billingCycle,
        seats: subscription.seats,
        addOns: subscription.apiAddons ?? [],
      },
      customer,
    };
  }

  private async createMercadoPagoCheckoutSession(
    auth: AccessTokenPayload,
    dto: CreateCheckoutSessionDto,
    offer: BillingCatalogOffer,
    seats: number,
    amountCents: number,
    addonAmountCents: number,
    addOns: BillingApiAddonCode[],
    customer: BillingCustomerEntity,
  ) {
    const currency = this.billing.mercadopagoCurrency;
    const subscription = await this.subscriptionsRepo.save(
      this.subscriptionsRepo.create({
        tenantId: auth.tenantId,
        provider: 'mercadopago',
        providerSubscriptionId: null,
        providerCheckoutSessionId: null,
        status: 'PENDING',
        basePlan: dto.tier,
        industryPackage: dto.industry,
        billingCycle: dto.billingCycle,
        seats,
        currency,
        amountCents,
        addonAmountCents,
        apiAddons: addOns,
        trialEndsAt: this.buildTrialEnd(this.billing.trialDays),
      }),
    );

    customer.provider = 'mercadopago';
    await this.customersRepo.save(customer);

    const baseAmountCents = Math.max(0, amountCents - addonAmountCents);
    const baseUnitPrice = Number((baseAmountCents / 100).toFixed(2));
    const successUrl = `${this.billing.publicBaseUrl}/billing/checkout/mercadopago/return`;
    const failureUrl = `${this.billing.publicBaseUrl}/billing/checkout/mercadopago/return`;
    const pendingUrl = `${this.billing.publicBaseUrl}/billing/checkout/mercadopago/return`;
    const hasPublicReturnUrl = this.isPublicCallbackUrl(successUrl);
    const hasPublicWebhookUrl = this.isPublicCallbackUrl(
      `${this.billing.publicBaseUrl}/billing/webhooks/mercadopago`,
    );
    const preferenceClient = this.getMercadoPagoPreference();

    let preference;
    try {
      preference = await preferenceClient.create({
        body: {
          external_reference: subscription.id,
          ...(hasPublicWebhookUrl
            ? {
                notification_url: `${this.billing.publicBaseUrl}/billing/webhooks/mercadopago`,
              }
            : {}),
          ...(customer.companyName
            ? {
                payer: {
                  name: customer.companyName,
                },
              }
            : {}),
          ...(hasPublicReturnUrl
            ? {
                auto_return: 'approved',
                back_urls: {
                  success: successUrl,
                  failure: failureUrl,
                  pending: pendingUrl,
                },
              }
            : {}),
          metadata: {
            tenantId: auth.tenantId,
            subscriptionId: subscription.id,
            industry: dto.industry,
            tier: dto.tier,
            billingCycle: dto.billingCycle,
            seats,
            addOns,
          },
          items: [
            {
              id: `${dto.tier}-${dto.billingCycle}`,
              title: offer.name,
              description: `${offer.description} (${seats} seat${seats === 1 ? '' : 's'})`,
              quantity: 1,
              currency_id: currency,
              unit_price: baseUnitPrice,
            },
            ...addOns.map((code) => {
              const addon = this.findApiAddon(code);
              const unitAmount =
                dto.billingCycle === 'yearly'
                  ? addon.yearlyPriceCents
                  : addon.monthlyPriceCents;

              return {
                id: code,
                title: addon.name,
                description: addon.description,
                quantity: 1,
                currency_id: currency,
                unit_price: Number((unitAmount / 100).toFixed(2)),
              };
            }),
          ],
        },
      });
    } catch (error) {
      throw new InternalServerErrorException(
        `Mercado Pago preference creation failed: ${this.readProviderError(error)}`,
      );
    }

    subscription.providerCheckoutSessionId = preference.id ?? null;
    subscription.checkoutUrl =
      preference.sandbox_init_point ?? preference.init_point ?? null;
    await this.subscriptionsRepo.save(subscription);

    if (!subscription.checkoutUrl) {
      throw new InternalServerErrorException(
        'Mercado Pago checkout URL was not returned',
      );
    }

    return {
      provider: 'mercadopago',
      subscriptionId: subscription.id,
      checkoutUrl: subscription.checkoutUrl,
      amountCents: subscription.amountCents,
      currency: subscription.currency,
      summary: {
        tier: subscription.basePlan,
        industry: subscription.industryPackage,
        billingCycle: subscription.billingCycle,
        seats: subscription.seats,
        addOns: subscription.apiAddons ?? [],
      },
      customer,
    };
  }

  private async findOrCreateCustomer(
    tenantId: string,
    dto: CreateCheckoutSessionDto,
  ) {
    let customer = await this.customersRepo.findOne({ where: { tenantId } });
    if (!customer) {
      customer = await this.customersRepo.save(
        this.customersRepo.create({
          tenantId,
          provider: this.billing.provider,
          providerCustomerId: null,
          billingEmail: dto.billingEmail ?? null,
          companyName: dto.companyName ?? null,
        }),
      );
    } else {
      customer.billingEmail = dto.billingEmail ?? customer.billingEmail;
      customer.companyName = dto.companyName ?? customer.companyName;
      customer.provider = this.billing.provider;
      customer = await this.customersRepo.save(customer);
    }

    return customer;
  }

  private async handleStripeCheckoutCompleted(session: Stripe.Checkout.Session) {
    const localSubscriptionId =
      session.client_reference_id ??
      session.metadata?.subscriptionId ??
      null;

    if (!localSubscriptionId) {
      return;
    }

    const subscription = await this.subscriptionsRepo.findOne({
      where: { id: localSubscriptionId },
    });

    if (!subscription) {
      return;
    }

    subscription.providerCheckoutSessionId = session.id;
    subscription.providerSubscriptionId =
      typeof session.subscription === 'string'
        ? session.subscription
        : session.subscription?.id ?? null;
    subscription.status = session.payment_status === 'paid' ? 'ACTIVE' : 'PENDING';
    subscription.activatedAt = subscription.status === 'ACTIVE' ? new Date() : subscription.activatedAt;
    subscription.apiAddons = this.normalizeAddOns(
      session.metadata?.addOns?.split(',').filter(Boolean) ?? subscription.apiAddons ?? [],
    );
    await this.subscriptionsRepo.save(subscription);

    if (typeof session.customer === 'string') {
      const customer = await this.customersRepo.findOne({
        where: { tenantId: subscription.tenantId },
      });
      if (customer && !customer.providerCustomerId) {
        customer.provider = 'stripe';
        customer.providerCustomerId = session.customer;
        await this.customersRepo.save(customer);
      }
    }
  }

  private async handleStripeSubscriptionUpdated(stripeSubscription: Stripe.Subscription) {
    const stripeSubscriptionRecord = stripeSubscription as Stripe.Subscription & {
      current_period_end: number;
      trial_end: number | null;
    };

    const localSubscriptionId =
      stripeSubscription.metadata.subscriptionId ??
      (await this.findSubscriptionIdByProviderId(stripeSubscription.id));

    if (!localSubscriptionId) {
      return;
    }

    const subscription = await this.subscriptionsRepo.findOne({
      where: { id: localSubscriptionId },
    });

    if (!subscription) {
      return;
    }

    subscription.provider = 'stripe';
    subscription.providerSubscriptionId = stripeSubscription.id;
    subscription.status = this.mapStripeStatus(stripeSubscription.status);
    subscription.currentPeriodEndsAt = new Date(
      stripeSubscriptionRecord.current_period_end * 1000,
    );
    subscription.trialEndsAt = stripeSubscriptionRecord.trial_end
      ? new Date(stripeSubscriptionRecord.trial_end * 1000)
      : null;
    if (subscription.status === 'ACTIVE' && !subscription.activatedAt) {
      subscription.activatedAt = new Date();
    }

    await this.subscriptionsRepo.save(subscription);
    await this.applyTenantPlanFromSubscription(subscription);
  }

  private async synchronizeMercadoPagoPayment(paymentId: string) {
    const paymentClient = this.getMercadoPagoPayment();
    let payment;
    try {
      payment = await paymentClient.get({ id: paymentId });
    } catch (error) {
      throw new InternalServerErrorException(
        `Mercado Pago payment sync failed: ${this.readProviderError(error)}`,
      );
    }

    const paymentStatus = payment.status;
    if (!paymentStatus) {
      throw new InternalServerErrorException(
        'Mercado Pago payment status was not returned',
      );
    }

    const localSubscriptionId = payment.external_reference;
    if (!localSubscriptionId) {
      return null;
    }

    const subscription = await this.subscriptionsRepo.findOne({
      where: { id: localSubscriptionId },
    });
    if (!subscription) {
      return null;
    }

    subscription.provider = 'mercadopago';
    subscription.providerSubscriptionId = payment.id ? String(payment.id) : null;
    subscription.status = this.mapMercadoPagoStatus(paymentStatus);
    subscription.currentPeriodEndsAt =
      subscription.status === 'ACTIVE'
        ? this.buildPeriodEnd(subscription.billingCycle)
        : subscription.currentPeriodEndsAt;
    subscription.activatedAt =
      subscription.status === 'ACTIVE'
        ? payment.date_approved
          ? new Date(payment.date_approved)
          : subscription.activatedAt ?? new Date()
        : subscription.activatedAt;
    await this.subscriptionsRepo.save(subscription);

    if (subscription.status === 'ACTIVE' || subscription.status === 'CANCELED') {
      await this.applyTenantPlanFromSubscription(subscription);
    }

    return subscription;
  }

  private async enforceSubscriptionStanding(
    subscription: BillingSubscriptionEntity | null,
    now = new Date(),
  ) {
    if (!subscription) {
      return null;
    }

    if (await this.isBillingBypassEnabled(subscription.tenantId)) {
      return subscription;
    }

    if (
      subscription.provider === 'mercadopago' &&
      subscription.status === 'ACTIVE' &&
      subscription.currentPeriodEndsAt &&
      subscription.currentPeriodEndsAt <= now
    ) {
      const expiredPeriodEndedAt = subscription.currentPeriodEndsAt;
      await this.closeSubscriptionPeriod(subscription);
      return this.revokeSubscriptionForNonPayment(
        subscription,
        expiredPeriodEndedAt,
      );
    }

    return subscription;
  }

  private async revokeSubscriptionForNonPayment(
    subscription: BillingSubscriptionEntity,
    periodEndedAt: Date,
  ) {
    subscription.status = 'CANCELED';
    subscription.currentPeriodEndsAt = periodEndedAt;
    subscription.cancelAtPeriodEnd = false;
    subscription.scheduledChangeEffectiveAt = periodEndedAt;
    subscription.dataDeletionDueAt = this.buildDataDeletionDueAt(periodEndedAt);
    await this.subscriptionsRepo.save(subscription);
    await this.applyTenantPlanFromSubscription(subscription);
    return subscription;
  }

  private async isBillingBypassEnabled(tenantId: string) {
    const tenant = await this.authDirectory.getTenant(tenantId);
    return tenant?.billingBypass === true;
  }

  private async findSubscriptionIdByProviderId(providerSubscriptionId: string) {
    const row = await this.subscriptionsRepo.findOne({
      where: { providerSubscriptionId },
    });

    return row?.id ?? null;
  }

  private mapStripeStatus(status: Stripe.Subscription.Status) {
    switch (status) {
      case 'active':
      case 'trialing':
        return 'ACTIVE' as const;
      case 'past_due':
      case 'unpaid':
      case 'incomplete':
      case 'incomplete_expired':
        return 'PAST_DUE' as const;
      case 'canceled':
        return 'CANCELED' as const;
      default:
        return 'PENDING' as const;
    }
  }

  private mapMercadoPagoStatus(status: string) {
    switch (status) {
      case 'approved':
        return 'ACTIVE' as const;
      case 'rejected':
      case 'cancelled':
      case 'refunded':
      case 'charged_back':
        return 'CANCELED' as const;
      case 'in_process':
      case 'pending':
      case 'authorized':
        return 'PENDING' as const;
      default:
        return 'PENDING' as const;
    }
  }

  private isPublicCallbackUrl(value: string) {
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' && url.hostname !== 'localhost') {
        return false;
      }

      const hostname = url.hostname.toLowerCase();
      if (
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '0.0.0.0' ||
        hostname.endsWith('.local')
      ) {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  private readProviderError(error: unknown) {
    if (error instanceof Error && error.message) {
      return error.message;
    }

    if (typeof error === 'object' && error !== null) {
      const cause = 'cause' in error ? (error as { cause?: unknown }).cause : null;
      if (
        cause &&
        typeof cause === 'object' &&
        'message' in cause &&
        typeof (cause as { message?: unknown }).message === 'string'
      ) {
        return (cause as { message: string }).message;
      }

      if ('api_response' in error) {
        try {
          return JSON.stringify((error as { api_response: unknown }).api_response);
        } catch {
          return 'api_response_unserializable';
        }
      }
    }

    return 'unknown_provider_error';
  }

  private async applyTenantPlanFromSubscription(subscription: BillingSubscriptionEntity) {
    if (await this.isBillingBypassEnabled(subscription.tenantId)) {
      return;
    }

    const offer = this.findOffer(
      subscription.industryPackage as BillingIndustryCode,
      subscription.basePlan as BillingTierCode,
    );

    const auditRetentionDays = this.readAuditRetentionDays(
      subscription.basePlan as BillingTierCode,
    );

    const isCanceled = subscription.status === 'CANCELED';
    const normalizedAddOns = isCanceled
      ? []
      : this.normalizeAddOns(subscription.apiAddons);
    const authApiIncluded = normalizedAddOns.includes('AUTH_API');
    const apiLimits = this.readApiIntegrationLimits(
      subscription.basePlan as BillingTierCode,
      normalizedAddOns,
    );

    await this.authDirectory.updateTenantBillingProfile(subscription.tenantId, {
      planCode: isCanceled ? 'FREE' : subscription.basePlan,
      vaultsEnabled: !isCanceled,
      ztPoliciesEnabled: !isCanceled && offer.limits.ztMode !== 'basic' ? true : !isCanceled,
      maxVaults: isCanceled ? 1 : offer.limits.maxVaults ?? 0,
      maxUsers: isCanceled ? 3 : offer.limits.maxUsers,
      monthlyNotaryRequests: isCanceled
        ? 0
        : offer.limits.monthlyNotaryRequests ?? 0,
      auditRetentionDays: isCanceled ? 30 : auditRetentionDays,
      maxClientApps: authApiIncluded ? apiLimits.maxClientApps : 0,
      maxServiceAccounts: authApiIncluded ? apiLimits.maxServiceAccounts : 0,
      apiAddons: normalizedAddOns,
    });
  }

  private readAuditRetentionDays(tier: BillingTierCode) {
    switch (tier) {
      case 'BASE':
        return 90;
      case 'GROWTH':
        return 180;
      case 'BUSINESS':
        return 365;
      case 'CUSTOM':
        return 730;
      default:
        return 30;
    }
  }

  private readApiIntegrationLimits(
    tier: BillingTierCode,
    addOns: BillingApiAddonCode[],
  ) {
    if (!addOns.includes('AUTH_API')) {
      return {
        maxClientApps: 0,
        maxServiceAccounts: 0,
      };
    }

    switch (tier) {
      case 'CUSTOM':
        return {
          maxClientApps: null,
          maxServiceAccounts: null,
        };
      case 'BUSINESS':
      default:
        return {
          maxClientApps: 3,
          maxServiceAccounts: 10,
        };
    }
  }

  private calculateAmount(
    industry: BillingIndustryCode,
    tier: BillingTierCode,
    billingCycle: 'monthly' | 'yearly',
    seats: number,
    addOns: BillingApiAddonCode[],
  ) {
    const offer = this.findOffer(industry, tier);
    const base =
      billingCycle === 'yearly'
        ? offer.yearlyPriceCents ?? 0
        : offer.monthlyPriceCents ?? 0;

    return base + Math.max(0, seats - 1) * 1200 + this.calculateAddonAmount(billingCycle, addOns);
  }

  private calculateAddonAmount(
    billingCycle: 'monthly' | 'yearly',
    addOns: BillingApiAddonCode[],
  ) {
    return addOns.reduce((total, code) => {
      const addon = this.findApiAddon(code);
      return (
        total +
        (billingCycle === 'yearly' ? addon.yearlyPriceCents : addon.monthlyPriceCents)
      );
    }, 0);
  }

  private findApiAddon(code: BillingApiAddonCode): BillingCatalogApiAddon {
    const addon = BILLING_CATALOG.apiAddons.find((entry) => entry.code === code);
    if (!addon) {
      throw new NotFoundException('Billing API add-on not found');
    }
    return addon;
  }

  private normalizeAddOns(addOns?: string[] | null): BillingApiAddonCode[] {
    const valid = new Set<BillingApiAddonCode>(['AUTH_API', 'VAULT_API', 'ZERO_TRUST_API']);
    return [...new Set((addOns ?? []).filter((item): item is BillingApiAddonCode => valid.has(item as BillingApiAddonCode)))];
  }

  private async findReusablePendingCheckout(
    tenantId: string,
    dto: CreateCheckoutSessionDto,
    seats: number,
    addOns: BillingApiAddonCode[],
  ) {
    const pendingSubscription = await this.subscriptionsRepo.findOne({
      where: { tenantId, status: 'PENDING' },
      order: { createdAt: 'DESC' },
    });

    if (
      !pendingSubscription ||
      !pendingSubscription.checkoutUrl ||
      pendingSubscription.provider !== this.billing.provider ||
      pendingSubscription.basePlan !== dto.tier ||
      pendingSubscription.industryPackage !== dto.industry ||
      pendingSubscription.billingCycle !== dto.billingCycle ||
      pendingSubscription.seats !== seats ||
      !this.haveSameAddOns(pendingSubscription.apiAddons, addOns)
    ) {
      return null;
    }

    return {
      provider: pendingSubscription.provider,
      subscriptionId: pendingSubscription.id,
      checkoutUrl: pendingSubscription.checkoutUrl,
      amountCents: pendingSubscription.amountCents,
      currency: pendingSubscription.currency,
      summary: {
        tier: pendingSubscription.basePlan,
        industry: pendingSubscription.industryPackage,
        billingCycle: pendingSubscription.billingCycle,
        seats: pendingSubscription.seats,
        addOns: pendingSubscription.apiAddons ?? [],
      },
      customer: await this.findOrCreateCustomer(tenantId, dto),
    };
  }

  private async assertNoConflictingActiveSubscription(
    tenantId: string,
    dto: CreateCheckoutSessionDto,
    seats: number,
    addOns: BillingApiAddonCode[],
  ) {
    const activeSubscription = await this.subscriptionsRepo.findOne({
      where: { tenantId, status: 'ACTIVE' },
      order: { createdAt: 'DESC' },
    });

    if (!activeSubscription) {
      return;
    }

    const standingSubscription = await this.enforceSubscriptionStanding(activeSubscription);
    if (!standingSubscription || standingSubscription.status !== 'ACTIVE') {
      return;
    }

    const isSamePlan =
      standingSubscription.basePlan === dto.tier &&
      standingSubscription.industryPackage === dto.industry &&
      standingSubscription.billingCycle === dto.billingCycle &&
      standingSubscription.seats === seats &&
      this.haveSameAddOns(standingSubscription.apiAddons, addOns);

    if (isSamePlan) {
      throw new ForbiddenException('This plan is already active for your tenant');
    }

    if (standingSubscription.cancelAtPeriodEnd) {
      throw new ForbiddenException(
        'This subscription is already scheduled to end at the next renewal.',
      );
    }

    const renewalDate =
      standingSubscription.currentPeriodEndsAt?.toISOString() ?? 'the current billing period ends';
    throw new ForbiddenException(
      `Plan changes are applied at the next renewal. Your current subscription remains active until ${renewalDate}.`,
    );
  }

  private haveSameAddOns(
    left?: string[] | null,
    right?: BillingApiAddonCode[] | null,
  ) {
    const normalizedLeft = this.normalizeAddOns(left).sort();
    const normalizedRight = this.normalizeAddOns(right).sort();

    return (
      normalizedLeft.length === normalizedRight.length &&
      normalizedLeft.every((value, index) => value === normalizedRight[index])
    );
  }

  private assertAddOnsAllowed(tier: BillingTierCode, addOns: BillingApiAddonCode[]) {
    if (!addOns.length) return;
    if (tier !== 'BUSINESS' && tier !== 'CUSTOM') {
      throw new ForbiddenException('API add-ons are only available from Business');
    }

    if ((addOns.includes('VAULT_API') || addOns.includes('ZERO_TRUST_API')) &&
      !addOns.includes('AUTH_API')) {
      throw new ForbiddenException(
        'Auth API Pack is required before enabling Vault API or Zero Trust API',
      );
    }
  }

  private buildTrialEnd(trialDays: number) {
    if (trialDays <= 0) return null;
    const now = new Date();
    now.setUTCDate(now.getUTCDate() + trialDays);
    return now;
  }

  private buildPeriodEnd(billingCycle: 'monthly' | 'yearly') {
    const now = new Date();
    if (billingCycle === 'yearly') {
      now.setUTCFullYear(now.getUTCFullYear() + 1);
    } else {
      now.setUTCMonth(now.getUTCMonth() + 1);
    }
    return now;
  }

  private buildNextPeriodEnd(
    currentEnd: Date,
    billingCycle: 'monthly' | 'yearly',
  ) {
    const next = new Date(currentEnd);
    if (billingCycle === 'yearly') {
      next.setUTCFullYear(next.getUTCFullYear() + 1);
    } else {
      next.setUTCMonth(next.getUTCMonth() + 1);
    }
    return next;
  }

  private async getUsageSummary(
    tenantId: string,
    subscription: BillingSubscriptionEntity | null,
  ) {
    const windowStartedAt = await this.resolveCurrentUsageWindowStart(
      tenantId,
      subscription,
    );

    if (!windowStartedAt) {
      return {
        windowStartedAt: null,
        totals: {},
        overages: {},
        recentEvents: [],
      };
    }

    const events = await this.usageEventsRepo.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
    });

    const filtered = events.filter((event) => event.createdAt >= windowStartedAt);
    const computed = this.buildUsageComputation(filtered, subscription);

    return {
      windowStartedAt: windowStartedAt.toISOString(),
      totals: computed.totals,
      overages: computed.overages,
      recentEvents: filtered.slice(0, 20).map((event) => ({
        id: event.id,
        addonCode: event.addonCode,
        metric: event.metric,
        quantity: event.quantity,
        sourceService: event.sourceService,
        actorType: event.actorType,
        clientAppId: event.clientAppId,
        serviceAccountId: event.serviceAccountId,
        createdAt: event.createdAt.toISOString(),
      })),
    };
  }

  private buildUsageComputation(
    events: BillingUsageEventEntity[],
    subscription: BillingSubscriptionEntity | null,
  ) {
    const totals = events.reduce<Record<string, Record<string, number>>>(
      (acc, event) => {
        const addonBucket = (acc[event.addonCode] ??= {});
        addonBucket[event.metric] = (addonBucket[event.metric] ?? 0) + event.quantity;
        return acc;
      },
      {},
    );

    const overages = Object.fromEntries(
      (subscription?.apiAddons ?? [])
        .map((addonCode) => {
          const addon = BILLING_CATALOG.apiAddons.find(
            (entry) => entry.code === addonCode,
          );

          if (!addon) {
            return null;
          }

          const metricOverages = addon.usageLimits
            .map((limit) => {
              const used = totals[addonCode]?.[limit.metric] ?? 0;
              const excess = Math.max(0, used - limit.included);

              if (excess <= 0) {
                return {
                  metric: limit.metric,
                  label: limit.label,
                  included: limit.included,
                  used,
                  excess: 0,
                  overageBlocks: 0,
                  estimatedExtraCents: 0,
                  unit: limit.unit,
                };
              }

              const overageBlocks = Math.ceil(excess / limit.overageBlockSize);
              return {
                metric: limit.metric,
                label: limit.label,
                included: limit.included,
                used,
                excess,
                overageBlocks,
                estimatedExtraCents:
                  overageBlocks * limit.overageBlockPriceCents,
                unit: limit.unit,
              };
            })
            .filter(Boolean);

          return [
            addonCode,
            {
              estimatedExtraCents: metricOverages.reduce(
                (sum, item) => sum + item.estimatedExtraCents,
                0,
              ),
              metrics: metricOverages,
            },
          ];
        })
        .filter(
          (
            entry,
          ): entry is [
            string,
            {
              estimatedExtraCents: number;
              metrics: Array<{
                metric: string;
                label: string;
                included: number;
                used: number;
                excess: number;
                overageBlocks: number;
                estimatedExtraCents: number;
                unit: string;
              }>;
            },
          ] => entry !== null,
        ),
    );

    return {
      totals,
      overages,
    };
  }

  private async resolveCurrentUsageWindowStart(
    tenantId: string,
    subscription: BillingSubscriptionEntity | null,
  ) {
    if (!subscription) {
      return null;
    }

    const lastClosedPeriod = await this.periodClosesRepo.findOne({
      where: {
        tenantId,
        subscriptionId: subscription.id,
      },
      order: { periodEndedAt: 'DESC' },
    });

    return (
      lastClosedPeriod?.periodEndedAt ??
      subscription.activatedAt ??
      subscription.createdAt ??
      null
    );
  }

  private async closeSubscriptionPeriod(subscription: BillingSubscriptionEntity) {
    if (!subscription.currentPeriodEndsAt) {
      return null;
    }

    const periodEndedAt = subscription.currentPeriodEndsAt;
    const existing = await this.periodClosesRepo.findOne({
      where: {
        subscriptionId: subscription.id,
        periodEndedAt,
      },
    });

    if (existing) {
      return {
        id: existing.id,
        subscriptionId: existing.subscriptionId,
        totalAmountCents: existing.totalAmountCents,
        overageAmountCents: existing.overageAmountCents,
      };
    }

    const periodStartedAt =
      (await this.resolveCurrentUsageWindowStart(subscription.tenantId, subscription)) ??
      subscription.activatedAt ??
      subscription.createdAt;

    const events = await this.usageEventsRepo.find({
      where: { tenantId: subscription.tenantId },
      order: { createdAt: 'DESC' },
    });

    const periodEvents = events.filter(
      (event) =>
        event.createdAt >= periodStartedAt && event.createdAt < periodEndedAt,
    );
    const computed = this.buildUsageComputation(periodEvents, subscription);
    const addonCodes = this.normalizeAddOns(subscription.apiAddons);
    const overageAmountCents = addonCodes.reduce((sum, addonCode) => {
      return sum + (computed.overages[addonCode]?.estimatedExtraCents ?? 0);
    }, 0);
    const totalAmountCents =
      subscription.amountCents + overageAmountCents;

    const close = await this.periodClosesRepo.save(
      this.periodClosesRepo.create({
        tenantId: subscription.tenantId,
        subscriptionId: subscription.id,
        periodStartedAt,
        periodEndedAt,
        currency: subscription.currency,
        baseAmountCents:
          subscription.amountCents - subscription.addonAmountCents,
        addonAmountCents: subscription.addonAmountCents,
        overageAmountCents,
        totalAmountCents,
        summary: {
          totals: computed.totals,
          overages: computed.overages,
          addOns: addonCodes,
        },
      }),
    );

    subscription.currentPeriodEndsAt = this.buildNextPeriodEnd(
      periodEndedAt,
      subscription.billingCycle,
    );
    await this.subscriptionsRepo.save(subscription);

    return {
      id: close.id,
      subscriptionId: subscription.id,
      totalAmountCents: close.totalAmountCents,
      overageAmountCents: close.overageAmountCents,
    };
  }

  private assertOwner(auth: AccessTokenPayload) {
    if (!auth.roles.includes('OWNER')) {
      throw new ForbiddenException('Only tenant owners can manage billing');
    }
  }

  private buildDataDeletionDueAt(baseDate: Date) {
    const at = new Date(baseDate);
    at.setUTCDate(at.getUTCDate() + 90);
    return at;
  }

  private serializeSubscription(subscription: BillingSubscriptionEntity | null) {
    if (!subscription) {
      return null;
    }

    return {
      id: subscription.id,
      tenantId: subscription.tenantId,
      provider: subscription.provider,
      providerSubscriptionId: subscription.providerSubscriptionId,
      status: subscription.status,
      basePlan: subscription.basePlan,
      industryPackage: subscription.industryPackage,
      billingCycle: subscription.billingCycle,
      seats: subscription.seats,
      currency: subscription.currency,
      amountCents: subscription.amountCents,
      addonAmountCents: subscription.addonAmountCents,
      apiAddons: subscription.apiAddons,
      checkoutUrl: subscription.checkoutUrl,
      currentPeriodEndsAt: subscription.currentPeriodEndsAt?.toISOString() ?? null,
      trialEndsAt: subscription.trialEndsAt?.toISOString() ?? null,
      activatedAt: subscription.activatedAt?.toISOString() ?? null,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      scheduledPlanCode: subscription.scheduledPlanCode,
      scheduledIndustryPackage: subscription.scheduledIndustryPackage,
      scheduledBillingCycle: subscription.scheduledBillingCycle,
      scheduledSeats: subscription.scheduledSeats,
      scheduledApiAddons: subscription.scheduledApiAddons,
      scheduledChangeEffectiveAt:
        subscription.scheduledChangeEffectiveAt?.toISOString() ?? null,
      dataDeletionDueAt: subscription.dataDeletionDueAt?.toISOString() ?? null,
      createdAt: subscription.createdAt.toISOString(),
      updatedAt: subscription.updatedAt.toISOString(),
    };
  }
}
