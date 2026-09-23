import {
  Controller,
  ForbiddenException,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AccessJwtGuard } from '../../common/guards/access-jwt.guard';
import { CurrentAuth } from '../../common/decorators/current-auth.decorator';
import { AccessTokenPayload } from '../auth/types/access-token-payload.type';
import { AuditService } from './audit.service';

/**
 * Read API for this service's audit events (subscription lifecycle). Tenant is
 * taken from the verified access token — never a path param — so there is no
 * cross-tenant surface. OWNER/ADMIN only. Same response shape as the other
 * services' /audit-events so the console can merge them into one timeline.
 */
@Controller('billing')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get('audit-events')
  @UseGuards(AccessJwtGuard)
  list(
    @CurrentAuth() auth: AccessTokenPayload,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const isAdmin = auth.roles.some((role) =>
      ['OWNER', 'ADMIN'].includes(role),
    );
    if (!isAdmin) {
      throw new ForbiddenException(
        'Only OWNER or ADMIN can read the audit log',
      );
    }

    return this.audit.list(auth.tenantId, {
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  /** Verify the tamper-evident hash chain for this tenant's audit events. */
  @Get('audit-events/verify')
  @UseGuards(AccessJwtGuard)
  verify(@CurrentAuth() auth: AccessTokenPayload) {
    const isAdmin = auth.roles.some((role) => ['OWNER', 'ADMIN'].includes(role));
    if (!isAdmin) {
      throw new ForbiddenException('Only OWNER or ADMIN can read the audit log');
    }
    return this.audit.verifyChain(auth.tenantId);
  }
}
