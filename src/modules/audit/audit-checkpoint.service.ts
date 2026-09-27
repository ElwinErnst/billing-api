import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditCheckpoint } from './entities/audit-checkpoint.entity';
import { AuditEvent } from './entities/audit-event.entity';
import { AuditService } from './audit.service';
import { sha256Hex } from './chain/audit-hash.util';
import type { ChainVerifyResult } from './chain/audit-chain';

export type AnchorCheckStatus =
  | 'NO_CHECKPOINT'
  | 'ANCHORED_OK'
  | 'TRUNCATED'
  | 'DIVERGED'
  | 'CHECKPOINT_UNVERIFIED';

export type AnchoredVerifyResult = {
  chain: ChainVerifyResult;
  anchorStatus: AnchorCheckStatus;
  anchorReason: string | null;
  anchoredSeq: string | null;
  anchoredAt: string | null;
  anchorMode: 'TIMESTAMPED' | 'SIMULATED' | null;
};

export type CheckpointOutcome =
  | 'CREATED'
  | 'SKIPPED_EMPTY'
  | 'SKIPPED_BROKEN'
  | 'SKIPPED_UNCHANGED';

/** Binds scope + head seq + head chain-hash into the value a checkpoint attests. */
function computeCheckpointHash(
  scope: string,
  headSeq: string,
  headHash: string,
): string {
  return sha256Hex(`${scope}\n${headSeq}\n${headHash}`);
}

@Injectable()
export class AuditCheckpointService {
  private readonly logger = new Logger(AuditCheckpointService.name);

  constructor(
    @InjectRepository(AuditCheckpoint)
    private readonly repo: Repository<AuditCheckpoint>,
    @InjectRepository(AuditEvent)
    private readonly auditRepo: Repository<AuditEvent>,
    private readonly audit: AuditService,
  ) {}

  /**
   * Create a checkpoint for a scope. Refuses to anchor a broken chain (a bad
   * checkpoint would legitimize tampering) and skips when nothing new happened.
   * SIMULATED-first: no RFC 3161 token yet — the real TSA is a later env flip.
   */
  async createCheckpoint(scope: string): Promise<CheckpointOutcome> {
    const chain = await this.audit.verifyChain(scope);

    if (chain.status === 'EMPTY') return 'SKIPPED_EMPTY';
    if (chain.status === 'BROKEN' || !chain.headSeq || !chain.headHash) {
      this.logger.error(`Refusing to checkpoint scope=${scope}: chain is broken`);
      return 'SKIPPED_BROKEN';
    }

    const latest = await this.repo.findOne({
      where: { scope },
      order: { createdAt: 'DESC' },
    });
    if (latest && BigInt(latest.headSeq) >= BigInt(chain.headSeq)) {
      return 'SKIPPED_UNCHANGED';
    }

    const checkpointHash = computeCheckpointHash(
      scope,
      chain.headSeq,
      chain.headHash,
    );
    await this.repo.save(
      this.repo.create({
        scope,
        headSeq: chain.headSeq,
        headHash: chain.headHash,
        checkpointHash,
        status: 'SIMULATED',
        timestampTokenB64: null,
        tsaUrl: null,
        tsaSerial: null,
        timestampedAt: null,
      }),
    );
    this.logger.log(
      `Checkpointed scope=${scope} seq=${chain.headSeq} status=SIMULATED`,
    );
    return 'CREATED';
  }

  /**
   * Verify a scope's chain AND its position against the latest anchored
   * checkpoint. This is what catches suffix truncation: a chain shorter than the
   * anchor, or missing/altered at the anchored seq.
   */
  async verifyScopeAnchored(scope: string): Promise<AnchoredVerifyResult> {
    const chain = await this.audit.verifyChain(scope);
    const checkpoint = await this.repo.findOne({
      where: { scope },
      order: { createdAt: 'DESC' },
    });

    const base = {
      chain,
      anchoredSeq: checkpoint?.headSeq ?? null,
      anchoredAt: checkpoint?.createdAt?.toISOString() ?? null,
      anchorMode: checkpoint?.status ?? null,
    };

    if (!checkpoint) {
      return { ...base, anchorStatus: 'NO_CHECKPOINT', anchorReason: null };
    }
    if (chain.status === 'BROKEN') {
      return {
        ...base,
        anchorStatus: 'CHECKPOINT_UNVERIFIED',
        anchorReason: 'chain is broken; anchor comparison is not meaningful',
      };
    }

    const anchoredSeq = BigInt(checkpoint.headSeq);
    if (chain.headSeq === null || BigInt(chain.headSeq) < anchoredSeq) {
      return {
        ...base,
        anchorStatus: 'TRUNCATED',
        anchorReason: `chain head is behind the anchored checkpoint (seq ${checkpoint.headSeq})`,
      };
    }

    const rowAtAnchor = await this.auditRepo.findOne({
      where: { scope, seq: checkpoint.headSeq },
    });
    if (!rowAtAnchor) {
      return {
        ...base,
        anchorStatus: 'TRUNCATED',
        anchorReason: `anchored row (seq ${checkpoint.headSeq}) is missing`,
      };
    }
    if (rowAtAnchor.chainHash !== checkpoint.headHash) {
      return {
        ...base,
        anchorStatus: 'DIVERGED',
        anchorReason: `chain hash at anchored seq ${checkpoint.headSeq} differs from the checkpoint`,
      };
    }

    return { ...base, anchorStatus: 'ANCHORED_OK', anchorReason: null };
  }

  /** Distinct tenant scopes that have audit events. */
  async listScopes(): Promise<string[]> {
    const rows = await this.auditRepo
      .createQueryBuilder('a')
      .select('DISTINCT a.scope', 'scope')
      .getRawMany<{ scope: string }>();
    return rows.map((r) => r.scope);
  }

  async checkpointAllScopes(): Promise<void> {
    const scopes = await this.listScopes();
    for (const scope of scopes) {
      try {
        await this.createCheckpoint(scope);
      } catch (error) {
        this.logger.error(
          `Checkpoint failed for scope=${scope}: ${
            error instanceof Error ? error.message : 'unknown error'
          }`,
        );
      }
    }
  }

  /** Anchor every scope's chain head once a day. */
  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async scheduledCheckpoint(): Promise<void> {
    await this.checkpointAllScopes();
  }
}
