import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('billing_period_closes')
@Index(['tenantId', 'closedAt'])
@Index(['subscriptionId', 'periodEndedAt'], { unique: true })
export class BillingPeriodCloseEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Index()
  @Column({ name: 'subscription_id', type: 'uuid' })
  subscriptionId!: string;

  @Column({ name: 'period_started_at', type: 'timestamptz' })
  periodStartedAt!: Date;

  @Column({ name: 'period_ended_at', type: 'timestamptz' })
  periodEndedAt!: Date;

  @Column({ name: 'currency', type: 'varchar', length: 3, default: 'USD' })
  currency!: string;

  @Column({ name: 'base_amount_cents', type: 'int', default: 0 })
  baseAmountCents!: number;

  @Column({ name: 'addon_amount_cents', type: 'int', default: 0 })
  addonAmountCents!: number;

  @Column({ name: 'overage_amount_cents', type: 'int', default: 0 })
  overageAmountCents!: number;

  @Column({ name: 'total_amount_cents', type: 'int', default: 0 })
  totalAmountCents!: number;

  @Column({ name: 'summary_json', type: 'jsonb' })
  summary!: Record<string, unknown>;

  @CreateDateColumn({ name: 'closed_at' })
  closedAt!: Date;
}
