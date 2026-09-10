export type AccessTokenPayload = {
  sub: string;
  tenantId: string;
  roles: string[];
  sessionId?: string | null;
  // Multi-app context, present on service-account tokens (auth-api MA-1/MA-2).
  // Absent on user/dashboard tokens — treated as tenant-level (null) ownership.
  actorType?: 'user' | 'service_account';
  clientAppId?: string;
  serviceAccountId?: string;
  environmentId?: string;
  scopes?: string[];
  type?: 'access';
  iat?: number;
  exp?: number;
  aud?: string | string[];
  iss?: string;
};
