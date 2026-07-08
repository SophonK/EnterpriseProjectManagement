# Foundation — NFR Design (expanded)

How the NFR requirements are realized as design patterns and logical components. Satisfies **resiliency-baseline** (resilience patterns) and **security-baseline** (security patterns).

## Security Patterns
| Requirement | Pattern / Mechanism |
|---|---|
| SEC-1/2 | **Guard chain**: `AuthGuard` (verify JWT via jose + JWKS cache) → `RbacGuard` (role→permission) → `ScopeGuard` (`canAccess` record eval). Global; opt-out only for `/health`, `/auth/*`. |
| SEC-2 startup safety | **Metadata scan at boot**: every controller handler must carry `requirePermission()`; missing metadata throws → app won't start (BR4). |
| SEC-3 | **Audit interceptor** wraps commands; writes `audit_log` in the same transaction as the state change (no lost audit). |
| SEC-4 | **Secret provider abstraction**: `ConfigService` resolves secrets from platform store; `.env` only in dev; CI secret-scan. |
| SEC-6 | **Validation pipe**: Zod schema pipe on all DTOs → `VALIDATION_001`. |
| SEC-7 | **helmet** middleware + **rate-limiter** on `/auth/*` (token-bucket). |

## Resilience Patterns
| Requirement | Pattern / Mechanism |
|---|---|
| REL-1 | **Health/readiness probe** with DB ping; wired to deploy orchestration + rollback trigger. |
| REL-2 | **Idempotent consumer**: `processed_events (eventId, handler)` check-then-act; handlers use upsert/conditional writes. |
| REL-3 | **Circuit-breaker + timeout + retry-with-backoff** around IdP JWKS fetch; **JWKS cache** (TTL) as fallback; fail closed on hard failure. |
| REL-4 | **Transactional Outbox**: event row committed with state change; **relay** publishes post-commit; enables replay. |
| REL-5 | **Cache-aside** for reporting read models; stale-while-revalidate tolerance. |

## Logical Components
| Component | Type | Purpose |
|---|---|---|
| Guard Chain | Interceptor pipeline | AuthN + AuthZ enforcement |
| Validation Pipe | Pipe | Zod DTO validation |
| Audit Interceptor | Interceptor | Transactional audit capture |
| Exception Filter | Filter | RFC 7807 mapping |
| Request-Id Middleware | Middleware | Correlation id propagation |
| JWKS Cache + Breaker | Resilience wrapper | IdP token-verification resilience |
| Outbox Relay | Background worker | Post-commit event delivery |
| Idempotency Ledger | Repository | At-most-once effects |
| Health Indicator | Provider | Liveness/readiness (DB) |
| ConfigService | Provider | Zod-validated config + secret resolution |
| Logger (pino) | Provider | Structured JSON logging |

## Data-Flow (request lifecycle)
```
Request
  → Request-Id Middleware (assign X-Request-Id)
  → Guard Chain (AuthN via JWKS cache/breaker → RBAC → Scope)
  → Validation Pipe (Zod)
  → Unit handler (business logic)   ── emits state change + outbox event (same tx)
  → Audit Interceptor (write audit_log in tx)
  → Exception Filter (on error → RFC 7807)
  → Response (+ X-Request-Id)
Post-commit: Outbox Relay → EventBus → idempotent subscribers (ledger-guarded)
```

## Trade-offs
- In-process event bus + outbox chosen over a broker for MVP simplicity; the `EventBus` interface + outbox make a later broker swap non-breaking (REL scalability path).
- Cache-aside for reporting accepts brief staleness in exchange for read performance at scale (PERF-4).
