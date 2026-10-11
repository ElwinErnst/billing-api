import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type MerchantSubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'unpaid'
  | 'incomplete'
  | 'paused'
  | 'canceled';

@Entity('merchant_subscriptions')
@Index(['merchantId', 'status', 'currentPeriodEndsAt'])
@Index(['merchantId', 'customerId', 'createdAt'])
@Index('UQ_merchant_subscription_external_id', ['providerConnectionId', 'providerSubscriptionId'], { unique: true, where: 'provider_subscription_id IS NOT NULL' })
export class MerchantSubscriptionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'merchant_id', type: 'uuid' })
  merchantId!: string;

  @Column({ name: 'customer_id', type: 'uuid' })
  customerId!: string;

  @Column({ name: 'product_id', type: 'uuid' })
  productId!: string;

  @Column({ name: 'price_id', type: 'uuid' })
  priceId!: string;

  @Column({ name: 'provider_connection_id', type: 'uuid', nullable: true })
  providerConnectionId!: string | null;

  @Column({ name: 'provider_subscription_id', type: 'varchar', length: 191, nullable: true })
  providerSubscriptionId!: string | null;

  @Column({ name: 'provider_event_created_at', type: 'timestamptz', nullable: true })
  providerEventCreatedAt!: Date | null;

  @Column({ name: 'status', type: 'varchar', length: 20, default: 'active' })
  status!: MerchantSubscriptionStatus;

  @Column({ name: 'current_period_started_at', type: 'timestamptz' })
  currentPeriodStartedAt!: Date;

  @Column({ name: 'current_period_ends_at', type: 'timestamptz' })
  currentPeriodEndsAt!: Date;

  @Column({ name: 'canceled_at', type: 'timestamptz', nullable: true })
  canceledAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
