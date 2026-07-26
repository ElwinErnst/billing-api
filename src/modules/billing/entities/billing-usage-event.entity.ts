import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { BillingApiAddonCode } from '../billing.catalog';

@Entity('billing_usage_events')
@Index(['tenantId', 'createdAt'])
@Index(['tenantId', 'addonCode', 'metric'])
export class BillingUsageEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'addon_code', type: 'varchar', length: 30 })
  addonCode!: BillingApiAddonCode;

  @Column({ name: 'metric', type: 'varchar', length: 80 })
  metric!: string;

  @Column({ name: 'quantity', type: 'int', default: 1 })
  quantity!: number;

  @Column({ name: 'source_service', type: 'varchar', length: 50 })
  sourceService!: string;

  @Column({ name: 'actor_type', type: 'varchar', length: 40, nullable: true })
  actorType!: string | null;

  @Column({ name: 'client_app_id', type: 'uuid', nullable: true })
  clientAppId!: string | null;

  @Column({ name: 'service_account_id', type: 'uuid', nullable: true })
  serviceAccountId!: string | null;

  @Column({ name: 'metadata_json', type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
