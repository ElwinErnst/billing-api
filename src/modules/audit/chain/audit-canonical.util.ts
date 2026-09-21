import { normalizeJsonForStorage, sha256Hex, stableStringify } from './audit-hash.util';

/**
 * COPIED KIT — see audit-hash.util.ts. The generic verifier (audit-chain.ts) is
 * portable; THIS file is shape-specific: it commits the normalized AuditEvent
 * fields to a hash. The writer (AuditService) and the verifier build the payload
 * from this single source, so they can never disagree by a field.
 *
 * Unlike vault (which carries frozen legacy serializers v1..v4), these stores
 * are new — v1 starts clean with collision-safe canonical encoding.
 */

/** Canonical, hashable fields of a normalized audit event. */
export type AuditEventFields = {
  scope: string;
  seq: string; // bigint as string
  tenantId: string;
  system: string;
  category: string;
  action: string;
  actorType: string | null;
  actorId: string | null;
  resourceType: string | null;
  resourceId: string | null;
  outcome: string;
  detail: Record<string, unknown> | null;
  /** ISO-8601 instant assigned once by the application (never the DB default). */
  occurredAt: string;
};

export type AuditSerializer = {
  version: number;
  hashAlg: string;
  computeEventHash(f: AuditEventFields): string;
  computeChainHash(prevHash: string | null, eventHash: string): string;
};

/**
 * v1 payload — the field SET and values the hash commits to. Field order is
 * irrelevant (stableStringify sorts keys). Adding/removing/renaming a field is a
 * NEW version, never an edit to this one.
 */
function buildPayloadV1(f: AuditEventFields): Record<string, unknown> {
  return {
    scope: f.scope,
    seq: f.seq,
    tenantId: f.tenantId,
    system: f.system,
    category: f.category,
    action: f.action,
    actorType: f.actorType,
    actorId: f.actorId,
    resourceType: f.resourceType,
    resourceId: f.resourceId,
    outcome: f.outcome,
    detail: f.detail === null ? null : normalizeJsonForStorage(f.detail),
    occurredAt: f.occurredAt,
  };
}

const V1: AuditSerializer = {
  version: 1,
  hashAlg: 'sha256',
  computeEventHash(f) {
    return sha256Hex(stableStringify(buildPayloadV1(f)));
  },
  computeChainHash(prevHash, eventHash) {
    return sha256Hex(`${prevHash ?? ''}|${eventHash}`);
  },
};

const SERIALIZERS: Record<number, AuditSerializer> = { 1: V1 };

/** The serializer new rows are written under. */
export const CURRENT_SERIALIZER = V1;

/** Resolves the serializer for a row's schema version (null if unknown). */
export function getAuditSerializer(version: number): AuditSerializer | null {
  return SERIALIZERS[version] ?? null;
}
