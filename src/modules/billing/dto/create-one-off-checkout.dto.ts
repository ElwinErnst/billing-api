import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * A single line item in a one-off checkout. Amounts are integer minor units
 * (e.g. cents / centavos) so no floating-point money ever crosses the wire.
 */
export class OneOffCheckoutItemDto {
  @IsString()
  @MaxLength(191)
  title!: string;

  @IsInt()
  @Min(1)
  amountCents!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  quantity?: number;
}

/**
 * Create a single, non-recurring payment. This is the standalone-consumer entry
 * point (an external app charging its own end user), distinct from the
 * subscription/plan-oriented CreateCheckoutSessionDto.
 */
export class CreateOneOffCheckoutDto {
  @IsOptional()
  @IsIn(['mercadopago', 'mock'])
  provider?: 'mercadopago' | 'mock';

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => OneOffCheckoutItemDto)
  items!: OneOffCheckoutItemDto[];

  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string;

  @IsOptional()
  @IsEmail()
  payerEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  /**
   * The consumer's own reference for the thing being paid (e.g. an order id).
   * Round-tripped back verbatim on the outbound webhook so the app can map the
   * payment to its domain object.
   */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  externalReference?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  /** Where Sytadel will POST the signed payment event (phase 2). */
  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(512)
  webhookUrl?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  successUrl?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  failureUrl?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  pendingUrl?: string;
}
