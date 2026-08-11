import "reflect-metadata";
import { DataSource } from "typeorm";

/**
 * TypeORM DataSource used by the CLI (migration:generate / run / revert).
 * Entities are picked up by glob so every `*.entity.ts` is included — the
 * generated baseline must cover the whole schema, not a hand-maintained subset.
 * The running app configures TypeORM separately via config/db.config.ts.
 */
export default new DataSource({
  type: "postgres",
  host: process.env.DB_HOST ?? "localhost",
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_USER ?? "billing",
  password: process.env.DB_PASSWORD ?? "billing",
  database: process.env.DB_NAME ?? "billing",
  entities: ["src/**/*.entity.ts"],
  migrations: ["src/database/migrations/*.ts"],
});
