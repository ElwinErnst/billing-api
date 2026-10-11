import { IsIn, IsInt, IsString, Matches, Min } from 'class-validator';

export class CreateMerchantPriceDto {
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency!: string;

  @IsInt()
  @Min(1)
  unitAmountCents!: number;

  @IsIn(['monthly', 'yearly'])
  billingInterval!: 'monthly' | 'yearly';
}
