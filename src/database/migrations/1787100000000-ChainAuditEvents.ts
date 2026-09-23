import { MigrationInterface, QueryRunner } from 'typeorm';
import {
  CURRENT_SERIALIZER,
  type AuditEventFields,
} from '../../modules/audit/chain/audit-canonical.util';

/**
 * C-2 — make audit_events tamper-evident.
 *
 * Adds the hash-chain columns, then backfills existing rows into a chain per
 * scope (= tenant_id) so the whole table verifies, not just rows written after
 * this. occurred_at is truncated to milliseconds first: the app assigns ms
 * precision going forward, and the hash commits to occurred_at.toISOString(), so
 * stored values must round-trip through a JS Date (ms) identically at verify.
 *
 * On a fresh DB the table is empty and the backfill is a no-op.
 */
export class ChainAuditEvents1787100000000 implements MigrationInterface {
  name = 'ChainAuditEvents1787100000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "audit_events" ADD COLUMN "scope" character varying(64)`);
    await q.query(`ALTER TABLE "audit_events" ADD COLUMN "seq" bigint`);
    await q.query(`ALTER TABLE "audit_events" ADD COLUMN "event_hash" char(64)`);
    await q.query(`ALTER TABLE "audit_events" ADD COLUMN "prev_hash" char(64)`);
    await q.query(`ALTER TABLE "audit_events" ADD COLUMN "chain_hash" char(64)`);
    await q.query(
      `ALTER TABLE "audit_events" ADD COLUMN "schema_version" integer NOT NULL DEFAULT 1`,
    );
    await q.query(
      `ALTER TABLE "audit_events" ADD COLUMN "hash_alg" character varying(20) NOT NULL DEFAULT 'sha256'`,
    );

    // Normalize precision so occurred_at round-trips through JS Date (ms).
    await q.query(
      `UPDATE "audit_events" SET "occurred_at" = date_trunc('milliseconds', "occurred_at")`,
    );

    // Backfill: chain existing rows per scope, oldest first (id breaks ties).
    const rows: Array<{
      id: string;
      tenant_id: string;
      system: string;
      category: string;
      action: string;
      actor_type: string | null;
      actor_id: string | null;
      resource_type: string | null;
      resource_id: string | null;
      outcome: string;
      detail: Record<string, unknown> | null;
      occurred_at: Date;
    }> = await q.query(
      `SELECT id, tenant_id, system, category, action, actor_type, actor_id,
              resource_type, resource_id, outcome, detail, occurred_at
       FROM "audit_events"
       ORDER BY tenant_id, occurred_at, id`,
    );

    const seqByScope = new Map<string, bigint>();
    const prevHashByScope = new Map<string, string | null>();

    for (const r of rows) {
      const scope = r.tenant_id;
      const seq = (seqByScope.get(scope) ?? 0n) + 1n;
      seqByScope.set(scope, seq);
      const prevHash = prevHashByScope.get(scope) ?? null;

      const fields: AuditEventFields = {
        scope,
        seq: seq.toString(),
        tenantId: r.tenant_id,
        system: r.system,
        category: r.category,
        action: r.action,
        actorType: r.actor_type,
        actorId: r.actor_id,
        resourceType: r.resource_type,
        resourceId: r.resource_id,
        outcome: r.outcome,
        detail: r.detail,
        occurredAt: new Date(r.occurred_at).toISOString(),
      };
      const eventHash = CURRENT_SERIALIZER.computeEventHash(fields);
      const chainHash = CURRENT_SERIALIZER.computeChainHash(prevHash, eventHash);
      prevHashByScope.set(scope, chainHash);

      await q.query(
        `UPDATE "audit_events"
         SET scope = $1, seq = $2, event_hash = $3, prev_hash = $4, chain_hash = $5,
             schema_version = $6, hash_alg = $7
         WHERE id = $8`,
        [
          scope,
          seq.toString(),
          eventHash,
          prevHash,
          chainHash,
          CURRENT_SERIALIZER.version,
          CURRENT_SERIALIZER.hashAlg,
          r.id,
        ],
      );
    }

    await q.query(`ALTER TABLE "audit_events" ALTER COLUMN "scope" SET NOT NULL`);
    await q.query(`ALTER TABLE "audit_events" ALTER COLUMN "seq" SET NOT NULL`);
    await q.query(`ALTER TABLE "audit_events" ALTER COLUMN "event_hash" SET NOT NULL`);
    await q.query(`ALTER TABLE "audit_events" ALTER COLUMN "chain_hash" SET NOT NULL`);
    await q.query(
      `CREATE UNIQUE INDEX "UQ_audit_events_scope_seq" ON "audit_events" ("scope", "seq")`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX "UQ_audit_events_scope_seq"`);
    for (const col of [
      'scope',
      'seq',
      'event_hash',
      'prev_hash',
      'chain_hash',
      'schema_version',
      'hash_alg',
    ]) {
      await q.query(`ALTER TABLE "audit_events" DROP COLUMN "${col}"`);
    }
  }
}
