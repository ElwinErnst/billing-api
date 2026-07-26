import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type SubscriptionStatus = 'PENDING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED';
export type BillingCycle = 'monthly' | 'yearly';

@Entity('billing_subscriptions')
@Index(['tenantId', 'createdAt'])
export class BillingSubscriptionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'provider', type: 'varchar', length: 30, default: 'mock' })
  provider!: string;

  @Column({ name: 'provider_subscription_id', type: 'varchar', length: 191, nullable: true })
  providerSubscriptionId!: string | null;

  @Column({ name: 'provider_checkout_session_id', type: 'varchar', length: 191, nullable: true })
  providerCheckoutSessionId!: string | null;

  @Column({ name: 'status', type: 'varchar', length: 20, default: 'PENDING' })
  status!: SubscriptionStatus;

  @Column({ name: 'base_plan', type: 'varchar', length: 40 })
  basePlan!: string;

  @Column({ name: 'industry_package', type: 'varchar', length: 40, nullable: true })
  industryPackage!: string | null;

  @Column({ name: 'billing_cycle', type: 'varchar', length: 20, default: 'monthly' })
  billingCycle!: BillingCycle;

  @Column({ name: 'seats', type: 'int', default: 1 })
  seats!: number;

  @Column({ name: 'currency', type: 'varchar', length: 3, default: 'USD' })
  currency!: string;

  @Column({ name: 'amount_cents', type: 'int', default: 0 })
  amountCents!: number;

  @Column({ name: 'addon_amount_cents', type: 'int', default: 0 })
  addonAmountCents!: number;

  @Column({ name: 'api_addons', type: 'simple-json', nullable: true })
  apiAddons!: string[] | null;

  @Column({ name: 'checkout_url', type: 'text', nullable: true })
  checkoutUrl!: string | null;

  @Column({ name: 'current_period_ends_at', type: 'timestamptz', nullable: true })
  currentPeriodEndsAt!: Date | null;

  @Column({ name: 'trial_ends_at', type: 'timestamptz', nullable: true })
  trialEndsAt!: Date | null;

  @Column({ name: 'activated_at', type: 'timestamptz', nullable: true })
  activatedAt!: Date | null;

  @Column({ name: 'cancel_at_period_end', type: 'boolean', default: false })
  cancelAtPeriodEnd!: boolean;

  @Column({ name: 'scheduled_plan_code', type: 'varchar', length: 40, nullable: true })
  scheduledPlanCode!: string | null;

  @Column({ name: 'scheduled_industry_package', type: 'varchar', length: 40, nullable: true })
  scheduledIndustryPackage!: string | null;

  @Column({ name: 'scheduled_billing_cycle', type: 'varchar', length: 20, nullable: true })
  scheduledBillingCycle!: BillingCycle | null;

  @Column({ name: 'scheduled_seats', type: 'int', nullable: true })
  scheduledSeats!: number | null;

  @Column({ name: 'scheduled_api_addons', type: 'simple-json', nullable: true })
  scheduledApiAddons!: string[] | null;

  @Column({ name: 'scheduled_change_effective_at', type: 'timestamptz', nullable: true })
  scheduledChangeEffectiveAt!: Date | null;

  @Column({ name: 'data_deletion_due_at', type: 'timestamptz', nullable: true })
  dataDeletionDueAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
