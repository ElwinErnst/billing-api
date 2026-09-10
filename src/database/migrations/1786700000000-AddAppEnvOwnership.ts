import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * MA-3 — application/environment ownership on billing records.
 *
 * Adds nullable client_app_id / environment_id to the records that can be owned
 * below the tenant. Purely additive: existing rows and user-token (dashboard)
 * flows stay tenant-level (null). Values are populated going forward from the
 * service-account token context (auth-api MA-1/MA-2). No backfill — billing has
 * no application registry to infer historical ownership from.
 */
export class AddAppEnvOwnership1786700000000 implements MigrationInterface {
  name = 'AddAppEnvOwnership1786700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "billing_payment_intents" ADD COLUMN "client_app_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "billing_payment_intents" ADD COLUMN "environment_id" uuid`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_billing_payment_intents_client_app" ON "billing_payment_intents" ("client_app_id")`,
    );

    await queryRunner.query(
      `ALTER TABLE "billing_subscriptions" ADD COLUMN "client_app_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "billing_subscriptions" ADD COLUMN "environment_id" uuid`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_billing_subscriptions_client_app" ON "billing_subscriptions" ("client_app_id")`,
    );

    await queryRunner.query(
      `ALTER TABLE "billing_usage_events" ADD COLUMN "environment_id" uuid`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "billing_usage_events" DROP COLUMN "environment_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_billing_subscriptions_client_app"`,
    );
    await queryRunner.query(
      `ALTER TABLE "billing_subscriptions" DROP COLUMN "environment_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "billing_subscriptions" DROP COLUMN "client_app_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_billing_payment_intents_client_app"`,
    );
    await queryRunner.query(
      `ALTER TABLE "billing_payment_intents" DROP COLUMN "environment_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "billing_payment_intents" DROP COLUMN "client_app_id"`,
    );
  }
}
