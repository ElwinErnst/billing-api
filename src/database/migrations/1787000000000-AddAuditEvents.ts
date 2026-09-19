import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 2b-4 — Billing audit events.
 *
 * Per-service normalized audit store (see audit-event.types.ts). billing-api
 * owns its own audit_events table; the console aggregates each service's
 * `/audit-events` endpoint into the unified audit timeline. Read path is per
 * tenant, newest first, so the index is (tenant_id, occurred_at). Uses
 * gen_random_uuid() (core in Postgres 13+) so no uuid-ossp extension is needed.
 */
export class AddAuditEvents1787000000000 implements MigrationInterface {
  name = 'AddAuditEvents1787000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "audit_events" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "system" character varying(16) NOT NULL,
        "category" character varying(16) NOT NULL,
        "action" character varying(64) NOT NULL,
        "actor_type" character varying(16),
        "actor_id" uuid,
        "resource_type" character varying(32),
        "resource_id" character varying(128),
        "outcome" character varying(16) NOT NULL,
        "detail" jsonb,
        "occurred_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_audit_events" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_audit_events_tenant_occurred" ON "audit_events" ("tenant_id", "occurred_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_audit_events_tenant_occurred"`);
    await queryRunner.query(`DROP TABLE "audit_events"`);
  }
}
