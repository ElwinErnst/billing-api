import {
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AccessJwtGuard } from '../../common/guards/access-jwt.guard';
import { CurrentAuth } from '../../common/decorators/current-auth.decorator';
import { AccessTokenPayload } from '../auth/types/access-token-payload.type';
import { AuditService } from './audit.service';
import { AuditCheckpointService } from './audit-checkpoint.service';

/**
 * Read API for this service's audit events (subscription lifecycle). Tenant is
 * taken from the verified access token — never a path param — so there is no
 * cross-tenant surface. OWNER/ADMIN only. Same response shape as the other
 * services' /audit-events so the console can merge them into one timeline.
 */
@Controller('billing')
export class AuditController {
  constructor(
    private readonly audit: AuditService,
    private readonly checkpoints: AuditCheckpointService,
  ) {}

  private assertAdmin(auth: AccessTokenPayload): void {
    const isAdmin = auth.roles.some((role) => ['OWNER', 'ADMIN'].includes(role));
    if (!isAdmin) {
      throw new ForbiddenException('Only OWNER or ADMIN can read the audit log');
    }
  }

  @Get('audit-events')
  @UseGuards(AccessJwtGuard)
  list(
    @CurrentAuth() auth: AccessTokenPayload,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    this.assertAdmin(auth);
    return this.audit.list(auth.tenantId, {
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  /**
   * Verify the tamper-evident hash chain AND its position against the latest
   * anchored checkpoint (so suffix truncation is caught). Returns the flat
   * ChainVerifyResult fields at the top level (the console reads them there) plus
   * the anchor fields.
   */
  @Get('audit-events/verify')
  @UseGuards(AccessJwtGuard)
  async verify(@CurrentAuth() auth: AccessTokenPayload) {
    this.assertAdmin(auth);
    const result = await this.checkpoints.verifyScopeAnchored(auth.tenantId);
    return {
      ...result.chain,
      anchorStatus: result.anchorStatus,
      anchorReason: result.anchorReason,
      anchoredSeq: result.anchoredSeq,
      anchoredAt: result.anchoredAt,
      anchorMode: result.anchorMode,
    };
  }

  /** Anchor the current chain head for this tenant (SIMULATED until a TSA is set). */
  @Post('audit-events/checkpoint')
  @UseGuards(AccessJwtGuard)
  @HttpCode(200)
  async checkpoint(@CurrentAuth() auth: AccessTokenPayload) {
    this.assertAdmin(auth);
    const outcome = await this.checkpoints.createCheckpoint(auth.tenantId);
    return { outcome };
  }
}
