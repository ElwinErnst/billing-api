import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * An anchored checkpoint of an audit chain head. Recording {scope, headSeq,
 * headHash} and (in TIMESTAMPED mode) an RFC 3161 token over its hash lets the
 * verifier detect SUFFIX TRUNCATION — deleting the newest rows leaves a shorter
 * but internally-consistent chain that the row-by-row verifier alone cannot
 * catch, but that falls behind the anchored head here.
 *
 * status:
 *   TIMESTAMPED — a real RFC 3161 token was obtained over checkpoint_hash.
 *   SIMULATED   — no real token (dev/prod-without-TSA). Honest, not proof, but
 *                 still detects structural truncation against the stored head.
 */
@Index(['scope', 'createdAt'])
@Entity('audit_checkpoints')
export class AuditCheckpoint {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 64 })
  scope!: string;

  @Column({ type: 'bigint', name: 'head_seq' })
  headSeq!: string; // bigint as string

  @Column({ type: 'char', length: 64, name: 'head_hash' })
  headHash!: string;

  /** sha256 over the canonical {scope, headSeq, headHash} — the value timestamped. */
  @Column({ type: 'char', length: 64, name: 'checkpoint_hash' })
  checkpointHash!: string;

  @Column({ type: 'varchar', length: 20 })
  status!: 'TIMESTAMPED' | 'SIMULATED';

  /** RFC 3161 token (base64 DER). Null when simulated. */
  @Column({ type: 'text', name: 'timestamp_token_b64', nullable: true })
  timestampTokenB64!: string | null;

  @Column({ type: 'varchar', length: 255, name: 'tsa_url', nullable: true })
  tsaUrl!: string | null;

  @Column({ type: 'varchar', length: 120, name: 'tsa_serial', nullable: true })
  tsaSerial!: string | null;

  @Column({ type: 'timestamptz', name: 'timestamped_at', nullable: true })
  timestampedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
