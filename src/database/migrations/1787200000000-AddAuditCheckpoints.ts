import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * C-5 — anchored checkpoints of the audit chain head.
 *
 * Lets the verifier detect suffix truncation (deleting the newest rows), which
 * the row-by-row chain cannot catch on its own. SIMULATED-first: rows are stored
 * without a real RFC 3161 token until a TSA is configured; the token columns are
 * nullable for that later TIMESTAMPED mode.
 */
export class AddAuditCheckpoints1787200000000 implements MigrationInterface {
  name = 'AddAuditCheckpoints1787200000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `CREATE TABLE "audit_checkpoints" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "scope" character varying(64) NOT NULL,
        "head_seq" bigint NOT NULL,
        "head_hash" char(64) NOT NULL,
        "checkpoint_hash" char(64) NOT NULL,
        "status" character varying(20) NOT NULL,
        "timestamp_token_b64" text,
        "tsa_url" character varying(255),
        "tsa_serial" character varying(120),
        "timestamped_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_audit_checkpoints" PRIMARY KEY ("id")
      )`,
    );
    await q.query(
      `CREATE INDEX "IDX_audit_checkpoints_scope_created" ON "audit_checkpoints" ("scope", "created_at")`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX "IDX_audit_checkpoints_scope_created"`);
    await q.query(`DROP TABLE "audit_checkpoints"`);
  }
}
