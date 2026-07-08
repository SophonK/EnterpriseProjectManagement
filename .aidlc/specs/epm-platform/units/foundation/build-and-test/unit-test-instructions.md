# Unit Test Instructions — Unit: foundation

## Run
```bash
pnpm test            # all packages (Turborepo)
# or per package:
pnpm --filter @epm/shared test
pnpm --filter @epm/api test
```

## Expected results (verified 2026-07-07)
| Package | Test files | Tests | Notes |
|---|---|---|---|
| @epm/shared | 3 | **12** | errors mapping, event serialization, RBAC access (P3) |
| @epm/api | 3 | **8** | config (P5), error filter (P2), idempotency (P4) |
| **Total** | 6 | **20 passed** | 0 failed |

## Property-based tests (fast-check) — blocking (property-based-testing extension)
| Property | Where | Covers |
|---|---|---|
| P1 | shared/events/serialization.test.ts | event serialize↔deserialize round-trip |
| P2 | shared/errors/problem-details.test.ts + api/errors filter test | RFC 7807 mapping totality |
| P3 | shared/auth/access.test.ts | RBAC record-scope (deny-by-default, Director, monotonic, never-throws) |
| P4 | api/events/idempotency.test.ts | at-most-once effect under duplicate delivery |
| P5 | api/config/config.schema.test.ts | env validation (valid → typed; missing → throws) |

## Coverage
Coverage collection available via Vitest (`--coverage`). Foundation logic (errors, auth
decision, events, config) is exercised by the property tests above.

## Fixing failures
Read the Vitest output, fix the implementation (not the test, unless the test is wrong),
re-run until green. PBT counterexamples are shrunk — the reported minimal input reproduces
the failure deterministically (seed printed).
