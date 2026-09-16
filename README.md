# Sytadel billing-api

Servicio de facturación multi-tenant: suscripciones, checkout self-serve y medición de uso por aplicación.

## Qué es (individual)

`billing-api` es un **servicio de facturación seguro y drop-in** para SaaS multi-tenant. Por sí solo aporta:

- catálogo de planes y suscripciones por tenant
- checkout self-serve (suscripción y pago único) sobre MercadoPago o Stripe
- medición de uso (`usage events`) y cierre de períodos
- webhooks entrantes verificados por firma y webhooks salientes firmados
- secretos de proveedor cifrados en reposo

El valor diferencial es la integración **segura** con MercadoPago (firma anti-replay/anti-tamper), útil para indies de LATAM aunque no adopten el resto de Sytadel. Solo necesita un directorio de identidad para resolver tenants.

## Rol en Sytadel

Dentro de la suite es la **capa de planes y entitlements**. No es dueño de usuarios ni tenants: los resuelve contra `auth-api` por el directorio interno, y sincroniza entitlements hacia identidad. `auth-api` y `zerotrust-api` reportan uso a este servicio (`BILLING_METERING_BASE_URL`). Ver la [arquitectura de la suite](../../README.md).

## Uso standalone

```bash
cp .env.example .env
yarn install
yarn start:dev        # http://localhost:3020
```

Requisitos mínimos: PostgreSQL, un directorio de identidad (`AUTH_DIRECTORY_BASE_URL`, puede ser `auth-api` u otro compatible) y las credenciales del proveedor de pago activo (`BILLING_PROVIDER`). Para probar sin proveedor real, usá `BILLING_PROVIDER=mock` + `BILLING_ALLOW_MOCK_CHECKOUT_ACTIVATION=true`.

## Uso en la suite

Desde la raíz del meta-repo, `docker compose up --build`. En la red interna responde en `http://billing-api:3020/api` y resuelve identidad en `http://auth-api:3001/api`.

## Responsabilidades

- catálogo de planes y suscripciones por tenant
- checkout self-serve (suscripción y pago único)
- medición de uso (`usage events`) y cierre de períodos
- conexiones a proveedores de pago (MercadoPago, Stripe)
- webhooks entrantes de proveedores (verificación de firma)
- webhooks salientes firmados hacia el consumidor
- portal de gestión de suscripción

## Estado arquitectónico

`billing-api` es la fuente de verdad de:

- `subscriptions`
- `payment intents`
- `usage events` y cierres de período
- `provider connections` y `webhook endpoints`

Consume identidad de `auth-api` mediante el directorio interno (`AUTH_DIRECTORY_BASE_URL`) para resolver tenants y memberships. No es dueño de usuarios ni tenants.

## Endpoints principales

Bajo `/billing` (requieren sesión de tenant):

- `GET  /billing/catalog`
- `GET  /billing/subscription`
- `POST /billing/checkout-sessions`
- `POST /billing/one-off-checkout`
- `POST /billing/subscription/cancel`
- `POST /billing/portal-sessions`
- `GET  /billing/usage/by-application`
- `GET  /billing/applications/:clientAppId/payments`
- `GET  /billing/applications/:clientAppId/subscriptions`

Administración de proveedores y salidas:

- `GET|POST /billing/provider-connections` · `POST /billing/provider-connections/:id/disable`
- `GET|POST /billing/webhook-endpoints` · `POST /billing/webhook-endpoints/:id/disable`

## Webhooks

Entrantes (verificados por firma del proveedor):

- `POST /billing/webhooks/mercadopago`
- `POST /billing/webhooks/stripe`
- `GET  /billing/checkout/mercadopago/return`

Salientes: firmados con `BILLING_OUTBOUND_WEBHOOK_SECRET` hacia los `webhook-endpoints` registrados por el tenant.

## Endpoints internos

Pensados para uso server-to-server (protegidos por JWT interno, `BILLING_JWT_ISSUER` / `BILLING_JWT_AUDIENCE`):

- `POST /internal/billing/usage-events`
- `POST /internal/billing/close-due-periods`

## Modo producción local

```bash
yarn build
yarn start:prod
```

## Base de datos

PostgreSQL + TypeORM con migraciones explícitas (no se usa `DB_SYNC` en ningún entorno).

```bash
yarn migration:run       # aplicar migraciones
yarn migration:generate  # generar una nueva desde cambios de entidades
yarn migration:revert    # revertir la última
```

## Variables esperadas

| Variable | Uso |
|----------|-----|
| `PORT` | puerto HTTP (default `3020`) |
| `DB_HOST` `DB_PORT` `DB_USER` `DB_PASSWORD` `DB_NAME` | conexión PostgreSQL |
| `AUTH_DIRECTORY_BASE_URL` `AUTH_DIRECTORY_TIMEOUT_MS` | directorio de identidad (`auth-api`) |
| `BILLING_JWT_ISSUER` `BILLING_JWT_AUDIENCE` | validación del JWT interno |
| `BILLING_INTERNAL_MAX_CLOCK_SKEW_MS` | tolerancia de reloj para endpoints internos |
| `BILLING_PROVIDER` | proveedor activo (`mercadopago` \| `stripe` \| `mock`) |
| `BILLING_SECRET_ENC_KEY` | cifrado en reposo de secretos de proveedor |
| `BILLING_OUTBOUND_WEBHOOK_SECRET` | firma de webhooks salientes |
| `BILLING_PUBLIC_BASE_URL` `BILLING_PORTAL_RETURN_URL` | URLs públicas de retorno |
| `BILLING_TRIAL_DAYS` | días de trial por defecto |
| `BILLING_CLOSE_DUE_PERIODS_INTERVAL_MS` | intervalo del cron de cierre de períodos |
| `BILLING_ALLOW_MOCK_CHECKOUT_ACTIVATION` | habilita el activador mock (solo dev) |
| `MERCADOPAGO_ACCESS_TOKEN` `MERCADOPAGO_PUBLIC_KEY` `MERCADOPAGO_WEBHOOK_SECRET` `MERCADOPAGO_CURRENCY` `MERCADOPAGO_API_BASE_URL` | credenciales MercadoPago |
| `STRIPE_SECRET_KEY` `STRIPE_PUBLISHABLE_KEY` `STRIPE_WEBHOOK_SECRET` | credenciales Stripe |
| `THROTTLE_TTL_MS` `THROTTLE_LIMIT` | rate limiting |

## Tests

```bash
yarn test
```

## Notas

- repo yarn: nunca correr `npm install` acá (rompe el lockfile)
- los secretos de proveedor se guardan cifrados con `BILLING_SECRET_ENC_KEY`
- las firmas de webhook (entrantes y salientes) son anti-replay y anti-tamper
- el activador mock (`/billing/checkout/mock/:subscriptionId/activate`) solo funciona con `BILLING_ALLOW_MOCK_CHECKOUT_ACTIVATION=true`

## Licencia

Apache-2.0. Ver [LICENSE](./LICENSE).
