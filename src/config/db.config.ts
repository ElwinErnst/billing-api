import { join } from "node:path";
import { registerAs } from "@nestjs/config";

export default registerAs("db", () => ({
  type: "postgres" as const,
  host: process.env.DB_HOST ?? "localhost",
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_USER ?? "billing",
  password: process.env.DB_PASSWORD ?? "billing",
  database: process.env.DB_NAME ?? "billing",
  autoLoadEntities: true,
  // Schema is owned by migrations (run on boot). DB_SYNC=true is only for
  // throwaway local experimentation, never in the stack.
  synchronize: process.env.DB_SYNC === "true",
  migrations: [join(__dirname, "..", "database", "migrations", "*.js")],
  migrationsRun: true,
}));
