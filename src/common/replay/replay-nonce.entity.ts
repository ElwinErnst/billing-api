import { Column, Entity, Index, PrimaryColumn } from "typeorm";

/**
 * Persisted anti-replay record for internal service-to-service requests.
 * The key is `${timestampMs}:${nonce}`; a row exists only for the short
 * replay window (maxClockSkewMs) and is pruned afterwards. Persisting this
 * (instead of an in-process Map) makes replay detection correct across
 * restarts and horizontally-scaled instances.
 */
@Entity("replay_nonces")
export class ReplayNonce {
  @PrimaryColumn({ name: "key", type: "varchar", length: 255 })
  key!: string;

  @Index()
  @Column({ name: "expires_at", type: "timestamptz" })
  expiresAt!: Date;
}
