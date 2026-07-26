import {
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac, randomUUID } from 'crypto';
import type { AuthDirectoryConfig } from './types/auth-directory-config.type';
import type {
  RemoteTenantSummary,
  TenantBillingSyncPayload,
} from './types/tenant-billing-sync-payload.type';

@Injectable()
export class AuthDirectoryService {
  private readonly cfg: AuthDirectoryConfig;

  constructor(private readonly config: ConfigService) {
    this.cfg = this.config.get<AuthDirectoryConfig>('authDirectory')!;
  }

  async updateTenantBillingProfile(
    tenantId: string,
    payload: TenantBillingSyncPayload,
  ) {
    const url = this.buildUrl(`internal/tenants/${tenantId}`);
    return this.fetchJson(url.toString(), {
      method: 'PATCH',
      body: payload,
    });
  }

  async getTenant(tenantId: string) {
    const url = this.buildUrl(`internal/tenants/${tenantId}`);
    return this.fetchJson<RemoteTenantSummary>(url.toString(), {
      method: 'GET',
    });
  }

  private buildUrl(path: string): URL {
    const base = this.cfg.baseUrl.endsWith('/')
      ? this.cfg.baseUrl
      : `${this.cfg.baseUrl}/`;

    return new URL(path, base);
  }

  private buildSignedHeaders(
    method: string,
    url: URL,
    body?: string,
  ): Record<string, string> {
    const normalizedBody = body ?? '{}';
    const ts = String(Date.now());
    const nonce = randomUUID();
    const bodySha256Hex = createHash('sha256')
      .update(normalizedBody)
      .digest('hex');
    const canonical = [
      method.toUpperCase(),
      `${url.pathname}${url.search}`,
      bodySha256Hex,
      ts,
      nonce,
    ].join('\n');
    const signature = createHmac('sha256', this.cfg.hmacSecret)
      .update(canonical)
      .digest('hex');

    return {
      'x-internal-service-secret': this.cfg.serviceSecret,
      'x-internal-service-ts': ts,
      'x-internal-service-nonce': nonce,
      'x-internal-service-signature': signature,
    };
  }

  private async fetchJson<T>(
    url: string,
    options: {
      method: 'GET' | 'PATCH';
      body?: unknown;
    },
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.cfg.timeoutMs);
    const parsedUrl = new URL(url);
    const body =
      options.body == null ? undefined : JSON.stringify(options.body);
    const headers = this.buildSignedHeaders(options.method, parsedUrl, body);

    try {
      const res = await fetch(url, {
        method: options.method,
        headers: {
          ...headers,
          ...(options.method === 'PATCH'
            ? { 'content-type': 'application/json' }
            : {}),
        },
        body,
        signal: controller.signal,
      });

      if (res.status === 404) {
        throw new NotFoundException('Auth directory resource not found');
      }

      if (res.status === 403) {
        throw new ForbiddenException('Auth directory rejected service request');
      }

      if (!res.ok) {
        throw new InternalServerErrorException(
          `Auth directory request failed with status ${res.status}`,
        );
      }

      return (await res.json()) as T;
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }

      throw new InternalServerErrorException('Auth directory request failed');
    } finally {
      clearTimeout(timeout);
    }
  }
}
