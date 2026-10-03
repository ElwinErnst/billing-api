import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateMerchantProductDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(191)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;
}
