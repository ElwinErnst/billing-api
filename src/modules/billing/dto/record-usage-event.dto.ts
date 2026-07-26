import {
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class RecordUsageEventDto {
  @IsUUID()
  tenantId!: string;

  @IsIn(['AUTH_API', 'VAULT_API', 'ZERO_TRUST_API'])
  addonCode!: 'AUTH_API' | 'VAULT_API' | 'ZERO_TRUST_API';

  @IsString()
  metric!: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsString()
  sourceService!: string;

  @IsOptional()
  @IsString()
  actorType?: string;

  @IsOptional()
  @IsUUID()
  clientAppId?: string;

  @IsOptional()
  @IsUUID()
  serviceAccountId?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
