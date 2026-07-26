import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtAccessStrategy } from './jwt-access.strategy';

@Module({
  imports: [PassportModule.register({ defaultStrategy: 'jwt-access' })],
  providers: [JwtAccessStrategy],
  exports: [PassportModule],
})
export class AuthModule {}
