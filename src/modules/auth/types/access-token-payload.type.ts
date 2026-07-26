export type AccessTokenPayload = {
  sub: string;
  tenantId: string;
  roles: string[];
  sessionId?: string | null;
  type?: 'access';
  iat?: number;
  exp?: number;
  aud?: string | string[];
  iss?: string;
};
