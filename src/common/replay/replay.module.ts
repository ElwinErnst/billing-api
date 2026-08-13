import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { ReplayNonce } from "./replay-nonce.entity";
import { ReplayNonceService } from "./replay-nonce.service";

@Module({
  imports: [TypeOrmModule.forFeature([ReplayNonce])],
  providers: [ReplayNonceService],
  exports: [ReplayNonceService],
})
export class ReplayModule {}
