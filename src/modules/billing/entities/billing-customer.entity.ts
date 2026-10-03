import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('billing_customers')
export class BillingCustomerEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('IDX_billing_customers_tenant_id', { unique: true, where: '"tenant_id" IS NOT NULL' })
  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId!: string | null;

  @Index('IDX_billing_customers_billing_account_id', {
    unique: true,
    where: '"billing_account_id" IS NOT NULL',
  })
  @Column({ name: 'billing_account_id', type: 'uuid', nullable: true })
  billingAccountId!: string | null;

  @Column({ name: 'provider', type: 'varchar', length: 30, default: 'mock' })
  provider!: string;

  @Column({ name: 'provider_customer_id', type: 'varchar', length: 191, nullable: true })
  providerCustomerId!: string | null;

  @Column({ name: 'billing_email', type: 'varchar', length: 191, nullable: true })
  billingEmail!: string | null;

  @Column({ name: 'company_name', type: 'varchar', length: 191, nullable: true })
  companyName!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
