import { MigrationInterface, QueryRunner } from "typeorm";

export class AddReplayNonces1786500000000 implements MigrationInterface {
  name = "AddReplayNonces1786500000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "replay_nonces" ("key" character varying(255) NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_replay_nonces_key" PRIMARY KEY ("key"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_replay_nonces_expires_at" ON "replay_nonces" ("expires_at") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_replay_nonces_expires_at"`,
    );
    await queryRunner.query(`DROP TABLE "replay_nonces"`);
  }
}
