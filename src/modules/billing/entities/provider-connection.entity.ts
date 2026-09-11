import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type ProviderConnectionProvider = 'mercadopago' | 'stripe' | 'mock';
export type ProviderConnectionStatus = 'active' | 'disabled';

/**
 * A configured link between an organization/app/environment and a payment
 * provider account. The provider token itself is NEVER stored here: this row
 * holds only a `secretReference` (a logical name) that a resolver maps to the
 * actual credentials (env-based today; KMS/encrypted store later). Null
 * clientAppId/environmentId mean the connection applies at the broader scope;
 * checkout resolves the most specific active connection for the caller.
 */
@Entity('provider_connections')
@Index(['tenantId', 'provider', 'status'])
@Index(['tenantId', 'clientAppId', 'environmentId', 'provider'])
export class ProviderConnectionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'client_app_id', type: 'uuid', nullable: true })
  clientAppId!: string | null;

  @Column({ name: 'environment_id', type: 'uuid', nullable: true })
  environmentId!: string | null;

  @Column({ name: 'provider', type: 'varchar', length: 30 })
  provider!: ProviderConnectionProvider;

  @Column({ name: 'status', type: 'varchar', length: 20, default: 'active' })
  status!: ProviderConnectionStatus;

  // Logical name resolved to real credentials by ProviderSecretResolver.
  // Null = fall back to the deployment's global provider config.
  @Column({
    name: 'secret_reference',
    type: 'varchar',
    length: 191,
    nullable: true,
  })
  secretReference!: string | null;

  @Column({ name: 'metadata', type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
