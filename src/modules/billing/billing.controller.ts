import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { CurrentAuth } from '../../common/decorators/current-auth.decorator';
import { AccessJwtGuard } from '../../common/guards/access-jwt.guard';
import { AccessTokenPayload } from '../auth/types/access-token-payload.type';
import { CreateCheckoutSessionDto } from './dto/create-checkout-session.dto';
import { BillingService } from './billing.service';

@Controller('billing')
export class BillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly configService: ConfigService,
  ) {}

  private resolveSafeMockReturnUrl(rawReturnUrl: string | undefined): string {
    const fallback = this.configService.getOrThrow<string>('billing.portalReturnUrl');

    if (!rawReturnUrl) {
      return fallback;
    }

    try {
      const fallbackUrl = new URL(fallback);
      const candidate = new URL(rawReturnUrl, fallbackUrl);

      if (candidate.origin !== fallbackUrl.origin) {
        return fallback;
      }

      return candidate.toString();
    } catch {
      return fallback;
    }
  }

  @Get('catalog')
  getCatalog() {
    return this.billingService.getCatalog();
  }

  @Get('subscription')
  @UseGuards(AccessJwtGuard)
  getSubscription(@CurrentAuth() auth: AccessTokenPayload) {
    return this.billingService.getTenantBillingOverview(auth.tenantId);
  }

  @Post('portal-sessions')
  @UseGuards(AccessJwtGuard)
  createPortalSession(@CurrentAuth() auth: AccessTokenPayload) {
    return this.billingService.createPortalSession(auth);
  }

  @Post('checkout-sessions')
  @UseGuards(AccessJwtGuard)
  createCheckoutSession(
    @CurrentAuth() auth: AccessTokenPayload,
    @Body() dto: CreateCheckoutSessionDto,
  ) {
    return this.billingService.createCheckoutSession(auth, dto);
  }

  @Post('subscription/cancel')
  @UseGuards(AccessJwtGuard)
  scheduleCancellation(@CurrentAuth() auth: AccessTokenPayload) {
    return this.billingService.scheduleCancellation(auth);
  }

  // Payment-provider webhooks must never be rate-limited: dropping a delivery
  // loses a billing event.
  @SkipThrottle()
  @Post('webhooks/stripe')
  async handleStripeWebhook(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('stripe-signature') signature: string | undefined,
  ) {
    return this.billingService.handleStripeWebhook(req.rawBody, signature);
  }

  @SkipThrottle()
  @Post('webhooks/mercadopago')
  async handleMercadoPagoWebhook(
    @Query('data.id') dataId: string | undefined,
    @Query('id') id: string | undefined,
    @Query('type') type: string | undefined,
    @Query('topic') topic: string | undefined,
    @Headers('x-signature') signature?: string,
    @Headers('x-request-id') requestId?: string,
  ) {
    return this.billingService.handleMercadoPagoWebhook({
      dataId: dataId ?? id,
      topic: type ?? topic,
      signature,
      requestId,
    });
  }

  @Get('checkout/mercadopago/return')
  async handleMercadoPagoReturn(
    @Query('payment_id') paymentId: string | undefined,
    @Query('status') status: string | undefined,
    @Query('external_reference') subscriptionId: string | undefined,
    @Res() res: Response,
  ) {
    const redirectUrl = await this.billingService.handleMercadoPagoReturn({
      paymentId,
      status,
      subscriptionId,
    });

    return res.redirect(redirectUrl);
  }

  @Get('checkout/mock/:subscriptionId/activate')
  async activateMockCheckout(
    @Param('subscriptionId') subscriptionId: string,
    @Query('token') token: string | undefined,
    @Query('returnUrl') returnUrl: string | undefined,
    @Res() res: Response,
  ) {
    const allowMockActivation =
      this.configService.get<boolean>('billing.allowMockCheckoutActivation') ??
      false;

    if (!allowMockActivation) {
      throw new ForbiddenException('Mock checkout activation is disabled');
    }

    const result = await this.billingService.activateMockCheckout(
      subscriptionId,
      token,
    );
    const safeReturnUrl = this.resolveSafeMockReturnUrl(returnUrl);

    if (safeReturnUrl) {
      const redirectUrl = new URL(safeReturnUrl);
      redirectUrl.searchParams.set('billing', 'activated');
      redirectUrl.searchParams.set('subscriptionId', result.subscriptionId);
      return res.redirect(redirectUrl.toString());
    }

    return res.json(result);
  }
}
