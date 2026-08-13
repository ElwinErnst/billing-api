import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash, createHmac, timingSafeEqual } from "crypto";
import type { Request } from "express";

import { ReplayNonceService } from "../replay/replay-nonce.service";

function constantTimeEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function canonicalizeInternalRequest(input: {
  method: string;
  pathWithQuery: string;
  bodySha256Hex: string;
  tsMs: string;
  nonce: string;
}): string {
  return [
    input.method.toUpperCase(),
    input.pathWithQuery,
    input.bodySha256Hex,
    input.tsMs,
    input.nonce,
  ].join("\n");
}

@Injectable()
export class InternalServiceGuard implements CanActivate {
  constructor(
    private readonly configService: ConfigService,
    private readonly replay: ReplayNonceService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const provided = req.header("x-internal-service-secret");
    const expected = this.configService.get<string>("internal.serviceSecret");
    const hmacSecret = this.configService.get<string>("internal.hmacSecret");
    const tsHeader = req.header("x-internal-service-ts");
    const nonce = req.header("x-internal-service-nonce");
    const signature = req.header("x-internal-service-signature");
    const maxClockSkewMs =
      this.configService.get<number>("internal.maxClockSkewMs") ?? 30_000;

    if (!expected || !provided || !constantTimeEquals(provided, expected)) {
      throw new ForbiddenException("Invalid internal service secret");
    }

    if (!hmacSecret || !tsHeader || !nonce || !signature) {
      throw new ForbiddenException("Missing internal request signature");
    }

    const tsMs = Number(tsHeader);
    if (!Number.isFinite(tsMs)) {
      throw new ForbiddenException("Invalid internal request timestamp");
    }

    if (Math.abs(Date.now() - tsMs) > maxClockSkewMs) {
      throw new ForbiddenException("Internal request timestamp expired");
    }

    const rawBody =
      req.body == null
        ? ""
        : typeof req.body === "string"
          ? req.body
          : JSON.stringify(req.body);
    const pathWithQuery = req.originalUrl ?? req.url ?? "/";
    const bodySha256Hex = sha256Hex(rawBody);
    const canonical = canonicalizeInternalRequest({
      method: req.method,
      pathWithQuery,
      bodySha256Hex,
      tsMs: tsHeader,
      nonce,
    });
    const expectedSignature = createHmac("sha256", hmacSecret)
      .update(canonical)
      .digest("hex");

    if (!constantTimeEquals(signature, expectedSignature)) {
      throw new ForbiddenException("Invalid internal request signature");
    }

    // Only after the signature is verified do we record the nonce. Atomic
    // insert: a false return means the key already existed → replay.
    const replayKey = `${tsHeader}:${nonce}`;
    const expiresAt = new Date(Date.now() + maxClockSkewMs);
    const fresh = await this.replay.checkAndRecord(replayKey, expiresAt);
    if (!fresh) {
      throw new ForbiddenException("Internal request replay detected");
    }

    return true;
  }
}
