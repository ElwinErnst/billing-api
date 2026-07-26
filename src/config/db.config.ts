import { registerAs } from '@nestjs/config';

export default registerAs('db', () => ({
  type: 'postgres' as const,
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_USER ?? 'billing',
  password: process.env.DB_PASSWORD ?? 'billing',
  database: process.env.DB_NAME ?? 'billing',
  autoLoadEntities: true,
  synchronize: process.env.DB_SYNC === 'true',
}));
