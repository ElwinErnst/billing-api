import { IsUUID } from 'class-validator';

export class CreateMerchantSubscriptionDto {
  @IsUUID()
  customerId!: string;

  @IsUUID()
  priceId!: string;
}
