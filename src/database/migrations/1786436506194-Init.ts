import { MigrationInterface, QueryRunner } from "typeorm";

export class Init1786436506194 implements MigrationInterface {
  name = "Init1786436506194";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "billing_usage_events" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenant_id" uuid NOT NULL, "addon_code" character varying(30) NOT NULL, "metric" character varying(80) NOT NULL, "quantity" integer NOT NULL DEFAULT '1', "source_service" character varying(50) NOT NULL, "actor_type" character varying(40), "client_app_id" uuid, "service_account_id" uuid, "metadata_json" jsonb, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_70c19d30263f14aac829025a60c" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_dc1d79e777c43c43aec35c3b3a" ON "billing_usage_events" ("tenant_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_3a1a5df9a08e2b87ed1969fc19" ON "billing_usage_events" ("tenant_id", "addon_code", "metric") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_a2c2ebf19aa9fb28d899dc51df" ON "billing_usage_events" ("tenant_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "billing_subscriptions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenant_id" uuid NOT NULL, "provider" character varying(30) NOT NULL DEFAULT 'mock', "provider_subscription_id" character varying(191), "provider_checkout_session_id" character varying(191), "status" character varying(20) NOT NULL DEFAULT 'PENDING', "base_plan" character varying(40) NOT NULL, "industry_package" character varying(40), "billing_cycle" character varying(20) NOT NULL DEFAULT 'monthly', "seats" integer NOT NULL DEFAULT '1', "currency" character varying(3) NOT NULL DEFAULT 'USD', "amount_cents" integer NOT NULL DEFAULT '0', "addon_amount_cents" integer NOT NULL DEFAULT '0', "api_addons" text, "checkout_url" text, "current_period_ends_at" TIMESTAMP WITH TIME ZONE, "trial_ends_at" TIMESTAMP WITH TIME ZONE, "activated_at" TIMESTAMP WITH TIME ZONE, "cancel_at_period_end" boolean NOT NULL DEFAULT false, "scheduled_plan_code" character varying(40), "scheduled_industry_package" character varying(40), "scheduled_billing_cycle" character varying(20), "scheduled_seats" integer, "scheduled_api_addons" text, "scheduled_change_effective_at" TIMESTAMP WITH TIME ZONE, "data_deletion_due_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_da12bd094f95ed1a9ad21b0b2df" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_50be132a6ab352e89340cf5788" ON "billing_subscriptions" ("tenant_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_dc44c756514f6f2d592b382ab9" ON "billing_subscriptions" ("tenant_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "billing_period_closes" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenant_id" uuid NOT NULL, "subscription_id" uuid NOT NULL, "period_started_at" TIMESTAMP WITH TIME ZONE NOT NULL, "period_ended_at" TIMESTAMP WITH TIME ZONE NOT NULL, "currency" character varying(3) NOT NULL DEFAULT 'USD', "base_amount_cents" integer NOT NULL DEFAULT '0', "addon_amount_cents" integer NOT NULL DEFAULT '0', "overage_amount_cents" integer NOT NULL DEFAULT '0', "total_amount_cents" integer NOT NULL DEFAULT '0', "summary_json" jsonb NOT NULL, "closed_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_0dd66a6e9f2358e539f840ea029" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_d90f4b3b82e1f618ffc6188a5c" ON "billing_period_closes" ("tenant_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_8ea80cb70b0e67781e962553e3" ON "billing_period_closes" ("subscription_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_650a1edd88f71aa4c104259750" ON "billing_period_closes" ("subscription_id", "period_ended_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_cfc0daf8b356c909bfe8ad3e72" ON "billing_period_closes" ("tenant_id", "closed_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "billing_customers" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenant_id" uuid NOT NULL, "provider" character varying(30) NOT NULL DEFAULT 'mock', "provider_customer_id" character varying(191), "billing_email" character varying(191), "company_name" character varying(191), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_33443c37051e342361f61a54b86" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_2abf97465a7ce3cf6e18a8508e" ON "billing_customers" ("tenant_id") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_2abf97465a7ce3cf6e18a8508e"`,
    );
    await queryRunner.query(`DROP TABLE "billing_customers"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_cfc0daf8b356c909bfe8ad3e72"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_650a1edd88f71aa4c104259750"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_8ea80cb70b0e67781e962553e3"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_d90f4b3b82e1f618ffc6188a5c"`,
    );
    await queryRunner.query(`DROP TABLE "billing_period_closes"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_dc44c756514f6f2d592b382ab9"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_50be132a6ab352e89340cf5788"`,
    );
    await queryRunner.query(`DROP TABLE "billing_subscriptions"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_a2c2ebf19aa9fb28d899dc51df"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_3a1a5df9a08e2b87ed1969fc19"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_dc1d79e777c43c43aec35c3b3a"`,
    );
    await queryRunner.query(`DROP TABLE "billing_usage_events"`);
  }
}
