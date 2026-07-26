import { registerAs } from '@nestjs/config';

function readSecret(envName: string, fallback: string) {
  const value = process.env[envName]?.trim();
  if (value) return value;

  const runtime = process.env.NODE_ENV ?? 'development';
  if (runtime === 'development' || runtime === 'test') {
    return fallback;
  }

  throw new Error(`${envName} must be configured outside development/test`);
}

export default registerAs('auth', () => ({
  issuer: process.env.BILLING_JWT_ISSUER ?? 'auth',
  audience: process.env.BILLING_JWT_AUDIENCE ?? 'zerotrust-api',
  accessSecret: readSecret('BILLING_JWT_ACCESS_SECRET', 'change-me-access-secret'),
}));
