import {
  Column,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type {
  AuditActorType,
  AuditCategory,
  AuditOutcome,
  AuditSystem,
} from '../audit-event.types';

/**
 * A normalized audit event owned by billing-api. Tamper-evident: rows form a hash
 * chain per `scope` (= tenantId), with a monotonic `seq` and event/prev/chain
 * hashes verified by the chain kit. `occurred_at` is assigned by the app (never
 * a DB default) so it can be committed to the hash deterministically.
 */
@Index(['scope', 'seq'], { unique: true })
@Index(['tenantId', 'occurredAt'])
@Entity('audit_events')
export class AuditEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId!: string;

  /** Chain partition. One monotonic seq per scope; here scope = tenantId. */
  @Column({ type: 'varchar', length: 64 })
  scope!: string;

  @Column({ type: 'bigint' })
  seq!: string; // bigint as string

  @Column({ type: 'varchar', length: 16 })
  system!: AuditSystem;

  @Column({ type: 'varchar', length: 16 })
  category!: AuditCategory;

  @Column({ type: 'varchar', length: 64 })
  action!: string;

  @Column({ type: 'varchar', length: 16, name: 'actor_type', nullable: true })
  actorType!: AuditActorType | null;

  @Column({ type: 'uuid', name: 'actor_id', nullable: true })
  actorId!: string | null;

  @Column({ type: 'varchar', length: 32, name: 'resource_type', nullable: true })
  resourceType!: string | null;

  @Column({ type: 'varchar', length: 128, name: 'resource_id', nullable: true })
  resourceId!: string | null;

  @Column({ type: 'varchar', length: 16 })
  outcome!: AuditOutcome;

  @Column({ type: 'jsonb', nullable: true })
  detail!: Record<string, unknown> | null;

  // App-assigned (ms precision), not a DB default — committed to the hash.
  @Column({ type: 'timestamptz', name: 'occurred_at' })
  occurredAt!: Date;

  @Column({ type: 'char', length: 64, name: 'event_hash' })
  eventHash!: string;

  @Column({ type: 'char', length: 64, name: 'prev_hash', nullable: true })
  prevHash!: string | null;

  @Column({ type: 'char', length: 64, name: 'chain_hash' })
  chainHash!: string;

  @Column({ type: 'int', name: 'schema_version', default: 1 })
  schemaVersion!: number;

  @Column({ type: 'varchar', length: 20, name: 'hash_alg', default: 'sha256' })
  hashAlg!: string;
}
