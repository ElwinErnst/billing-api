import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type BillingPaymentIntentStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED';

/**
 * A single, non-recurring payment initiated by a standalone consumer app.
 * Distinct from BillingSubscriptionEntity: no plan, no cycle, no seats — just an
 * amount, a provider checkout, and the consumer's passthrough reference so the
 * outbound webhook (phase 2) can map the result back to the app's domain object.
 */
@Entity('billing_payment_intents')
export class BillingPaymentIntentEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'provider', type: 'varchar', length: 30, default: 'mock' })
  provider!: string;

  @Column({ name: 'status', type: 'varchar', length: 20, default: 'PENDING' })
  status!: BillingPaymentIntentStatus;

  @Column({ name: 'amount_cents', type: 'integer' })
  amountCents!: number;

  @Column({ name: 'currency', type: 'varchar', length: 8 })
  currency!: string;

  @Column({ name: 'description', type: 'varchar', length: 255, nullable: true })
  description!: string | null;

  @Column({
    name: 'external_reference',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  externalReference!: string | null;

  @Column({ name: 'metadata', type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @Column({ name: 'webhook_url', type: 'varchar', length: 512, nullable: true })
  webhookUrl!: string | null;

  @Column({
    name: 'provider_preference_id',
    type: 'varchar',
    length: 191,
    nullable: true,
  })
  providerPreferenceId!: string | null;

  @Column({
    name: 'provider_payment_id',
    type: 'varchar',
    length: 191,
    nullable: true,
  })
  providerPaymentId!: string | null;

  @Column({ name: 'checkout_url', type: 'varchar', length: 1024, nullable: true })
  checkoutUrl!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
