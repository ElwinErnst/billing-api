import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateMerchantCustomerDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(191)
  externalCustomerId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  externalTenantId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  name?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(191)
  email?: string;
}
