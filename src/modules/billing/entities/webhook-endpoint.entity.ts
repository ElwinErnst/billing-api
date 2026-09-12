import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * A consumer-app URL that receives signed payment events for a specific
 * app/environment. Replaces the per-request webhookUrl + single global secret:
 * each endpoint has its own signing secret and its own event subscription.
 *
 * The signing secret is stored recoverable (we are the signer and need it to
 * compute the HMAC); it is generated server-side and returned only once at
 * creation. A later encrypted-at-rest backend can wrap this column without an
 * API change.
 */
@Entity('webhook_endpoints')
@Index(['tenantId', 'clientAppId', 'environmentId'])
export class WebhookEndpointEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'client_app_id', type: 'uuid', nullable: true })
  clientAppId!: string | null;

  @Column({ name: 'environment_id', type: 'uuid', nullable: true })
  environmentId!: string | null;

  @Column({ name: 'url', type: 'varchar', length: 1024 })
  url!: string;

  // Recoverable signing secret (we sign; consumer verifies). Returned once.
  @Column({ name: 'secret', type: 'text' })
  secret!: string;

  @Column({ name: 'secret_preview', type: 'varchar', length: 40 })
  secretPreview!: string;

  @Column({ name: 'enabled', type: 'boolean', default: true })
  enabled!: boolean;

  // Subscribed event names (see webhook-events.ts). Stored comma-joined.
  @Column({ name: 'events', type: 'simple-array' })
  events!: string[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
