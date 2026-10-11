import { Body, Controller, Get, Headers, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentAuth } from '../../common/decorators/current-auth.decorator';
import { AccessJwtGuard } from '../../common/guards/access-jwt.guard';
import { AccessTokenPayload } from '../auth/types/access-token-payload.type';
import { CreateMerchantProviderConnectionDto } from './dto/create-merchant-provider-connection.dto';
import { MerchantProviderService } from './merchant-provider.service';

@ApiTags('Merchant Provider Connections')
@Controller('billing/merchants/:merchantId/provider-connections')
@UseGuards(AccessJwtGuard)
export class MerchantProviderController {
  constructor(private readonly providers: MerchantProviderService) {}

  @Post()
  create(@CurrentAuth() auth: AccessTokenPayload, @Param('merchantId') merchantId: string, @Body() dto: CreateMerchantProviderConnectionDto) {
    return this.providers.createConnection(auth, merchantId, dto);
  }

  @Get()
  list(@CurrentAuth() auth: AccessTokenPayload, @Param('merchantId') merchantId: string) {
    return this.providers.listConnections(auth, merchantId);
  }

  @Post(':connectionId/disable')
  disable(@CurrentAuth() auth: AccessTokenPayload, @Param('merchantId') merchantId: string, @Param('connectionId') connectionId: string) {
    return this.providers.disableConnection(auth, merchantId, connectionId);
  }
}

@ApiTags('Merchant Provider Webhooks')
@Controller('billing/merchant-provider-webhooks')
export class MerchantProviderWebhookController {
  constructor(private readonly providers: MerchantProviderService) {}

  @Post(':connectionId/stripe')
  stripe(@Param('connectionId') connectionId: string, @Req() req: Request & { rawBody?: Buffer }, @Headers('stripe-signature') signature?: string) {
    return this.providers.handleStripeWebhook(connectionId, req.rawBody, signature);
  }

  @Post(':connectionId/mercadopago')
  mercadoPago(
    @Param('connectionId') connectionId: string,
    @Query() query: Record<string, string | undefined>,
    @Headers('x-signature') signature?: string,
    @Headers('x-request-id') requestId?: string,
  ) {
    const dataId = query['data.id'] ?? query.id;
    const eventType = query.type ?? query.topic ?? query.action ?? 'unknown';
    return this.providers.handleMercadoPagoWebhook(connectionId, dataId, signature, requestId, eventType);
  }
}
