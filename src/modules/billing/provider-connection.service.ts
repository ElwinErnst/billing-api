import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProviderConnectionEntity } from './entities/provider-connection.entity';
import { CreateProviderConnectionDto } from './dto/create-provider-connection.dto';

@Injectable()
export class ProviderConnectionService {
  constructor(
    @InjectRepository(ProviderConnectionEntity)
    private readonly connectionsRepo: Repository<ProviderConnectionEntity>,
  ) {}

  async list(tenantId: string) {
    const connections = await this.connectionsRepo.find({
      where: { tenantId },
      order: { createdAt: 'ASC' },
    });
    return connections.map((c) => this.serialize(c));
  }

  async create(tenantId: string, dto: CreateProviderConnectionDto) {
    const connection = this.connectionsRepo.create({
      tenantId,
      clientAppId: dto.clientAppId ?? null,
      environmentId: dto.environmentId ?? null,
      provider: dto.provider,
      status: 'active',
      secretReference: dto.secretReference ?? null,
      metadata: dto.metadata ?? null,
    });
    return this.serialize(await this.connectionsRepo.save(connection));
  }

  async disable(tenantId: string, id: string) {
    const connection = await this.connectionsRepo.findOne({
      where: { id, tenantId },
    });
    if (!connection) {
      throw new NotFoundException('Provider connection not found');
    }
    connection.status = 'disabled';
    return this.serialize(await this.connectionsRepo.save(connection));
  }

  /**
   * Pick the most specific active connection for a caller's context. Specificity
   * order: exact app+env > app-only > env-only > tenant-level. Returns null when
   * none is configured (caller falls back to the deployment's global config).
   */
  async resolveForContext(
    tenantId: string,
    clientAppId: string | null | undefined,
    environmentId: string | null | undefined,
    provider: string,
  ): Promise<ProviderConnectionEntity | null> {
    const candidates = await this.connectionsRepo.find({
      where: { tenantId, provider: provider as never, status: 'active' },
    });

    const scored = candidates
      .map((c) => ({ c, score: this.matchScore(c, clientAppId, environmentId) }))
      .filter((x) => x.score >= 0)
      .sort((a, b) => b.score - a.score);

    return scored.length > 0 ? scored[0].c : null;
  }

  /**
   * -1 = the connection targets an app/env the caller is not in (no match).
   * Higher score = more specific match.
   */
  private matchScore(
    connection: ProviderConnectionEntity,
    clientAppId: string | null | undefined,
    environmentId: string | null | undefined,
  ): number {
    let score = 0;
    if (connection.clientAppId !== null) {
      if (connection.clientAppId !== (clientAppId ?? null)) {
        return -1;
      }
      score += 2;
    }
    if (connection.environmentId !== null) {
      if (connection.environmentId !== (environmentId ?? null)) {
        return -1;
      }
      score += 1;
    }
    return score;
  }

  private serialize(c: ProviderConnectionEntity) {
    return {
      id: c.id,
      tenantId: c.tenantId,
      clientAppId: c.clientAppId,
      environmentId: c.environmentId,
      provider: c.provider,
      status: c.status,
      secretReference: c.secretReference,
      metadata: c.metadata,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    };
  }
}
