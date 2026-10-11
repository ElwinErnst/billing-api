import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateMerchantAccountDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(191)
  name!: string;
}
