# Foundation — NFR Requirements (expanded)

Elaborates nfr.md into measurable requirements for the shared platform layer. Extensions **security-baseline** and **resiliency-baseline** are blocking.

## Non-Functional Requirements

### Security (blocking)
| ID | Requirement | Target / Acceptance |
|---|---|---|
| SEC-1 | All API requests authenticated via OIDC-issued JWT | Unauthenticated → 401 `AUTH_001`; token signature verified against IdP JWKS |
| SEC-2 | Authorization on every protected handler (RBAC + record scope) | Un-annotated handler fails startup; out-of-scope → 403 `AUTH_002` |
| SEC-3 | All state changes audited immutably | 100% of create/update/delete + access-denied captured in `audit_log` |
| SEC-4 | Secrets never in source/committed config | Secrets only from platform store; CI secret-scan passes |
| SEC-5 | Transport & at-rest encryption | TLS enforced; DB at-rest encryption on |
| SEC-6 | Input validation everywhere | All DTOs Zod-validated; invalid → 400 `VALIDATION_001` |
| SEC-7 | Security headers + rate limiting | helmet headers set; `/auth/*` rate-limited |

### Reliability / Resiliency (blocking, directional)
| ID | Requirement | Target |
|---|---|---|
| REL-1 | Health readiness gates deploy/rollback | `/health` readiness reflects DB; failing readiness blocks promotion |
| REL-2 | Idempotent event handling | Duplicate delivery causes at-most-once effect (P4) |
| REL-3 | Outbound dependency resilience (IdP) | Timeouts + bounded retry/backoff; JWKS cached with TTL; fail closed |
| REL-4 | Recoverability | Versioned migrations reversible; outbox enables event replay |
| REL-5 | Graceful degradation | Reporting tolerates stale read models; brief IdP outage served from JWKS cache |

### Performance / Scalability
| ID | Requirement | Target |
|---|---|---|
| PERF-1 | Auth overhead | JWT verify + authz < 15 ms p95 (cached JWKS) |
| PERF-2 | DB connection efficiency | Prisma pooling; no connection exhaustion under nominal load |
| PERF-3 | List endpoints bounded | Pagination enforced (default 25, max 100) |
| PERF-4 | Scale target (platform) | Hundreds of projects, thousands of resources without linear degradation on reads (precomputed roll-ups) |

### Availability
| ID | Requirement | Target |
|---|---|---|
| AVL-1 | Rolling deploys, no full downtime | Health-gated rolling deployment |
| AVL-2 | Startup safety | Invalid config ⇒ refuse start (fail fast, no half-configured runtime) |

### Maintainability / Observability
| ID | Requirement | Target |
|---|---|---|
| MNT-1 | Single shared convention set | All units reuse `@epm/shared` error/event/auth patterns |
| OBS-1 | Structured logs + correlation | JSON logs with `X-Request-Id` on 100% of requests |
| OBS-2 | Shared package versioning | SemVer; breaking change = major bump + migration note |

## Tech-Stack Decisions (aligned with D3 — no contradictions)
- Runtime: Node.js 20 LTS, TypeScript 5.x · Framework: NestJS
- Data: PostgreSQL, Prisma (multi-schema), Prisma Migrate
- Auth: openid-client + jose · Validation: Zod · Logging: pino
- Events: lightweight typed in-process bus (+ outbox/ledger) · Config: Zod-validated env + platform secrets
- Testing: Vitest + Supertest + fast-check + Testcontainers · Packaging: Docker multi-stage
