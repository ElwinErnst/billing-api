import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditEvent } from './entities/audit-event.entity';
import { AuditCheckpoint } from './entities/audit-checkpoint.entity';
import { AuditService } from './audit.service';
import { AuditCheckpointService } from './audit-checkpoint.service';
import { AuditController } from './audit.controller';

@Module({
  imports: [TypeOrmModule.forFeature([AuditEvent, AuditCheckpoint])],
  controllers: [AuditController],
  providers: [AuditService, AuditCheckpointService],
  exports: [AuditService, AuditCheckpointService],
})
export class AuditModule {}
