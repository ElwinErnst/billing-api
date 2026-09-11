import { SetMetadata } from '@nestjs/common';

export const REQUIRED_SCOPES_KEY = 'required_scopes';

/**
 * Declare the API scopes a service-account caller must hold to reach a handler.
 * Enforced by ScopesGuard. Has no effect on human/user tokens — those are
 * governed by role checks (e.g. OWNER), not API-key scopes.
 */
export const RequireScopes = (...scopes: string[]) =>
  SetMetadata(REQUIRED_SCOPES_KEY, scopes);
