import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsUUID } from 'class-validator';
import { CreateCheckoutSessionDto } from './create-checkout-session.dto';

export class CreatePlatformCheckoutSessionDto extends CreateCheckoutSessionDto {
  @IsUUID()
  organizationId!: string;

  @IsUUID()
  billingAccountId!: string;

  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(250)
  @IsUUID('all', { each: true })
  coveredTenantIds!: string[];
}
