# Foundation — Integration

## External Integrations (MVP)

### Enterprise Identity Provider (OIDC) — REQUIRED
- **Protocol**: OpenID Connect (Authorization Code + PKCE) via `openid-client`.
- **Config** (from `ConfigService`, secrets from platform store): `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_REDIRECT_URI`, `OIDC_SCOPES`.
- **Token handling**: verify ID/access token signature with `jose` against IdP JWKS; map claims → `AuthContext` (subject → userId, roles claim → roles).
- **Resilience**: cache JWKS with TTL; fail closed on verification error; clock-skew tolerance.

### Deferred (Phase 2) — stubbed, not built
- HR system (resource master sync), Finance/ERP (budgets/actuals), Jira/Azure DevOps (execution sync). Foundation leaves integration seams (event bus + adapter interfaces) but no adapters yet.

## Internal Integration (in-process)

### Event Bus contract
- Publish/subscribe `DomainEvent<T>`; event naming `[unit].[entity].[action]`.
- At-least-once semantics; consumers idempotent via `processed_events` ledger keyed by `(eventId, handler)`.
- Optional `outbox` table for durability (publish-after-commit).

### Module API contract
- Each unit exposes a typed NestJS provider interface (e.g., `ProjectExecutionApi`) injected where needed. No direct cross-schema DB access.

## Integration Contracts (sketch — units consume these foundation seams)
```
AuthModule       → provides AuthContext to every request
EventBus         → units publish/subscribe domain events
PrismaService    → units get a scoped client for their schema
AuditService     → units emit audit entries (or foundation auto-audits via interceptor)
```
