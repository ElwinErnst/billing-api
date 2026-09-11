import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * MA-4a — provider connections.
 *
 * A configured link between a tenant/app/environment and a payment-provider
 * account. Stores only a logical secret_reference (never the token). Adds
 * provider_connection_id to payment intents so each payment records which
 * connection processed it. Additive: no backfill; a null connection means the
 * deployment's global provider config is used (current behaviour).
 */
export class AddProviderConnections1786800000000 implements MigrationInterface {
  name = 'AddProviderConnections1786800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "provider_connections" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "client_app_id" uuid,
        "environment_id" uuid,
        "provider" character varying(30) NOT NULL,
        "status" character varying(20) NOT NULL DEFAULT 'active',
        "secret_reference" character varying(191),
        "metadata" jsonb,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_provider_connections_id" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_provider_connections_tenant_provider_status" ON "provider_connections" ("tenant_id", "provider", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_provider_connections_scope" ON "provider_connections" ("tenant_id", "client_app_id", "environment_id", "provider")`,
    );

    await queryRunner.query(
      `ALTER TABLE "billing_payment_intents" ADD COLUMN "provider_connection_id" uuid`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "billing_payment_intents" DROP COLUMN "provider_connection_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_provider_connections_scope"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_provider_connections_tenant_provider_status"`,
    );
    await queryRunner.query(`DROP TABLE "provider_connections"`);
  }
}
