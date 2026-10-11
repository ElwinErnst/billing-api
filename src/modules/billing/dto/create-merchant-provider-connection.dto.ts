import { IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateMerchantProviderConnectionDto {
  @IsIn(['stripe', 'mercadopago'])
  provider!: 'stripe' | 'mercadopago';

  @IsOptional()
  @IsUUID()
  clientAppId?: string;

  @IsOptional()
  @IsUUID()
  environmentId?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  accessSecret!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  webhookSecret!: string;
}
