# identity-access — Correctness & Property-Based Testing

Extension property-based-testing (partial) is blocking. fast-check + Vitest, over pure logic.

## Properties

### P-IA-1 — Permission resolution is the union of role grants
For any set of roles a user holds and any role→permission catalog:
`effectivePermissions(user) == ∪ over r in roles of grants(r)`.
- Properties: adding a role never removes a permission (monotonic); a role with no grants adds nothing; duplicates collapse (set semantics); never throws.

### P-IA-2 — Scope loading is faithful and drift-free
For any set of `user_scope` rows, `resolveScopes` yields a `RecordScope[]` where **every** element
validates against `@epm/shared` `recordScopeSchema`, and each valid row maps to exactly one scope
(no loss, no fabrication). Rows failing the schema are dropped (fail-closed), never coerced.

### P-IA-3 — Role assignment idempotency / set semantics
Assigning a role a user already has is a no-op (no duplicate `user_role`); the effective role set is
insensitive to assignment order.

## Test setup
- fast-check arbitraries for role sets, catalogs, and `user_scope` rows.
- P-IA-1/P-IA-3 are pure (in-memory). P-IA-2's DB-loading variant runs under Testcontainers (deferred where Docker is absent); the pure mapping (row → RecordScope) is unit-tested directly.
