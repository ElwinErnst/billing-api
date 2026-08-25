import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPaymentIntents1786600000000 implements MigrationInterface {
  name = "AddPaymentIntents1786600000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "billing_payment_intents" (` +
        `"id" uuid NOT NULL DEFAULT uuid_generate_v4(), ` +
        `"tenant_id" uuid NOT NULL, ` +
        `"provider" character varying(30) NOT NULL DEFAULT 'mock', ` +
        `"status" character varying(20) NOT NULL DEFAULT 'PENDING', ` +
        `"amount_cents" integer NOT NULL, ` +
        `"currency" character varying(8) NOT NULL, ` +
        `"description" character varying(255), ` +
        `"external_reference" character varying(255), ` +
        `"metadata" jsonb, ` +
        `"webhook_url" character varying(512), ` +
        `"provider_preference_id" character varying(191), ` +
        `"provider_payment_id" character varying(191), ` +
        `"checkout_url" character varying(1024), ` +
        `"created_at" TIMESTAMP NOT NULL DEFAULT now(), ` +
        `"updated_at" TIMESTAMP NOT NULL DEFAULT now(), ` +
        `CONSTRAINT "PK_billing_payment_intents_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_billing_payment_intents_tenant_id" ON "billing_payment_intents" ("tenant_id") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_billing_payment_intents_tenant_id"`,
    );
    await queryRunner.query(`DROP TABLE "billing_payment_intents"`);
  }
}
