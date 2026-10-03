import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type MerchantPriceInterval = 'monthly' | 'yearly';
export type MerchantPriceStatus = 'active' | 'archived';

@Entity('merchant_prices')
@Index(['merchantId', 'id', 'productId'], { unique: true })
@Index(['merchantId', 'productId', 'status'])
export class MerchantPriceEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'merchant_id', type: 'uuid' })
  merchantId!: string;

  @Column({ name: 'product_id', type: 'uuid' })
  productId!: string;

  @Column({ name: 'currency', type: 'varchar', length: 3 })
  currency!: string;

  @Column({ name: 'unit_amount_cents', type: 'int' })
  unitAmountCents!: number;

  @Column({ name: 'billing_interval', type: 'varchar', length: 20 })
  billingInterval!: MerchantPriceInterval;

  @Column({ name: 'status', type: 'varchar', length: 20, default: 'active' })
  status!: MerchantPriceStatus;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
