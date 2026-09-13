import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from 'crypto';
import type { BillingConfig } from './types/billing-config.type';

const VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;

/**
 * Envelope encryption for secrets stored at rest (e.g. webhook signing
 * secrets). AES-256-GCM under a 32-byte key from `BILLING_SECRET_ENC_KEY`
 * (hex). Ciphertext format: `v1:<iv>:<tag>:<ct>` (all base64).
 *
 * Backward/forward compatible by design:
 *  - No key configured  → passthrough (store/return plaintext, with a warning).
 *    Keeps dev/local working without provisioning a key.
 *  - Legacy plaintext rows (no `v1:` prefix) decrypt to themselves, so existing
 *    secrets keep working with no data migration.
 * Swapping to a KMS later means replacing this one class.
 */
@Injectable()
export class SecretCipher {
  private readonly logger = new Logger(SecretCipher.name);
  private readonly key: Buffer | null;

  constructor(configService: ConfigService) {
    const raw =
      configService.get<BillingConfig>('billing')!.secretEncryptionKey;
    if (!raw) {
      this.key = null;
    } else {
      const key = Buffer.from(raw, 'hex');
      if (key.length !== 32) {
        this.logger.error(
          'BILLING_SECRET_ENC_KEY must be 32 bytes (64 hex chars); secrets will be stored in plaintext',
        );
        this.key = null;
      } else {
        this.key = key;
      }
    }
  }

  get enabled(): boolean {
    return this.key !== null;
  }

  encrypt(plaintext: string): string {
    if (!this.key) {
      // No key: store as-is. Never block on a missing key in dev/local.
      return plaintext;
    }
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${VERSION}:${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`;
  }

  decrypt(stored: string): string {
    if (!stored.startsWith(`${VERSION}:`)) {
      // Legacy plaintext row — return as-is.
      return stored;
    }
    if (!this.key) {
      throw new Error(
        'Secret is encrypted but BILLING_SECRET_ENC_KEY is not configured',
      );
    }
    const [, ivB64, tagB64, ctB64] = stored.split(':');
    const decipher = createDecipheriv(
      ALGORITHM,
      this.key,
      Buffer.from(ivB64, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    const pt = Buffer.concat([
      decipher.update(Buffer.from(ctB64, 'base64')),
      decipher.final(),
    ]);
    return pt.toString('utf8');
  }
}
