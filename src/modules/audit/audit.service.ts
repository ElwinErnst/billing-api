import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AuditEvent } from './entities/audit-event.entity';
import type { AuditEventInput } from './audit-event.types';
import {
  CURRENT_SERIALIZER,
  type AuditEventFields,
} from './chain/audit-canonical.util';
import { verifyRows, type ChainRow, type ChainVerifyResult } from './chain/audit-chain';

export type ListAuditEventsOptions = {
  page?: number;
  limit?: number;
};

export type ListAuditEventsResult = {
  items: AuditEvent[];
  total: number;
  page: number;
  limit: number;
};

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(AuditEvent)
    private readonly repo: Repository<AuditEvent>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Record an audit event as a tamper-evident chain link. Fail-open by design:
   * an audit write must never break the action being audited. The append is
   * serialized per scope with a transaction-scoped advisory lock, so concurrent
   * writes to the same scope never race on the (scope, seq) unique constraint.
   */
  async emit(input: AuditEventInput): Promise<void> {
    const scope = input.tenantId;
    try {
      await this.dataSource.transaction(async (manager) => {
        const repo = manager.getRepository(AuditEvent);
        // Per-scope lock, released at COMMIT. hashtext() fits int4.
        await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [scope]);

        const last = await repo
          .createQueryBuilder('a')
          .where('a.scope = :scope', { scope })
          .orderBy('a.seq', 'DESC')
          .limit(1)
          .getOne();

        const seq = last ? (BigInt(last.seq) + 1n).toString() : '1';
        const prevHash = last ? last.chainHash : null;
        const occurredAt = new Date();

        const fields: AuditEventFields = {
          scope,
          seq,
          tenantId: input.tenantId,
          system: input.system,
          category: input.category,
          action: input.action,
          actorType: input.actorType ?? null,
          actorId: input.actorId ?? null,
          resourceType: input.resourceType ?? null,
          resourceId: input.resourceId ?? null,
          outcome: input.outcome,
          detail: input.detail ?? null,
          occurredAt: occurredAt.toISOString(),
        };
        const eventHash = CURRENT_SERIALIZER.computeEventHash(fields);
        const chainHash = CURRENT_SERIALIZER.computeChainHash(prevHash, eventHash);

        const row = repo.create({
          scope,
          seq,
          tenantId: input.tenantId,
          system: input.system,
          category: input.category,
          action: input.action,
          actorType: input.actorType ?? null,
          actorId: input.actorId ?? null,
          resourceType: input.resourceType ?? null,
          resourceId: input.resourceId ?? null,
          outcome: input.outcome,
          detail: input.detail ?? null,
          occurredAt,
          eventHash,
          prevHash,
          chainHash,
          schemaVersion: CURRENT_SERIALIZER.version,
          hashAlg: CURRENT_SERIALIZER.hashAlg,
        });
        await repo.save(row);
      });
    } catch (error) {
      this.logger.error(
        `Failed to record audit event '${input.action}' for tenant=${input.tenantId}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }
  }

  async list(
    tenantId: string,
    options: ListAuditEventsOptions = {},
  ): Promise<ListAuditEventsResult> {
    const page = Math.max(1, Math.floor(options.page ?? 1));
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, Math.floor(options.limit ?? DEFAULT_LIMIT)),
    );

    const [items, total] = await this.repo.findAndCount({
      where: { tenantId },
      order: { occurredAt: 'DESC' },
      take: limit,
      skip: (page - 1) * limit,
    });

    return { items, total, page, limit };
  }

  /** Verify the tamper-evident chain for a tenant's audit events. */
  async verifyChain(tenantId: string): Promise<ChainVerifyResult> {
    const rows = await this.repo.find({
      where: { scope: tenantId },
      order: { seq: 'ASC' },
    });

    const chainRows: ChainRow[] = rows.map((row) => ({
      scope: row.scope,
      seq: row.seq,
      tenantId: row.tenantId,
      system: row.system,
      category: row.category,
      action: row.action,
      actorType: row.actorType,
      actorId: row.actorId,
      resourceType: row.resourceType,
      resourceId: row.resourceId,
      outcome: row.outcome,
      detail: row.detail,
      occurredAt: row.occurredAt.toISOString(),
      prevHash: row.prevHash,
      eventHash: row.eventHash,
      chainHash: row.chainHash,
      schemaVersion: row.schemaVersion,
      hashAlg: row.hashAlg,
    }));

    return verifyRows(tenantId, chainRows);
  }
}
