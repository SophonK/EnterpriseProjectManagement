# Foundation — Correctness & Property-Based Testing

Extension **property-based-testing (partial)** is blocking. Foundation carries PBT for its shared pure functions and serialization (fast-check + Vitest).

## Properties

### P1 — DomainEvent serialization round-trip
For any valid `DomainEvent<T>` `e`: `deserialize(serialize(e)) ≡ e`.
- Generators: arbitrary eventType strings, ISO timestamps, structured `data` payloads.
- Invariants: no field loss; types preserved; `eventId` stable.

### P2 — RFC 7807 error mapping totality
For any `AppError(code, status, detail?)`: `toProblemDetails(err)` yields `{ type, title, status, code, requestId }` where `status` matches the code registry and `code` is a registered code.
- Property: every registered error code maps to exactly one HTTP status; mapping never throws.

### P3 — RBAC record-scope evaluation
For any `AuthContext` and target record:
- `canAccess(ctx, record)` is **true** iff a role grants the permission AND (a scope covers the record OR role is EPMO Director).
- Properties: deny-by-default (no matching scope ⇒ false); Director ⇒ always true for read; monotonic (adding a scope never removes access); never throws on malformed scope.

### P4 — Idempotency ledger
For any sequence of event deliveries, applying a handler for `(eventId, handler)` more than once performs the side effect **at most once** (second application is a no-op).

### P5 — Zod config validation
For any env map missing/!invalid required keys, `ConfigService.load()` rejects with a validation error listing offending keys; for valid maps it returns a fully-typed config.

## Test Setup
- `fast-check` arbitraries for events, error codes, auth contexts, scopes.
- Integration properties (P4) use Testcontainers Postgres.
- Runs in CI (`pnpm test`) — blocking gate.
