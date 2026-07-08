# Foundation — NFR (compact)

Cross-cutting NFRs the foundation implements once for all units. Extensions **security-baseline** and **resiliency-baseline** are blocking here.

## Security (security-baseline — blocking)
- **AuthN**: OIDC via enterprise IdP; app JWT verified with `jose` against IdP JWKS (cached, TTL). Fail closed.
- **AuthZ**: RBAC (8 roles) + record-level scoping enforced by guards on every handler; deny by default. `AuthContext` never trusts client input for roles/scopes.
- **Input validation**: all inputs validated by Zod at the boundary → `VALIDATION_001`.
- **Encryption**: TLS in transit; PostgreSQL at-rest encryption (platform); secrets from platform secret store, never in code/`.env` committed.
- **Audit**: immutable `audit_log` on every state change + access-denied; no app-level UPDATE/DELETE.
- **Tokens**: short-lived access JWT + refresh; rotation; httpOnly/secure cookies if cookie-based.
- **Threat considerations**: OWASP Top 10 baseline — injection (parameterized Prisma), broken access control (guards + scope), SSRF/secrets, security headers (helmet), rate limiting on `/auth/*`.

## Resiliency (resiliency-baseline — blocking, directional)
- **Health checks**: `/health` liveness + readiness (DB) gates rolling deploys and triggers rollback.
- **Timeouts & retries**: outbound (IdP JWKS) timeouts + bounded retry with backoff; DB statement timeout.
- **Graceful degradation**: reporting/dashboards tolerate stale read models; auth JWKS cache serves during brief IdP blips.
- **Idempotency**: at-least-once events + `processed_events` ledger prevents duplicate side effects.
- **Recoverability**: versioned migrations, DB backups (platform), outbox for event durability.
- **Observability**: structured JSON logs (pino) + `X-Request-Id` propagation; error rates/latency exposed for monitoring (Operations phase).

## Performance
- Reporting roll-ups precomputed/cached where feasible; targets validated per unit. Connection pooling via Prisma. Pagination enforced on list endpoints.

## Maintainability
- Shared conventions in `@epm/shared`/`@epm/config`; SemVer on shared package; single error/logging/event pattern reused by all units.
