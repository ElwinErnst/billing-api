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

export default registerAs('internal', () => ({
  serviceSecret: readSecret(
    'BILLING_INTERNAL_SERVICE_SECRET',
    'change-me-billing-internal-secret',
  ),
  hmacSecret: readSecret(
    'BILLING_INTERNAL_HMAC_SECRET',
    'change-me-billing-internal-hmac-secret',
  ),
  maxClockSkewMs: Number(
    process.env.BILLING_INTERNAL_MAX_CLOCK_SKEW_MS ?? 30000,
  ),
}));
