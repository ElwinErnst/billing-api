# Billing SaaS Control-Plane PR Chain

Issue #23 tracks Billing's organization-owned platform subscriptions and the isolated merchant billing/provider domain. This document is the no-merge tracker for the Billing feature-branch chain and makes its dependency order, approved size exceptions, and verification expectations visible.

## Merge policy

**Keep this tracker draft and do not merge it until all child PRs are reviewed and integrated.** Each child targets its immediate predecessor; only this tracker ultimately targets `main`.

## Dependency order

```text
main
  └─ 📍 tracker: feat/saas-control-plane-billing
       └─ child 1: feat/saas-control-plane-platform-billing
            └─ child 2: fix/saas-control-plane-billing-ownership
                 └─ child 3: feat/saas-control-plane-merchant-billing
                      └─ child 4: feat/saas-control-plane-merchant-providers
                           └─ child 5: fix/saas-control-plane-provider-recovery
                                └─ child 6: fix/saas-control-plane-webhook-ordering
                                     └─ child 7: fix/saas-control-plane-mp-recovery
```

| Order | Branch | Scope | Original work-unit commit | Authored changed lines | Depends on |
|------:|--------|-------|---------------------------|-----------------------:|------------|
| Tracker | `feat/saas-control-plane-billing` | Chain coordination and merge warning | New tracker-doc commit | — | Current `main` |
| 1 | `feat/saas-control-plane-platform-billing` | Organization-owned platform billing accounts and tenant coverage | `965de9f` | 750 | Tracker; Auth authorization contract |
| 2 | `fix/saas-control-plane-billing-ownership` | Harden customer/subscription ownership conflicts | `090e464` | 457 | Child 1 |
| 3 | `feat/saas-control-plane-merchant-billing` | Isolated merchant accounts, catalog, customers, and subscriptions | `c424803` | 1,067 | Child 2 |
| 4 | `feat/saas-control-plane-merchant-providers` | Merchant-scoped provider credentials and webhooks | `bac3515` | 652 | Child 3 |
| 5 | `fix/saas-control-plane-provider-recovery` | Recoverable provider subscription states | `6e6ab22` | 58 | Child 4 |
| 6 | `fix/saas-control-plane-webhook-ordering` | Deterministic terminal cancellation ordering | `8f0a026` | 31 | Child 5 |
| 7 | `fix/saas-control-plane-mp-recovery` | Recoverable/unsupported Mercado Pago states | `ae9429f` | 53 | Child 6 |

## Size exceptions

The user explicitly approved `size:exception` for cohesive work units of 750, 457, 1,067, and 652 authored changed lines. Keep behavior and its tests together; do not omit coverage, code-golf, or split coupled work merely to satisfy the 400-line guideline. The 58-, 31-, and 53-line provider-state fixes remain focused follow-up children.

## Verification

For every code child, run from its Billing API worktree:

```sh
npm test
npm run build
git diff --check
```

The tracker itself requires Markdown/template structural review and `git diff --check`; it changes no application behavior. Every child PR must show only its work unit against the immediate base, link approved issue #23, have exactly one matching `type:*` label, and include exact verification, Chain Context, and rollback boundary.

## Scope boundary

The platform subscription domain remains distinct from the merchant catalog/subscription/provider paths. Merchant credentials and webhook events are merchant-scoped and cannot update Sytadel platform entitlements. This chain covers Billing API only; Auth foundations are an upstream dependency and root UI/docs remain downstream. `sytadel-growth-os` is explicitly out of scope.
