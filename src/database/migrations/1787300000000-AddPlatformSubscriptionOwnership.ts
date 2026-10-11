import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPlatformSubscriptionOwnership1787300000000 implements MigrationInterface {
  name = 'AddPlatformSubscriptionOwnership1787300000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "billing_subscriptions" ADD "billing_account_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "billing_subscriptions" ADD "organization_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "billing_subscriptions" ADD "covered_tenant_ids" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "billing_subscriptions" ADD "subscription_domain" character varying(20) NOT NULL DEFAULT 'PLATFORM'`,
    );
    await queryRunner.query(
      `ALTER TABLE "billing_subscriptions" ADD CONSTRAINT "CHK_billing_subscriptions_platform_domain" CHECK ("subscription_domain" = 'PLATFORM')`,
    );
    await queryRunner.query(
      `ALTER TABLE "billing_subscriptions" ALTER COLUMN "tenant_id" DROP NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_billing_subscriptions_billing_account_id" ON "billing_subscriptions" ("billing_account_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_billing_subscriptions_billing_account_created" ON "billing_subscriptions" ("billing_account_id", "created_at")`,
    );

    await queryRunner.query(
      `ALTER TABLE "billing_customers" ADD "billing_account_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "billing_customers" ALTER COLUMN "tenant_id" DROP NOT NULL`,
    );
    await queryRunner.query(
      `DROP INDEX "IDX_2abf97465a7ce3cf6e18a8508e"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_billing_customers_tenant_id" ON "billing_customers" ("tenant_id") WHERE "tenant_id" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_billing_customers_billing_account_id" ON "billing_customers" ("billing_account_id") WHERE "billing_account_id" IS NOT NULL`,
    );

    await queryRunner.query(
      `ALTER TABLE "billing_period_closes" ADD "billing_account_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "billing_period_closes" ALTER COLUMN "tenant_id" DROP NOT NULL`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "billing_subscriptions" SET "tenant_id" = ("covered_tenant_ids"::jsonb ->> 0)::uuid WHERE "tenant_id" IS NULL AND "covered_tenant_ids" IS NOT NULL`,
    );
    await queryRunner.query(
      `UPDATE "billing_period_closes" c SET "tenant_id" = (s."covered_tenant_ids"::jsonb ->> 0)::uuid FROM "billing_subscriptions" s WHERE c."subscription_id" = s."id" AND c."tenant_id" IS NULL AND s."covered_tenant_ids" IS NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "billing_period_closes" ALTER COLUMN "tenant_id" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "billing_period_closes" DROP COLUMN "billing_account_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "IDX_billing_customers_billing_account_id"`,
    );
    await queryRunner.query(`DROP INDEX "IDX_billing_customers_tenant_id"`);
    await queryRunner.query(
      `ALTER TABLE "billing_customers" ALTER COLUMN "tenant_id" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "billing_customers" DROP COLUMN "billing_account_id"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_2abf97465a7ce3cf6e18a8508e" ON "billing_customers" ("tenant_id")`,
    );
    await queryRunner.query(
      `DROP INDEX "IDX_billing_subscriptions_billing_account_created"`,
    );
    await queryRunner.query(
      `DROP INDEX "IDX_billing_subscriptions_billing_account_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "billing_subscriptions" ALTER COLUMN "tenant_id" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "billing_subscriptions" DROP COLUMN "subscription_domain"`,
    );
    await queryRunner.query(
      `ALTER TABLE "billing_subscriptions" DROP COLUMN "covered_tenant_ids"`,
    );
    await queryRunner.query(
      `ALTER TABLE "billing_subscriptions" DROP COLUMN "organization_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "billing_subscriptions" DROP COLUMN "billing_account_id"`,
    );
  }
}
