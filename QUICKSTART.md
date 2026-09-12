# Sytadel Billing — multi-app quickstart

Take a payment from a standalone app in a few calls, with **no provider token in
your app** and a **signed webhook** back. The full contract is the OpenAPI spec
served at `/docs` (UI) and `/docs-json` (machine-readable).

## Model

```
Organization (tenant)
  └── Application (client app)
        └── Environment (development | staging | production)
              ├── API keys (service accounts, scoped)
              ├── Provider connections (MercadoPago / Stripe)
              └── Webhook endpoints
```

Every request resolves to a trusted context — `tenant`, `application`,
`environment`, `scopes` — derived from the API key, **never** from client-sent
IDs.

## 1. One-time setup (owner, via the dashboard/admin token)

```bash
# Create an application (auth-api). A `production` environment is auto-created.
POST /tenants/{tenantId}/client-apps            { "name": "Reservations", "slug": "reservations" }

# (optional) add a development environment
POST /tenants/{tenantId}/client-apps/{appId}/environments   { "name": "development" }

# Issue a scoped API key for the app
POST /tenants/{tenantId}/client-apps/{appId}/service-accounts
     { "name": "reservations-prod", "scopes": ["payments:create", "payments:read"] }
# → returns clientSecret ONCE. Store it.

# Connect a payment provider for this app/environment (billing-api, owner)
POST /billing/provider-connections
     { "provider": "mercadopago", "clientAppId": "{appId}", "environmentId": "{prodEnvId}",
       "secretReference": "reservations-prod" }

# Register a webhook endpoint (billing-api, owner). Secret is returned ONCE.
POST /billing/webhook-endpoints
     { "url": "https://reservas.example.com/api/sytadel/webhook",
       "clientAppId": "{appId}", "environmentId": "{prodEnvId}",
       "events": ["payment.approved", "payment.failed"] }
```

## 2. Get an access token for the API key

```bash
curl -X POST https://auth.example.com/api/integrations/service-account-token \
  -H 'content-type: application/json' \
  -d '{"tenantSlug":"acme","clientAppId":"<appId>","serviceAccountId":"<saId>","clientSecret":"<secret>"}'
# → { "accessToken": "<jwt>" }   (carries clientAppId, environmentId, scopes)
```

## 3. Create a checkout (needs the `payments:create` scope)

```bash
curl -X POST https://billing.example.com/api/billing/one-off-checkout \
  -H "authorization: Bearer <jwt>" -H 'content-type: application/json' \
  -d '{
    "provider": "mercadopago",
    "items": [{ "title": "Reserva 42", "amountCents": 120000 }],
    "currency": "ARS",
    "externalReference": "reserva:42"
  }'
# → { "paymentIntentId": "...", "checkoutUrl": "https://mp/checkout/..." }
```

The payment is stamped with your `application` + `environment` + resolved
`providerConnection`, so reporting and reconciliation are per-app.

## 4. Receive the signed webhook

On a terminal payment, Sytadel POSTs to each registered endpoint (and any
`webhookUrl` you passed), signed with that endpoint's secret:

```
POST <your endpoint url>
x-sytadel-event-id: <uuid>
x-sytadel-signature: t=<unixMillis>,v1=<hmac-sha256>
{ "event": "payment.approved", "paymentIntentId": "...", "externalReference": "reserva:42",
  "status": "APPROVED", "amountCents": 120000, "currency": "ARS", "provider": "mercadopago" }
```

Verify in your app (Node) — recompute the HMAC over `` `${t}.${rawBody}` `` and
compare in constant time; dedupe on `x-sytadel-event-id`:

```js
import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifySytadelSignature(secret, header, rawBody) {
  const parts = Object.fromEntries(header.split(',').map((kv) => kv.split('=')));
  if (!parts.t || !parts.v1) return false;
  const expected = createHmac('sha256', secret).update(`${parts.t}.${rawBody}`).digest('hex');
  const a = Buffer.from(parts.v1);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
```

Payment state always reflects the provider (Sytadel re-fetches before emitting),
so a forged webhook can't fabricate a payment.

## 5. Read usage per application

```bash
curl https://billing.example.com/api/billing/usage/by-application \
  -H "authorization: Bearer <owner-jwt>"
# → usage rolled up by application → environment → metric
```

## Scopes

`payments:create` · `payments:read` · `subscriptions:create` ·
`subscriptions:read` · `refunds:create` · `usage:write` · `usage:read` ·
`webhooks:manage` · `billing:read`

A key missing a required scope is rejected with `403`. Development-environment
keys carry `environmentId=development`, so they can never act on production data.
