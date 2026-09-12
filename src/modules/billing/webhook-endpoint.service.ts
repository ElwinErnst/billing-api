import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { Repository } from 'typeorm';
import { WebhookEndpointEntity } from './entities/webhook-endpoint.entity';
import { CreateWebhookEndpointDto } from './dto/create-webhook-endpoint.dto';

@Injectable()
export class WebhookEndpointService {
  constructor(
    @InjectRepository(WebhookEndpointEntity)
    private readonly endpointsRepo: Repository<WebhookEndpointEntity>,
  ) {}

  async list(tenantId: string) {
    const endpoints = await this.endpointsRepo.find({
      where: { tenantId },
      order: { createdAt: 'ASC' },
    });
    // Never expose the full secret on list — preview only.
    return endpoints.map((e) => this.serialize(e));
  }

  async create(tenantId: string, dto: CreateWebhookEndpointDto) {
    const secret = `whsec_${randomBytes(24).toString('hex')}`;
    const endpoint = this.endpointsRepo.create({
      tenantId,
      clientAppId: dto.clientAppId ?? null,
      environmentId: dto.environmentId ?? null,
      url: dto.url,
      secret,
      secretPreview: `••••${secret.slice(-6)}`,
      enabled: true,
      events: dto.events,
    });
    const saved = await this.endpointsRepo.save(endpoint);
    // The plaintext secret is returned exactly once, here.
    return { ...this.serialize(saved), secret };
  }

  async disable(tenantId: string, id: string) {
    const endpoint = await this.endpointsRepo.findOne({
      where: { id, tenantId },
    });
    if (!endpoint) {
      throw new NotFoundException('Webhook endpoint not found');
    }
    endpoint.enabled = false;
    return this.serialize(await this.endpointsRepo.save(endpoint));
  }

  /**
   * All enabled endpoints that should receive `event` for a payment in the
   * given context. A tenant-level endpoint (null app/env) matches every payment
   * in the tenant; an app/env-scoped endpoint matches only its own scope.
   */
  async resolveTargets(
    tenantId: string,
    clientAppId: string | null,
    environmentId: string | null,
    event: string,
  ): Promise<WebhookEndpointEntity[]> {
    const endpoints = await this.endpointsRepo.find({
      where: { tenantId, enabled: true },
    });
    return endpoints.filter(
      (e) =>
        (e.clientAppId === null || e.clientAppId === clientAppId) &&
        (e.environmentId === null || e.environmentId === environmentId) &&
        e.events.includes(event),
    );
  }

  private serialize(e: WebhookEndpointEntity) {
    return {
      id: e.id,
      tenantId: e.tenantId,
      clientAppId: e.clientAppId,
      environmentId: e.environmentId,
      url: e.url,
      secretPreview: e.secretPreview,
      enabled: e.enabled,
      events: e.events,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    };
  }
}
