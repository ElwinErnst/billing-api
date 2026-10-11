import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type MerchantProvider = 'stripe' | 'mercadopago';

@Entity('merchant_provider_connections')
@Index(['merchantId', 'id'], { unique: true })
@Index(['merchantId', 'status'])
@Index('UQ_merchant_provider_connection_app_env', ['merchantId', 'provider', 'clientAppId', 'environmentId'], { unique: true, where: 'status = \'active\' AND client_app_id IS NOT NULL AND environment_id IS NOT NULL' })
@Index('UQ_merchant_provider_connection_app', ['merchantId', 'provider', 'clientAppId'], { unique: true, where: 'status = \'active\' AND client_app_id IS NOT NULL AND environment_id IS NULL' })
@Index('UQ_merchant_provider_connection_env', ['merchantId', 'provider', 'environmentId'], { unique: true, where: 'status = \'active\' AND client_app_id IS NULL AND environment_id IS NOT NULL' })
@Index('UQ_merchant_provider_connection_default', ['merchantId', 'provider'], { unique: true, where: 'status = \'active\' AND client_app_id IS NULL AND environment_id IS NULL' })
export class MerchantProviderConnectionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'merchant_id', type: 'uuid' })
  merchantId!: string;

  @Column({ name: 'client_app_id', type: 'uuid', nullable: true })
  clientAppId!: string | null;

  @Column({ name: 'environment_id', type: 'uuid', nullable: true })
  environmentId!: string | null;

  @Column({ name: 'provider', type: 'varchar', length: 30 })
  provider!: MerchantProvider;

  @Column({ name: 'status', type: 'varchar', length: 20, default: 'active' })
  status!: 'active' | 'disabled';

  @Column({ name: 'encrypted_access_secret', type: 'text' })
  encryptedAccessSecret!: string;

  @Column({ name: 'encrypted_webhook_secret', type: 'text' })
  encryptedWebhookSecret!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
