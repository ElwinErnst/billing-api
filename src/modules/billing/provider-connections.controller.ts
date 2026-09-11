import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentAuth } from '../../common/decorators/current-auth.decorator';
import { AccessJwtGuard } from '../../common/guards/access-jwt.guard';
import { AccessTokenPayload } from '../auth/types/access-token-payload.type';
import { ProviderConnectionService } from './provider-connection.service';
import { CreateProviderConnectionDto } from './dto/create-provider-connection.dto';

/**
 * Manage payment-provider connections for the caller's tenant. The tenant is
 * always derived from the token — never from the path — so a caller can only
 * manage its own connections (no tenant IDOR).
 */
@Controller('billing/provider-connections')
@UseGuards(AccessJwtGuard)
export class ProviderConnectionsController {
  constructor(private readonly connections: ProviderConnectionService) {}

  private assertOwner(auth: AccessTokenPayload) {
    if (!auth.roles.includes('OWNER')) {
      throw new ForbiddenException('Only tenant owners can manage billing');
    }
  }

  @Get()
  list(@CurrentAuth() auth: AccessTokenPayload) {
    this.assertOwner(auth);
    return this.connections.list(auth.tenantId);
  }

  @Post()
  create(
    @CurrentAuth() auth: AccessTokenPayload,
    @Body() dto: CreateProviderConnectionDto,
  ) {
    this.assertOwner(auth);
    return this.connections.create(auth.tenantId, dto);
  }

  @Post(':id/disable')
  disable(
    @CurrentAuth() auth: AccessTokenPayload,
    @Param('id') id: string,
  ) {
    this.assertOwner(auth);
    return this.connections.disable(auth.tenantId, id);
  }
}
