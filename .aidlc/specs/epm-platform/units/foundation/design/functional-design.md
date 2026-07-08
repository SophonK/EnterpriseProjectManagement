# Foundation — Functional Design (expanded)

Deep dive over components.md + data-model.md. The foundation's "business logic" is the cross-cutting behavior every unit relies on: authorization evaluation, event dispatch, error mapping, and audit.

## 1. Business-Logic Model

### 1.1 Authorization evaluation (`canAccess`)
Pure decision function used by `RbacGuard`/`ScopeGuard`.
```
canAccess(ctx: AuthContext, required: Permission, record?: ScopedRef): boolean
```
Rules:
- R1: Role must grant `required` permission (via role→permission catalog).
- R2: If `record` given, a `RecordScope` in `ctx.recordScopes` must cover it (matching `type` + id in the owned set/subtree), UNLESS role = EPMO Director (enterprise-wide read).
- R3: Deny by default — absence of a granting role or covering scope ⇒ false.
- R4: Write permissions never granted by Director override alone unless role also has the write permission.

### 1.2 Event dispatch
```
publish(e): append to outbox (same tx as state change) → after commit, deliver to subscribers
onDeliver(e, handler): if (e.eventId, handler) in processed_events → skip; else run handler then record
```
- Guarantees: at-least-once delivery, effect-at-most-once via ledger (P4).
- Ordering: per-aggregate ordering best-effort; handlers must not assume global order.

### 1.3 Error mapping
```
toProblemDetails(err: AppError, requestId): ProblemDetails
```
- Looks up `err.code` in the registry → `{ status, title, type }`; attaches `detail` + `requestId`.
- Unknown/unexpected throwable → `INTERNAL` (500) with generic title (no leakage).

### 1.4 Audit
- An interceptor wraps state-changing commands: on success append `audit_log` (actor, action, entity, before/after, requestId); on `AUTH_002` append access-denied entry.

## 2. Domain Entities (foundation-owned)

| Entity | Fields (key) | Rules |
|---|---|---|
| AuditEntry | id, actorId?, action, entityType, entityId?, before?, after?, requestId, occurredAt | Immutable; append-only |
| OutboxEvent | eventId, eventType, payload, occurredAt, processedAt? | Written in same tx as state change |
| ProcessedEvent | (eventId, handler), processedAt | Idempotency key |
| RoleCatalog (ref) | role, permissions[] | Seeded; identity-access assigns roles to users |

Value objects (in `@epm/shared`): `AuthContext`, `RecordScope { type, ids | subtreeRootId }`, `DomainEvent<T>`, `ProblemDetails`, `Permission`, `Role`.

## 3. Business Rules & Constraints
- BR1: No cross-schema writes; a unit's repository binds to its own schema only.
- BR2: Every state-changing operation is audited (no silent writes).
- BR3: Every request carries/receives `X-Request-Id`; it flows into logs and audit.
- BR4: Every protected handler declares a required permission. Enforcement is **request-time deny-by-default**: a non-`@Public` route without a `@RequirePermission` declaration is refused (403) by the global AuthGuard. (This supersedes the earlier boot-time-scan idea — request-time enforcement covers dynamically-registered routes too and cannot be bypassed.)
- BR5: Config invalid at boot ⇒ app refuses to start (P5).
- BR6: Event handlers must be idempotent; enforced by ledger + upsert guidance.

## 4. Validation Logic
- Zod schemas in `@epm/shared` validate all inbound DTOs; failure → `VALIDATION_001` with field details.
- Env validated by Zod at boot; secrets resolved from platform store.

> No frontend components in the foundation unit (web is a separate repo; foundation ships `@epm/shared` for it to consume).
