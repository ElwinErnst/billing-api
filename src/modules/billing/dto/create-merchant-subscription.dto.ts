import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateMerchantSubscriptionDto {
  @IsUUID()
  customerId!: string;

  @IsUUID()
  priceId!: string;

  @IsOptional()
  @IsUUID()
  providerConnectionId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  providerSubscriptionId?: string;
}
