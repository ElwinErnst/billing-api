import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentAuth } from '../../common/decorators/current-auth.decorator';
import { AccessJwtGuard } from '../../common/guards/access-jwt.guard';
import { AccessTokenPayload } from '../auth/types/access-token-payload.type';
import { WebhookEndpointService } from './webhook-endpoint.service';
import { CreateWebhookEndpointDto } from './dto/create-webhook-endpoint.dto';

/**
 * Manage outbound webhook endpoints for the caller's tenant. Tenant is derived
 * from the token, never the path (no IDOR). The signing secret is returned only
 * once, in the create response.
 */
@ApiTags('Webhook Endpoints')
@Controller('billing/webhook-endpoints')
@UseGuards(AccessJwtGuard)
export class WebhookEndpointsController {
  constructor(private readonly endpoints: WebhookEndpointService) {}

  private assertOwner(auth: AccessTokenPayload) {
    if (!auth.roles.includes('OWNER')) {
      throw new ForbiddenException('Only tenant owners can manage billing');
    }
  }

  @Get()
  list(@CurrentAuth() auth: AccessTokenPayload) {
    this.assertOwner(auth);
    return this.endpoints.list(auth.tenantId);
  }

  @Post()
  create(
    @CurrentAuth() auth: AccessTokenPayload,
    @Body() dto: CreateWebhookEndpointDto,
  ) {
    this.assertOwner(auth);
    return this.endpoints.create(auth.tenantId, dto);
  }

  @Post(':id/disable')
  disable(@CurrentAuth() auth: AccessTokenPayload, @Param('id') id: string) {
    this.assertOwner(auth);
    return this.endpoints.disable(auth.tenantId, id);
  }
}
