import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * MA-5 — per-app/environment webhook endpoints.
 *
 * A registered consumer URL with its own signing secret and event subscription,
 * replacing the single global secret + per-request webhookUrl. The secret is
 * stored recoverable (we sign) and returned only once at creation. Additive:
 * the legacy per-request webhookUrl path keeps working alongside this.
 */
export class AddWebhookEndpoints1786900000000 implements MigrationInterface {
  name = 'AddWebhookEndpoints1786900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "webhook_endpoints" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "client_app_id" uuid,
        "environment_id" uuid,
        "url" character varying(1024) NOT NULL,
        "secret" text NOT NULL,
        "secret_preview" character varying(40) NOT NULL,
        "enabled" boolean NOT NULL DEFAULT true,
        "events" text NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_webhook_endpoints_id" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_webhook_endpoints_scope" ON "webhook_endpoints" ("tenant_id", "client_app_id", "environment_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_webhook_endpoints_scope"`,
    );
    await queryRunner.query(`DROP TABLE "webhook_endpoints"`);
  }
}
