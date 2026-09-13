import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { ConfigService } from '@nestjs/config';
import { SecretCipher } from './secret-cipher';

const KEY = 'a'.repeat(64); // 32 bytes hex

function cipherWith(secretEncryptionKey: string): SecretCipher {
  const config = {
    get: () => ({ secretEncryptionKey }),
  } as unknown as ConfigService;
  return new SecretCipher(config);
}

test('round-trips a secret when a key is configured', () => {
  const cipher = cipherWith(KEY);
  const plaintext = 'whsec_deadbeef';
  const stored = cipher.encrypt(plaintext);

  assert.equal(cipher.enabled, true);
  assert.match(stored, /^v1:/);
  assert.ok(!stored.includes(plaintext));
  assert.equal(cipher.decrypt(stored), plaintext);
});

test('produces a fresh IV per encryption (non-deterministic ciphertext)', () => {
  const cipher = cipherWith(KEY);
  assert.notEqual(cipher.encrypt('same'), cipher.encrypt('same'));
});

test('passthrough (plaintext) when no key is configured', () => {
  const cipher = cipherWith('');
  assert.equal(cipher.enabled, false);
  assert.equal(cipher.encrypt('whsec_x'), 'whsec_x');
  assert.equal(cipher.decrypt('whsec_x'), 'whsec_x');
});

test('decrypts legacy plaintext rows (no v1 prefix) to themselves', () => {
  const cipher = cipherWith(KEY);
  assert.equal(cipher.decrypt('whsec_legacy_plaintext'), 'whsec_legacy_plaintext');
});

test('rejects a tampered auth tag (GCM auth)', () => {
  const cipher = cipherWith(KEY);
  const stored = cipher.encrypt('whsec_x');
  const [v, iv, tag, ct] = stored.split(':');
  // The tag is a fixed 16 bytes (24 base64 chars, no padding ambiguity):
  // flipping its first char is a guaranteed corruption.
  const flippedTag = (tag[0] === 'A' ? 'B' : 'A') + tag.slice(1);
  assert.throws(() => cipher.decrypt(`${v}:${iv}:${flippedTag}:${ct}`));
});

test('treats an invalid-length key as no key (plaintext passthrough)', () => {
  const cipher = cipherWith('abcd');
  assert.equal(cipher.enabled, false);
  assert.equal(cipher.encrypt('whsec_x'), 'whsec_x');
});
