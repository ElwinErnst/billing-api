import { IsEmail, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateCheckoutSessionDto {
  @IsIn(['GENERAL', 'FINTECH', 'GOVTECH', 'HEALTHTECH', 'LEGALTECH'])
  industry!: 'GENERAL' | 'FINTECH' | 'GOVTECH' | 'HEALTHTECH' | 'LEGALTECH';

  @IsIn(['BASE', 'GROWTH', 'BUSINESS', 'CUSTOM'])
  tier!: 'BASE' | 'GROWTH' | 'BUSINESS' | 'CUSTOM';

  @IsIn(['monthly', 'yearly'])
  billingCycle!: 'monthly' | 'yearly';

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5000)
  seats?: number;

  @IsOptional()
  @IsEmail()
  billingEmail?: string;

  @IsOptional()
  @IsString()
  companyName?: string;

  @IsOptional()
  @IsString()
  successUrl?: string;

  @IsOptional()
  @IsString()
  cancelUrl?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string' && value.trim()) return [value.trim()];
    return [];
  })
  @IsIn(['AUTH_API', 'VAULT_API', 'ZERO_TRUST_API'], { each: true })
  addOns?: Array<'AUTH_API' | 'VAULT_API' | 'ZERO_TRUST_API'>;
}
