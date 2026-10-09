import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMerchantProviderIsolation1787500000000 implements MigrationInterface {
  name = 'AddMerchantProviderIsolation1787500000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "merchant_provider_connections" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "merchant_id" uuid NOT NULL,
        "client_app_id" uuid,
        "environment_id" uuid,
        "provider" character varying(30) NOT NULL,
        "status" character varying(20) NOT NULL DEFAULT 'active',
        "encrypted_access_secret" text NOT NULL,
        "encrypted_webhook_secret" text NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_merchant_provider_connections" PRIMARY KEY ("id"),
        CONSTRAINT "FK_merchant_provider_connections_merchant" FOREIGN KEY ("merchant_id") REFERENCES "merchant_accounts"("id") ON DELETE RESTRICT,
        CONSTRAINT "CHK_merchant_provider_connections_provider" CHECK ("provider" IN ('stripe', 'mercadopago')),
        CONSTRAINT "CHK_merchant_provider_connections_status" CHECK ("status" IN ('active', 'disabled'))
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_merchant_provider_connection_app_env" ON "merchant_provider_connections" ("merchant_id", "provider", "client_app_id", "environment_id") WHERE "status" = 'active' AND "client_app_id" IS NOT NULL AND "environment_id" IS NOT NULL`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_merchant_provider_connection_app" ON "merchant_provider_connections" ("merchant_id", "provider", "client_app_id") WHERE "status" = 'active' AND "client_app_id" IS NOT NULL AND "environment_id" IS NULL`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_merchant_provider_connection_env" ON "merchant_provider_connections" ("merchant_id", "provider", "environment_id") WHERE "status" = 'active' AND "client_app_id" IS NULL AND "environment_id" IS NOT NULL`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_merchant_provider_connection_default" ON "merchant_provider_connections" ("merchant_id", "provider") WHERE "status" = 'active' AND "client_app_id" IS NULL AND "environment_id" IS NULL`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_merchant_provider_connection_merchant_id" ON "merchant_provider_connections" ("merchant_id", "id")`);
    await queryRunner.query(`CREATE INDEX "IDX_merchant_provider_connection_merchant_status" ON "merchant_provider_connections" ("merchant_id", "status")`);
    await queryRunner.query(`ALTER TABLE "merchant_subscriptions" ADD COLUMN "provider_connection_id" uuid`);
    await queryRunner.query(`ALTER TABLE "merchant_subscriptions" ADD COLUMN "provider_subscription_id" character varying(191)`);
    await queryRunner.query(`ALTER TABLE "merchant_subscriptions" ADD COLUMN "provider_event_created_at" TIMESTAMPTZ`);
    await queryRunner.query(`ALTER TABLE "merchant_subscriptions" DROP CONSTRAINT "CHK_merchant_subscriptions_status"`);
    await queryRunner.query(`ALTER TABLE "merchant_subscriptions" ADD CONSTRAINT "CHK_merchant_subscriptions_status" CHECK ("status" IN ('active', 'trialing', 'past_due', 'unpaid', 'incomplete', 'paused', 'canceled'))`);
    await queryRunner.query(`ALTER TABLE "merchant_subscriptions" ADD CONSTRAINT "FK_merchant_subscriptions_provider_connection" FOREIGN KEY ("merchant_id", "provider_connection_id") REFERENCES "merchant_provider_connections"("merchant_id", "id") ON DELETE RESTRICT`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_merchant_subscription_external_id" ON "merchant_subscriptions" ("provider_connection_id", "provider_subscription_id") WHERE "provider_subscription_id" IS NOT NULL`);
    await queryRunner.query(`CREATE TABLE "merchant_provider_events" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "merchant_id" uuid NOT NULL,
      "connection_id" uuid NOT NULL,
      "provider_event_id" character varying(191) NOT NULL,
      "event_type" character varying(191) NOT NULL,
      "received_at" TIMESTAMP NOT NULL DEFAULT now(),
      CONSTRAINT "PK_merchant_provider_events" PRIMARY KEY ("id"),
      CONSTRAINT "FK_merchant_provider_events_connection" FOREIGN KEY ("merchant_id", "connection_id") REFERENCES "merchant_provider_connections"("merchant_id", "id") ON DELETE RESTRICT,
      CONSTRAINT "UQ_merchant_provider_events_event" UNIQUE ("connection_id", "provider_event_id")
    )`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`UPDATE "merchant_subscriptions" SET "status" = 'active' WHERE "status" IN ('trialing', 'past_due', 'unpaid', 'incomplete', 'paused')`);
    await queryRunner.query(`ALTER TABLE "merchant_subscriptions" DROP CONSTRAINT "CHK_merchant_subscriptions_status"`);
    await queryRunner.query(`ALTER TABLE "merchant_subscriptions" ADD CONSTRAINT "CHK_merchant_subscriptions_status" CHECK ("status" IN ('active', 'canceled'))`);
    await queryRunner.query(`DROP TABLE "merchant_provider_events"`);
    await queryRunner.query(`DROP INDEX "UQ_merchant_subscription_external_id"`);
    await queryRunner.query(`ALTER TABLE "merchant_subscriptions" DROP CONSTRAINT "FK_merchant_subscriptions_provider_connection"`);
    await queryRunner.query(`ALTER TABLE "merchant_subscriptions" DROP COLUMN "provider_event_created_at"`);
    await queryRunner.query(`ALTER TABLE "merchant_subscriptions" DROP COLUMN "provider_subscription_id"`);
    await queryRunner.query(`ALTER TABLE "merchant_subscriptions" DROP COLUMN "provider_connection_id"`);
    await queryRunner.query(`DROP TABLE "merchant_provider_connections"`);
  }
}
