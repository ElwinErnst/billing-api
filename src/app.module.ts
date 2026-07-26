import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import authConfig from './config/auth.config';
import authDirectoryConfig from './config/auth-directory.config';
import billingConfig from './config/billing.config';
import dbConfig from './config/db.config';
import internalConfig from './config/internal.config';
import { AuthModule } from './modules/auth/auth.module';
import { BillingModule } from './modules/billing/billing.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [authConfig, authDirectoryConfig, dbConfig, billingConfig, internalConfig],
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => configService.get('db')!,
    }),
    AuthModule,
    BillingModule,
  ],
})
export class AppModule {}
