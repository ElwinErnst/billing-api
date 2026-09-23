import { createHash } from 'crypto';

/**
 * COPIED KIT — tamper-evident audit chain. Kept byte-identical across
 * auth-api / billing-api / zerotrust-api (and derived from securechain-vault).
 * Any change here MUST be applied to every copy in the same PR, or cross-service
 * verification breaks. Migration target: a shared GitHub Packages npm package —
 * see the tamper-evident-audit-chain design note.
 *
 * Generic hashing primitives — no audit-event fields here, so this file is truly
 * portable. The event-shape-specific serializer lives in audit-canonical.util.ts.
 */

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

/** Canonical JSON: keys sorted, keys JSON-escaped (collision-safe). */
export function stableStringify(input: unknown): string {
  if (Array.isArray(input)) {
    return `[${input.map(stableStringify).join(',')}]`;
  }
  if (isPlainObject(input)) {
    const keys = Object.keys(input).sort();
    const props = keys.map(
      (key) => `${JSON.stringify(key)}:${stableStringify(input[key])}`,
    );
    return `{${props.join(',')}}`;
  }
  return JSON.stringify(input);
}

/**
 * Normalize a value to exactly the domain PostgreSQL jsonb can round-trip, using
 * the platform JSON algorithm, then reject anything jsonb cannot store. This is
 * what makes the hash commit to the value the DB actually persists and returns,
 * not arbitrary in-memory JS.
 */
export function normalizeJsonForStorage<T>(input: T): T {
  let normalized: T;
  try {
    const encoded = JSON.stringify(input);
    if (encoded === undefined) {
      throw new TypeError('top-level value has no JSON representation');
    }
    normalized = JSON.parse(encoded) as T;
  } catch {
    throw new TypeError('audit metadata must be JSON-serializable');
  }
  assertJsonbCompatible(normalized);
  return normalized;
}

function assertJsonbCompatible(value: unknown): void {
  if (typeof value === 'string') {
    assertJsonbCompatibleString(value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach(assertJsonbCompatible);
    return;
  }
  if (isPlainObject(value)) {
    for (const [key, nested] of Object.entries(value)) {
      assertJsonbCompatibleString(key);
      assertJsonbCompatible(nested);
    }
  }
}

function assertJsonbCompatibleString(value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code === 0) {
      throw new TypeError('audit metadata must be jsonb-compatible: NUL');
    }
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (index + 1 >= value.length || next < 0xdc00 || next > 0xdfff) {
        throw new TypeError(
          'audit metadata must be jsonb-compatible: unpaired UTF-16 surrogate',
        );
      }
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      throw new TypeError(
        'audit metadata must be jsonb-compatible: unpaired UTF-16 surrogate',
      );
    }
  }
}

export function sha256Hex(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}
