import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import {
  JwtAccessStrategy,
  NEST_AUTH_OPTIONS,
  NestAuthOptions,
} from '@elwinernst/nest-auth';
import type { AuthConfig } from './types/auth-config.type';

@Module({
  imports: [PassportModule.register({ defaultStrategy: 'jwt-access' })],
  providers: [
    {
      provide: NEST_AUTH_OPTIONS,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): NestAuthOptions => {
        const auth = configService.get<AuthConfig>('auth')!;
        return {
          issuer: auth.issuer,
          audience: auth.audience,
          secret: auth.accessSecret,
        };
      },
    },
    JwtAccessStrategy,
  ],
  exports: [PassportModule],
})
export class AuthModule {}
