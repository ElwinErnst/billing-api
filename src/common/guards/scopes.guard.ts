import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRED_SCOPES_KEY } from '../decorators/require-scopes.decorator';
import { AccessTokenPayload } from '../../modules/auth/types/access-token-payload.type';

/**
 * Enforces `@RequireScopes(...)` for service-account (API-key) callers.
 *
 * Only service-account tokens carry scopes, so enforcement applies to them
 * alone: a service-account token must hold every required scope or the request
 * is rejected. Human/user tokens (actorType !== 'service_account') are exempt —
 * their authority comes from roles, checked elsewhere. Runs after the access
 * JWT guard, which populates req.user.
 */
@Injectable()
export class ScopesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(
      REQUIRED_SCOPES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!required || required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      user?: AccessTokenPayload;
    }>();
    const auth = request.user;

    // Only API-key callers are scope-gated; human tokens are role-governed.
    if (!auth || auth.actorType !== 'service_account') {
      return true;
    }

    const held = new Set(auth.scopes ?? []);
    const missing = required.filter((scope) => !held.has(scope));

    if (missing.length > 0) {
      throw new ForbiddenException(
        `Missing required scope(s): ${missing.join(', ')}`,
      );
    }

    return true;
  }
}
