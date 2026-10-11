import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMerchantBillingDomain1787400000000 implements MigrationInterface {
  name = 'AddMerchantBillingDomain1787400000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "merchant_accounts" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "owner_tenant_id" uuid NOT NULL,
        "name" character varying(191) NOT NULL,
        "status" character varying(20) NOT NULL DEFAULT 'active',
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_merchant_accounts" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_merchant_accounts_status" CHECK ("status" IN ('active', 'disabled'))
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_merchant_accounts_owner_status" ON "merchant_accounts" ("owner_tenant_id", "status")`,
    );

    await queryRunner.query(`
      CREATE TABLE "merchant_products" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "merchant_id" uuid NOT NULL,
        "name" character varying(191) NOT NULL,
        "description" text,
        "status" character varying(20) NOT NULL DEFAULT 'active',
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_merchant_products" PRIMARY KEY ("id"),
        CONSTRAINT "FK_merchant_products_merchant" FOREIGN KEY ("merchant_id") REFERENCES "merchant_accounts"("id") ON DELETE RESTRICT,
        CONSTRAINT "CHK_merchant_products_status" CHECK ("status" IN ('active', 'archived'))
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_merchant_products_merchant_id" ON "merchant_products" ("merchant_id", "id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_merchant_products_merchant_status" ON "merchant_products" ("merchant_id", "status")`,
    );

    await queryRunner.query(`
      CREATE TABLE "merchant_prices" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "merchant_id" uuid NOT NULL,
        "product_id" uuid NOT NULL,
        "currency" character varying(3) NOT NULL,
        "unit_amount_cents" integer NOT NULL,
        "billing_interval" character varying(20) NOT NULL,
        "status" character varying(20) NOT NULL DEFAULT 'active',
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_merchant_prices" PRIMARY KEY ("id"),
        CONSTRAINT "FK_merchant_prices_merchant" FOREIGN KEY ("merchant_id") REFERENCES "merchant_accounts"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_merchant_prices_product" FOREIGN KEY ("merchant_id", "product_id") REFERENCES "merchant_products"("merchant_id", "id") ON DELETE RESTRICT,
        CONSTRAINT "CHK_merchant_prices_amount" CHECK ("unit_amount_cents" > 0),
        CONSTRAINT "CHK_merchant_prices_currency" CHECK ("currency" ~ '^[A-Z]{3}$'),
        CONSTRAINT "CHK_merchant_prices_interval" CHECK ("billing_interval" IN ('monthly', 'yearly')),
        CONSTRAINT "CHK_merchant_prices_status" CHECK ("status" IN ('active', 'archived'))
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_merchant_prices_merchant_id_product_id" ON "merchant_prices" ("merchant_id", "id", "product_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_merchant_prices_product_status" ON "merchant_prices" ("merchant_id", "product_id", "status")`,
    );

    await queryRunner.query(`
      CREATE TABLE "merchant_customers" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "merchant_id" uuid NOT NULL,
        "external_customer_id" character varying(191) NOT NULL,
        "external_tenant_id" character varying(191),
        "name" character varying(191),
        "email" character varying(191),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_merchant_customers" PRIMARY KEY ("id"),
        CONSTRAINT "FK_merchant_customers_merchant" FOREIGN KEY ("merchant_id") REFERENCES "merchant_accounts"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_merchant_customers_merchant_id" ON "merchant_customers" ("merchant_id", "id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_merchant_customers_external_id" ON "merchant_customers" ("merchant_id", "external_customer_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "merchant_subscriptions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "merchant_id" uuid NOT NULL,
        "customer_id" uuid NOT NULL,
        "product_id" uuid NOT NULL,
        "price_id" uuid NOT NULL,
        "status" character varying(20) NOT NULL DEFAULT 'active',
        "current_period_started_at" TIMESTAMPTZ NOT NULL,
        "current_period_ends_at" TIMESTAMPTZ NOT NULL,
        "canceled_at" TIMESTAMPTZ,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_merchant_subscriptions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_merchant_subscriptions_merchant" FOREIGN KEY ("merchant_id") REFERENCES "merchant_accounts"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_merchant_subscriptions_customer" FOREIGN KEY ("merchant_id", "customer_id") REFERENCES "merchant_customers"("merchant_id", "id") ON DELETE RESTRICT,
        CONSTRAINT "FK_merchant_subscriptions_product" FOREIGN KEY ("merchant_id", "product_id") REFERENCES "merchant_products"("merchant_id", "id") ON DELETE RESTRICT,
        CONSTRAINT "FK_merchant_subscriptions_price_product" FOREIGN KEY ("merchant_id", "price_id", "product_id") REFERENCES "merchant_prices"("merchant_id", "id", "product_id") ON DELETE RESTRICT,
        CONSTRAINT "CHK_merchant_subscriptions_status" CHECK ("status" IN ('active', 'canceled')),
        CONSTRAINT "CHK_merchant_subscriptions_period" CHECK ("current_period_ends_at" > "current_period_started_at")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_merchant_subscriptions_merchant_status_period" ON "merchant_subscriptions" ("merchant_id", "status", "current_period_ends_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_merchant_subscriptions_customer_created" ON "merchant_subscriptions" ("merchant_id", "customer_id", "created_at")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "merchant_subscriptions"`);
    await queryRunner.query(`DROP TABLE "merchant_customers"`);
    await queryRunner.query(`DROP TABLE "merchant_prices"`);
    await queryRunner.query(`DROP TABLE "merchant_products"`);
    await queryRunner.query(`DROP TABLE "merchant_accounts"`);
  }
}
