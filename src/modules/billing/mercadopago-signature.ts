import { ForbiddenException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';

export type MercadoPagoSignatureInput = {
  dataId?: string;
  signature?: string;
  requestId?: string;
};

/**
 * Verify Mercado Pago's `x-signature` HMAC over the manifest
 * `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`.
 *
 * Pure and self-contained so the security-critical verification can be unit
 * tested in isolation. The caller decides what to do when no secret is
 * configured; this function assumes `secret` is set and throws
 * `ForbiddenException` on any missing/malformed/invalid signature.
 */
export function verifyMercadoPagoSignature(
  input: MercadoPagoSignatureInput,
  secret: string,
): void {
  if (!input.signature || !input.requestId || !input.dataId) {
    throw new ForbiddenException('Missing Mercado Pago webhook signature');
  }

  const parts = Object.fromEntries(
    input.signature.split(',').map((kv) => {
      const [k, v] = kv.split('=');
      return [k?.trim(), v?.trim()];
    }),
  );
  const ts = parts['ts'];
  const v1 = parts['v1'];
  if (!ts || !v1) {
    throw new ForbiddenException('Malformed Mercado Pago webhook signature');
  }

  // MP lowercases the id in the manifest when it is alphanumeric.
  const id = input.dataId.toLowerCase();
  const manifest = `id:${id};request-id:${input.requestId};ts:${ts};`;
  const expected = createHmac('sha256', secret).update(manifest).digest('hex');

  const a = Buffer.from(expected);
  const b = Buffer.from(v1);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new ForbiddenException('Invalid Mercado Pago webhook signature');
  }
}
