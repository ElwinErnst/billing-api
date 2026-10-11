import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('merchant_customers')
@Index(['merchantId', 'id'], { unique: true })
@Index(['merchantId', 'externalCustomerId'], { unique: true })
export class MerchantCustomerEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'merchant_id', type: 'uuid' })
  merchantId!: string;

  /** Identifier owned by the integrating SaaS, not an Auth API tenant ID. */
  @Column({ name: 'external_customer_id', type: 'varchar', length: 191 })
  externalCustomerId!: string;

  /** Optional customer-tenant reference in the integrating SaaS's own domain. */
  @Column({ name: 'external_tenant_id', type: 'varchar', length: 191, nullable: true })
  externalTenantId!: string | null;

  @Column({ name: 'name', type: 'varchar', length: 191, nullable: true })
  name!: string | null;

  @Column({ name: 'email', type: 'varchar', length: 191, nullable: true })
  email!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
