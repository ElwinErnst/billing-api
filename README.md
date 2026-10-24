# Sytadel billing-api

Servicio de facturación multi-tenant: suscripciones por tenant/app, suscripciones de plataforma (por organización), un dominio de merchant-billing para tenants que revenden sus propias suscripciones, checkout self-serve y medición de uso por aplicación.

## Qué es (individual)

`billing-api` es un **servicio de facturación seguro y drop-in** para SaaS multi-tenant. Por sí solo aporta:

- catálogo de planes y suscripciones por tenant, más suscripciones de plataforma (por organización) que cubren un conjunto de tenants bajo una misma cuenta de facturación
- un dominio `merchant-billing`: un modelo de catálogo/clientes/suscripciones aislado y propiedad del tenant, que un tenant puede usar para facturar a *sus propios* clientes finales, independiente de su propia suscripción a Sytadel
- checkout self-serve (suscripción y pago único) sobre MercadoPago o Stripe
- medición de uso (`usage events`) y cierre de períodos
- webhooks entrantes verificados por firma y webhooks salientes firmados
- secretos de proveedor cifrados en reposo, tanto para las conexiones de proveedor propias del servicio como para las conexiones de proveedor de cada merchant

El valor diferencial es la integración **segura** con MercadoPago (firma anti-replay/anti-tamper), útil para indies de LATAM aunque no adopten el resto de Sytadel. Solo necesita un directorio de identidad para resolver tenants.

## Rol en Sytadel

Dentro de la suite es la **capa de planes y entitlements**. No es dueño de usuarios ni tenants: los resuelve contra `auth-api` por el directorio interno, y sincroniza entitlements hacia identidad. Para las suscripciones de plataforma (por organización), además llama de vuelta a `auth-api` para autorizar la operación contra los registros de membresía y cuenta de facturación de la organización. `auth-api` y `zerotrust-api` reportan uso a este servicio (`BILLING_METERING_BASE_URL`). Ver la [arquitectura de la suite](../../README.md).

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

- catálogo de planes, suscripciones por tenant y suscripciones de plataforma (por organización) que cubren múltiples tenants
- un dominio merchant-billing aislado (productos, precios, clientes, suscripciones) con propiedad por tenant
- checkout self-serve (suscripción y pago único) para suscripciones de tenant y de plataforma
- medición de uso (`usage events`) y cierre de períodos
- conexiones a proveedores de pago (MercadoPago, Stripe), tanto para la facturación propia del servicio como, por separado, por cada merchant
- webhooks entrantes de proveedores (verificación de firma), con alcance por conexión en el caso de merchant billing
- webhooks salientes firmados hacia el consumidor
- portal de gestión de suscripción (solo Stripe)

## Estado arquitectónico

`billing-api` es la fuente de verdad de:

- `subscriptions` (a nivel tenant y a nivel plataforma/organización)
- `payment intents`
- `usage events` y cierres de período
- `provider connections` y `webhook endpoints` (propios del servicio)
- el dominio merchant-billing: `merchant accounts`, `products`, `prices`, `customers`, `subscriptions` y `provider connections` — en tablas separadas, aisladas por tenant

Consume identidad de `auth-api` mediante el directorio interno (`AUTH_DIRECTORY_BASE_URL`) para resolver tenants y memberships, y mediante una llamada de autorización a `auth-api` para validar las operaciones de suscripción de plataforma (por organización). No es dueño de usuarios, tenants ni organizaciones.

## Tres superficies de facturación

| Superficie | Alcance | Quién la llama | Almacenamiento |
|---|---|---|---|
| Facturación tenant/app | La suscripción propia de un tenant a Sytadel | Sesión del propio tenant (`AccessJwtGuard`) | `billing_subscriptions`, etc., con clave `tenantId` |
| Facturación de plataforma | La cuenta de facturación de una organización, que cubre una lista de tenant IDs | Sesión de usuario; autorizada contra el directorio de organizaciones de `auth-api` | mismas tablas, con clave `organizationId` / `billingAccountId` / `coveredTenantIds` |
| Merchant billing | El catálogo de reventa propio de un tenant y sus clientes finales | Sesión del owner del tenant; aislado por `ownerTenantId` | tablas `merchant_*` separadas |

### 1. Suscripciones por tenant/app

Bajo `/billing` (requieren sesión de tenant):

- `GET  /billing/catalog`
- `GET  /billing/subscription` — devuelve la suscripción propia del tenant, o la suscripción de plataforma más reciente cuyo `coveredTenantIds` incluya a este tenant, la que sea más reciente
- `POST /billing/checkout-sessions`
- `POST /billing/one-off-checkout` (requiere el scope `payments:create`)
- `POST /billing/subscription/cancel`
- `POST /billing/portal-sessions` (solo Stripe)
- `GET  /billing/usage/by-application`
- `GET  /billing/applications/:clientAppId/payments`
- `GET  /billing/applications/:clientAppId/subscriptions`

### 2. Suscripciones de plataforma (organización)

También bajo `/billing`, para una suscripción facturada a nivel organización y compartida entre un conjunto de tenant IDs:

- `POST /billing/platform/checkout-sessions` — el body extiende el DTO de checkout de tenant con `organizationId`, `billingAccountId` y `coveredTenantIds` (hasta 250 tenant IDs); rechaza llamadas de service account
- `POST /billing/platform/subscriptions/:subscriptionId/cancel` — rechaza llamadas de service account

Ambas operaciones llaman al directorio interno de `auth-api` (`POST internal/organizations/:organizationId/platform-subscription-authorization`) para autorizar al caller contra esa organización, cuenta de facturación y el conjunto exacto de tenants cubiertos, antes de crear o cancelar la suscripción. Si la respuesta del directorio no coincide exactamente con lo solicitado, `billing-api` falla cerrado con un 500 en lugar de confiar en una autorización parcial.

### 3. Merchant billing (dominio de reventa)

Un dominio de facturación separado, propiedad del tenant, para un tenant que quiere facturar a sus propios clientes finales, aislado de su propia suscripción a Sytadel. Solo los owners del tenant (`roles` incluye `OWNER`, no service account) pueden administrarlo, y cada objeto está acotado bajo un `merchantId` que pertenece a `ownerTenantId`.

Gestión de catálogo y clientes, bajo `/billing/merchants` (requieren sesión de tenant):

- `POST /billing/merchants` — crea una cuenta de merchant
- `GET  /billing/merchants` — lista las cuentas de merchant propiedad del tenant del caller
- `POST /billing/merchants/:merchantId/products`
- `GET  /billing/merchants/:merchantId/products`
- `PATCH /billing/merchants/:merchantId/products/:productId/archive`
- `POST /billing/merchants/:merchantId/products/:productId/prices`
- `GET  /billing/merchants/:merchantId/products/:productId/prices`
- `PATCH /billing/merchants/:merchantId/prices/:priceId/archive`
- `POST /billing/merchants/:merchantId/customers` — `externalCustomerId` debe ser único dentro del merchant
- `GET  /billing/merchants/:merchantId/customers`
- `POST /billing/merchants/:merchantId/subscriptions` — requiere un cliente y un precio activos propiedad del mismo merchant; opcionalmente vincula una provider connection + un ID de suscripción externo
- `GET  /billing/merchants/:merchantId/subscriptions`
- `POST /billing/merchants/:merchantId/subscriptions/:subscriptionId/cancel` — idempotente

Un `merchantId` que no pertenece al tenant del caller resuelve como no encontrado (sin enumeración cross-tenant).

Provider connections por merchant, bajo `/billing/merchants/:merchantId/provider-connections`:

- `POST /billing/merchants/:merchantId/provider-connections` — `provider` es `stripe` o `mercadopago`; los secretos de acceso y de webhook se cifran en reposo y nunca se devuelven en las respuestas; requiere `BILLING_SECRET_ENC_KEY`
- `GET  /billing/merchants/:merchantId/provider-connections`
- `POST /billing/merchants/:merchantId/provider-connections/:connectionId/disable`

Un merchant puede tener más de una conexión activa por proveedor, distinguidas por un par opcional `clientAppId` / `environmentId`.

Webhooks de proveedor por merchant (públicos, acotados por `connectionId` en el path, no por sesión de tenant):

- `POST /billing/merchant-provider-webhooks/:connectionId/stripe`
- `POST /billing/merchant-provider-webhooks/:connectionId/mercadopago`

Cada webhook se verifica contra el secreto cifrado propio de esa conexión exacta, y la reconciliación de la suscripción solo actualiza suscripciones vinculadas a ese mismo `providerConnectionId`. Una conexión de un merchant distinto no puede verificar ni afectar los eventos o suscripciones de otro merchant, incluso con un payload correctamente firmado para la conexión equivocada (`merchant-provider.spec.ts`). La reconciliación es idempotente respecto al ID de evento del proveedor y rechaza que un evento más antiguo reactive una suscripción que un evento más nuevo ya canceló.

## Webhooks (facturación tenant/plataforma)

Entrantes (verificados por firma del proveedor):

- `POST /billing/webhooks/mercadopago`
- `POST /billing/webhooks/stripe`
- `GET  /billing/checkout/mercadopago/return`

Estos usan la cuenta de proveedor única configurada vía `BILLING_PROVIDER` y las credenciales `MERCADOPAGO_*` / `STRIPE_*` correspondientes — a diferencia de merchant billing, donde cada merchant aporta sus propias credenciales por conexión.

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
| `AUTH_DIRECTORY_BASE_URL` `AUTH_DIRECTORY_TIMEOUT_MS` | directorio de identidad (`auth-api`), también usado para autorizar suscripciones de plataforma |
| `BILLING_JWT_ISSUER` `BILLING_JWT_AUDIENCE` | validación del JWT interno |
| `BILLING_INTERNAL_MAX_CLOCK_SKEW_MS` | tolerancia de reloj para endpoints internos |
| `BILLING_PROVIDER` | proveedor activo para facturación tenant/plataforma (`mercadopago` \| `stripe` \| `mock`) |
| `BILLING_SECRET_ENC_KEY` | cifrado en reposo de secretos de proveedor, tanto para las conexiones propias del servicio como para las conexiones de proveedor de cada merchant |
| `BILLING_OUTBOUND_WEBHOOK_SECRET` | firma de webhooks salientes |
| `BILLING_PUBLIC_BASE_URL` `BILLING_PORTAL_RETURN_URL` | URLs públicas de retorno |
| `BILLING_TRIAL_DAYS` | días de trial por defecto |
| `BILLING_CLOSE_DUE_PERIODS_INTERVAL_MS` | intervalo del cron de cierre de períodos |
| `BILLING_ALLOW_MOCK_CHECKOUT_ACTIVATION` | habilita el activador mock (solo dev) |
| `MERCADOPAGO_ACCESS_TOKEN` `MERCADOPAGO_PUBLIC_KEY` `MERCADOPAGO_WEBHOOK_SECRET` `MERCADOPAGO_CURRENCY` `MERCADOPAGO_API_BASE_URL` | credenciales MercadoPago para la facturación propia del servicio (tenant/plataforma) |
| `STRIPE_SECRET_KEY` `STRIPE_PUBLISHABLE_KEY` `STRIPE_WEBHOOK_SECRET` | credenciales Stripe para la facturación propia del servicio (tenant/plataforma) |
| `THROTTLE_TTL_MS` `THROTTLE_LIMIT` | rate limiting |

Las credenciales de proveedor de cada merchant (secretos de acceso y de webhook de Stripe/MercadoPago) no son variables de entorno: cada merchant aporta las suyas al crear una provider connection, y se cifran en reposo con `BILLING_SECRET_ENC_KEY`.

## Tests

```bash
yarn test
```

## Notas

- repo yarn: nunca correr `npm install` acá (rompe el lockfile)
- los secretos de proveedor se guardan cifrados con `BILLING_SECRET_ENC_KEY`, tanto para las conexiones propias del servicio como para las conexiones de proveedor de cada merchant
- las firmas de webhook (entrantes y salientes) son anti-replay y anti-tamper
- el activador mock (`/billing/checkout/mock/:subscriptionId/activate`) solo funciona con `BILLING_ALLOW_MOCK_CHECKOUT_ACTIVATION=true`
- merchant billing está completamente aislado de la facturación tenant/plataforma: tablas separadas, provider connections y paths de webhook separados (acotados por `connectionId`), y la cancelación/reconciliación de un dominio nunca toca al otro

## Licencia

PolyForm Strict 1.0.0 (source-available, uso no comercial). Ver [LICENSE](./LICENSE).
