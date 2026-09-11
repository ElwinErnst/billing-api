import {
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateProviderConnectionDto {
  @IsIn(['mercadopago', 'stripe', 'mock'])
  provider!: 'mercadopago' | 'stripe' | 'mock';

  @IsOptional()
  @IsUUID()
  clientAppId?: string;

  @IsOptional()
  @IsUUID()
  environmentId?: string;

  // Logical credential name (resolved by ProviderSecretResolver). Omit to use
  // the deployment's global provider config.
  @IsOptional()
  @IsString()
  @MaxLength(191)
  secretReference?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
