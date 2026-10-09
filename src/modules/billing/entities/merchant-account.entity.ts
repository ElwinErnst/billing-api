import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type MerchantAccountStatus = 'active' | 'disabled';

@Entity('merchant_accounts')
@Index(['ownerTenantId', 'status'])
export class MerchantAccountEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'owner_tenant_id', type: 'uuid' })
  ownerTenantId!: string;

  @Column({ name: 'name', type: 'varchar', length: 191 })
  name!: string;

  @Column({ name: 'status', type: 'varchar', length: 20, default: 'active' })
  status!: MerchantAccountStatus;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
