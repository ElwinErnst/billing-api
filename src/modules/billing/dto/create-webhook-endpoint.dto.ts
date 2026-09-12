import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsOptional,
  IsUrl,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { WEBHOOK_EVENTS } from '../webhook-events';

export class CreateWebhookEndpointDto {
  @IsUrl({ require_tld: false })
  @MaxLength(1024)
  url!: string;

  @IsOptional()
  @IsUUID()
  clientAppId?: string;

  @IsOptional()
  @IsUUID()
  environmentId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsIn(WEBHOOK_EVENTS, { each: true })
  events!: string[];
}
