import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { ScheduleModule } from "@nestjs/schedule";
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";
import { TypeOrmModule } from "@nestjs/typeorm";
import authConfig from "./config/auth.config";
import authDirectoryConfig from "./config/auth-directory.config";
import billingConfig from "./config/billing.config";
import dbConfig from "./config/db.config";
import internalConfig from "./config/internal.config";
import { AuthModule } from "./modules/auth/auth.module";
import { BillingModule } from "./modules/billing/billing.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [
        authConfig,
        authDirectoryConfig,
        dbConfig,
        billingConfig,
        internalConfig,
      ],
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => configService.get("db")!,
    }),
    ScheduleModule.forRoot(),
    // Per-IP rate limiting (300 req/min default, tunable via env). Payment
    // webhooks are exempted with @SkipThrottle() in the billing controller.
    ThrottlerModule.forRoot([
      {
        ttl: Number(process.env.THROTTLE_TTL_MS ?? 60_000),
        limit: Number(process.env.THROTTLE_LIMIT ?? 300),
      },
    ]),
    AuthModule,
    BillingModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
