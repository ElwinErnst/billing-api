import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentAuth } from '../../common/decorators/current-auth.decorator';
import { AccessJwtGuard } from '../../common/guards/access-jwt.guard';
import { AccessTokenPayload } from '../auth/types/access-token-payload.type';
import { CreateMerchantAccountDto } from './dto/create-merchant-account.dto';
import { CreateMerchantCustomerDto } from './dto/create-merchant-customer.dto';
import { CreateMerchantPriceDto } from './dto/create-merchant-price.dto';
import { CreateMerchantProductDto } from './dto/create-merchant-product.dto';
import { CreateMerchantSubscriptionDto } from './dto/create-merchant-subscription.dto';
import { MerchantBillingService } from './merchant-billing.service';

@ApiTags('Merchant Billing')
@Controller('billing/merchants')
@UseGuards(AccessJwtGuard)
export class MerchantBillingController {
  constructor(private readonly merchantBilling: MerchantBillingService) {}

  @Post()
  createMerchant(
    @CurrentAuth() auth: AccessTokenPayload,
    @Body() dto: CreateMerchantAccountDto,
  ) {
    return this.merchantBilling.createMerchant(auth, dto);
  }

  @Get()
  listMerchants(@CurrentAuth() auth: AccessTokenPayload) {
    return this.merchantBilling.listMerchants(auth);
  }

  @Post(':merchantId/products')
  createProduct(
    @CurrentAuth() auth: AccessTokenPayload,
    @Param('merchantId') merchantId: string,
    @Body() dto: CreateMerchantProductDto,
  ) {
    return this.merchantBilling.createProduct(auth, merchantId, dto);
  }

  @Get(':merchantId/products')
  listProducts(
    @CurrentAuth() auth: AccessTokenPayload,
    @Param('merchantId') merchantId: string,
  ) {
    return this.merchantBilling.listProducts(auth, merchantId);
  }

  @Patch(':merchantId/products/:productId/archive')
  archiveProduct(
    @CurrentAuth() auth: AccessTokenPayload,
    @Param('merchantId') merchantId: string,
    @Param('productId') productId: string,
  ) {
    return this.merchantBilling.archiveProduct(auth, merchantId, productId);
  }

  @Post(':merchantId/products/:productId/prices')
  createPrice(
    @CurrentAuth() auth: AccessTokenPayload,
    @Param('merchantId') merchantId: string,
    @Param('productId') productId: string,
    @Body() dto: CreateMerchantPriceDto,
  ) {
    return this.merchantBilling.createPrice(auth, merchantId, productId, dto);
  }

  @Get(':merchantId/products/:productId/prices')
  listPrices(
    @CurrentAuth() auth: AccessTokenPayload,
    @Param('merchantId') merchantId: string,
    @Param('productId') productId: string,
  ) {
    return this.merchantBilling.listPrices(auth, merchantId, productId);
  }

  @Patch(':merchantId/prices/:priceId/archive')
  archivePrice(
    @CurrentAuth() auth: AccessTokenPayload,
    @Param('merchantId') merchantId: string,
    @Param('priceId') priceId: string,
  ) {
    return this.merchantBilling.archivePrice(auth, merchantId, priceId);
  }

  @Post(':merchantId/customers')
  createCustomer(
    @CurrentAuth() auth: AccessTokenPayload,
    @Param('merchantId') merchantId: string,
    @Body() dto: CreateMerchantCustomerDto,
  ) {
    return this.merchantBilling.createCustomer(auth, merchantId, dto);
  }

  @Get(':merchantId/customers')
  listCustomers(
    @CurrentAuth() auth: AccessTokenPayload,
    @Param('merchantId') merchantId: string,
  ) {
    return this.merchantBilling.listCustomers(auth, merchantId);
  }

  @Post(':merchantId/subscriptions')
  createSubscription(
    @CurrentAuth() auth: AccessTokenPayload,
    @Param('merchantId') merchantId: string,
    @Body() dto: CreateMerchantSubscriptionDto,
  ) {
    return this.merchantBilling.createSubscription(auth, merchantId, dto);
  }

  @Get(':merchantId/subscriptions')
  listSubscriptions(
    @CurrentAuth() auth: AccessTokenPayload,
    @Param('merchantId') merchantId: string,
  ) {
    return this.merchantBilling.listSubscriptions(auth, merchantId);
  }

  @Post(':merchantId/subscriptions/:subscriptionId/cancel')
  cancelSubscription(
    @CurrentAuth() auth: AccessTokenPayload,
    @Param('merchantId') merchantId: string,
    @Param('subscriptionId') subscriptionId: string,
  ) {
    return this.merchantBilling.cancelSubscription(auth, merchantId, subscriptionId);
  }
}
