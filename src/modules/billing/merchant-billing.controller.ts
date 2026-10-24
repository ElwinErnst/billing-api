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
import { AccessJwtGuard } from '../../common/guards/access-jwt.guard';
import { AuthContext, CurrentAuth } from '@elwinernst/nest-auth';
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
    @CurrentAuth() auth: AuthContext,
    @Body() dto: CreateMerchantAccountDto,
  ) {
    return this.merchantBilling.createMerchant(auth, dto);
  }

  @Get()
  listMerchants(@CurrentAuth() auth: AuthContext) {
    return this.merchantBilling.listMerchants(auth);
  }

  @Post(':merchantId/products')
  createProduct(
    @CurrentAuth() auth: AuthContext,
    @Param('merchantId') merchantId: string,
    @Body() dto: CreateMerchantProductDto,
  ) {
    return this.merchantBilling.createProduct(auth, merchantId, dto);
  }

  @Get(':merchantId/products')
  listProducts(
    @CurrentAuth() auth: AuthContext,
    @Param('merchantId') merchantId: string,
  ) {
    return this.merchantBilling.listProducts(auth, merchantId);
  }

  @Patch(':merchantId/products/:productId/archive')
  archiveProduct(
    @CurrentAuth() auth: AuthContext,
    @Param('merchantId') merchantId: string,
    @Param('productId') productId: string,
  ) {
    return this.merchantBilling.archiveProduct(auth, merchantId, productId);
  }

  @Post(':merchantId/products/:productId/prices')
  createPrice(
    @CurrentAuth() auth: AuthContext,
    @Param('merchantId') merchantId: string,
    @Param('productId') productId: string,
    @Body() dto: CreateMerchantPriceDto,
  ) {
    return this.merchantBilling.createPrice(auth, merchantId, productId, dto);
  }

  @Get(':merchantId/products/:productId/prices')
  listPrices(
    @CurrentAuth() auth: AuthContext,
    @Param('merchantId') merchantId: string,
    @Param('productId') productId: string,
  ) {
    return this.merchantBilling.listPrices(auth, merchantId, productId);
  }

  @Patch(':merchantId/prices/:priceId/archive')
  archivePrice(
    @CurrentAuth() auth: AuthContext,
    @Param('merchantId') merchantId: string,
    @Param('priceId') priceId: string,
  ) {
    return this.merchantBilling.archivePrice(auth, merchantId, priceId);
  }

  @Post(':merchantId/customers')
  createCustomer(
    @CurrentAuth() auth: AuthContext,
    @Param('merchantId') merchantId: string,
    @Body() dto: CreateMerchantCustomerDto,
  ) {
    return this.merchantBilling.createCustomer(auth, merchantId, dto);
  }

  @Get(':merchantId/customers')
  listCustomers(
    @CurrentAuth() auth: AuthContext,
    @Param('merchantId') merchantId: string,
  ) {
    return this.merchantBilling.listCustomers(auth, merchantId);
  }

  @Post(':merchantId/subscriptions')
  createSubscription(
    @CurrentAuth() auth: AuthContext,
    @Param('merchantId') merchantId: string,
    @Body() dto: CreateMerchantSubscriptionDto,
  ) {
    return this.merchantBilling.createSubscription(auth, merchantId, dto);
  }

  @Get(':merchantId/subscriptions')
  listSubscriptions(
    @CurrentAuth() auth: AuthContext,
    @Param('merchantId') merchantId: string,
  ) {
    return this.merchantBilling.listSubscriptions(auth, merchantId);
  }

  @Post(':merchantId/subscriptions/:subscriptionId/cancel')
  cancelSubscription(
    @CurrentAuth() auth: AuthContext,
    @Param('merchantId') merchantId: string,
    @Param('subscriptionId') subscriptionId: string,
  ) {
    return this.merchantBilling.cancelSubscription(auth, merchantId, subscriptionId);
  }
}
