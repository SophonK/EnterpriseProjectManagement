# Code Review — epm-platform (unit: foundation)

## Fixes Applied (2026-07-07)
| ID | Status | What changed |
|---|---|---|
| CODE-CR-1 | ✅ Fixed | `auth.guard.ts` `extractToken` now falls back to the `epm_access` cookie |
| CODE-MJ-1 | ✅ Fixed | guard `recordDenied` wrapped in try/catch (audit failure no longer masks 403) |
| CODE-MJ-2 | ✅ Fixed | `main.ts` `enableCors({ origin: WEB_ORIGIN, credentials: true })`; new `WEB_ORIGIN` config |
| CODE-MJ-3 | ✅ Fixed | added `event-bus.test.ts` (3) + `rbac.registry.test.ts` (4) |
| CODE-MN-1 | ✅ Fixed | `functional-design.md` BR4 reconciled to request-time deny-by-default |
| CODE-MN-2 | ✅ Fixed | removed unused `JWT_ACCESS_TTL`/`JWT_REFRESH_TTL` from config + `.env.example` |
| CODE-MN-3 | ✅ Fixed | migration `0002_audit_immutable` — DB trigger blocks UPDATE/DELETE on `audit_log` |
| CODE-SG-1 | ⏭️ Deferred | optional (suggestion) — `assertOwnedSchema` logging left as-is |

**Verification after fixes**: api typecheck ✅ · lint ✅ · tests **27/27** (shared 12 + api 15) · prisma validate ✅.
**Extension gates now**: security-baseline ✅ · resiliency-baseline ✅ · property-based-testing ✅ · team-multi-developer ✅.

---

## Review Summary
- **Date**: 2026-07-07
- **Scope**: Scoped — unit `foundation` (`apps/api/**`, `packages/{shared,db,config}/**`)
- **Files Reviewed**: ~45 source/config files
- **Findings**: 1 critical, 3 major, 3 minor, 1 suggestion
- **Design Compliance**: Partially Compliant (2 deviations)
- **Test Coverage Assessment**: Gaps identified (core pure logic untested)

## Findings

### 🔴 Critical

#### CODE-CR-1: Auth token delivery/consumption mismatch — cookie-authenticated SPA cannot call the API
**File**: `apps/api/src/foundation/auth/auth.controller.ts` (callback sets `epm_access` httpOnly cookie) vs `apps/api/src/foundation/auth/auth.guard.ts` (`extractBearer` reads only the `Authorization` header)
**Category**: Correctness / Security (auth flow)
**Description**: The OIDC callback stores the access token in an **httpOnly** cookie (`epm_access`). But `AuthGuard` extracts the token **only** from `Authorization: Bearer …`. A browser SPA cannot read an httpOnly cookie to put it in a header, so after a successful login the SPA's subsequent API calls will be rejected with `AUTH_001`. The two halves of the flow don't connect.
**Fix**: Have the guard also accept the token from the `epm_access` cookie (cookie-parser is already installed):
```ts
function extractToken(req: Request): string | undefined {
  const header = req.header("authorization");
  if (header) {
    const [scheme, value] = header.split(" ");
    if (scheme?.toLowerCase() === "bearer" && value) return value;
  }
  return (req.cookies?.epm_access as string | undefined) ?? undefined; // cookie fallback for the SPA
}
```
**Impact**: The web front end (separate repo) is effectively unauthenticated against the API despite a successful SSO login. Blocks the primary user path.

---

### 🟡 Major

#### CODE-MJ-1: Access-denied audit write is not error-isolated in the guard
**File**: `apps/api/src/foundation/auth/auth.guard.ts` (`recordDenied` is `await`ed without try/catch)
**Category**: Error Handling / Resiliency
**Description**: On a denial the guard does `await this.recordDenied(...)` before throwing `forbidden()`. If the audit DB write fails, the guard throws the **audit** error (→ 500) instead of the intended 403, and the real reason is lost. The interceptor's equivalent path is wrapped in try/catch; the guard's is not.
**Fix**: Wrap in try/catch (log-and-continue), mirroring `AuditInterceptor.recordDenied`.
**Impact**: When the DB is degraded, legitimate 403s become 500s (resiliency-baseline gap — external failure not gracefully degraded).

#### CODE-MJ-2: CORS not configured
**File**: `apps/api/src/main.ts`
**Category**: Correctness / Integration
**Description**: The web UI lives in a **separate repo / origin** (Hybrid architecture) and calls this API cross-origin, but `app.enableCors(...)` is never called. Browser preflight will fail; with cookie auth you also need `credentials: true` and a specific origin (not `*`).
**Fix**: `app.enableCors({ origin: config-driven allowlist, credentials: true });`
**Impact**: Web front end cannot call the API from the browser.

#### CODE-MJ-3: No unit tests for DB-free core logic (EventBus, RbacRegistry)
**Files**: `apps/api/src/foundation/events/event-bus.ts`, `apps/api/src/foundation/auth/rbac.registry.ts`
**Category**: Test Quality
**Description**: `InProcessEventBus` (subscribe/publish, handler-failure isolation, event-type validation) and `RbacRegistry.permitted` are pure/in-memory and trivially testable without a DB or IdP, yet have no tests. PBT covers the shared decision logic (P3) but not the registry wiring or the bus dispatch/isolation behavior.
**Fix**: Add unit tests: bus delivers to all subscribers, isolates a throwing handler, rejects invalid event types; registry grants/permits correctly.
**Impact**: Core dispatch/authorization wiring could regress silently.

---

### 🟢 Minor

#### CODE-MN-1: Design deviation — request-time deny-by-default instead of boot-time permission scan
**File**: `apps/api/src/foundation/auth/auth.guard.ts`
**Description**: Design 8.4 / functional-design specified a **boot-time** scan that fails startup if any protected handler lacks `@RequirePermission`. Implementation enforces this at **request time** (route without permission → 403). Arguably stronger, but it diverges from the design and defers detection to runtime. Reconcile the design doc or add the startup scan.

#### CODE-MN-2: Unused configuration keys
**File**: `apps/api/src/foundation/config/config.schema.ts` (`JWT_ACCESS_TTL`, `JWT_REFRESH_TTL`)
**Description**: The API verifies IdP-issued tokens and does not mint its own JWTs, so these TTLs are unused. Remove them, or wire them if app-token issuance is intended.

#### CODE-MN-3: `audit_log` immutability is convention-only
**File**: `packages/db/prisma/schema.prisma` / migration
**Description**: NFR SEC-3 calls for an immutable audit trail, but nothing revokes UPDATE/DELETE at the DB level. Add a hardening migration (revoke UPDATE/DELETE on `shared.audit_log` from the app role) so immutability is enforced, not just documented.

---

### 💡 Suggestions

#### CODE-SG-1: Route `assertOwnedSchema` production logging through pino
**File**: `apps/api/src/foundation/db/base-repository.ts`
**Description**: In production the guard `console.error`s and continues. Prefer the structured pino logger for consistency (OBS-1), and consider a metric/alert on cross-schema violations.

---

## Design Compliance Summary
| Design Artifact | Status | Notes |
|---|---|---|
| components.md | ✅ Compliant | all foundation components implemented |
| data-model.md | ⚠️ Deviation | audit immutability convention-only (MN-3) |
| api-spec.md | ✅ Compliant | /health + /auth/* present, RFC 7807 errors |
| integration.md | ⚠️ Deviation | CORS missing for cross-origin web (MJ-2) |
| implementation.md | ✅ Compliant | directory layout + build order match |
| functional-design.md | ⚠️ Deviation | request-time vs boot-time permission enforcement (MN-1); token cookie/header mismatch (CR-1) |

## Extension Compliance (blocking)
| Extension | Status | Notes |
|---|---|---|
| security-baseline | ⚠️ Needs CR-1 | controls present (RBAC deny-by-default, audit, redaction, helmet, rate-limit) but the cookie/header mismatch breaks authenticated access; CORS+credentials needed |
| resiliency-baseline | ⚠️ Needs MJ-1 | health/outbox/idempotency/timeouts/shutdown present; audit-failure path not gracefully degraded |
| property-based-testing (partial) | ✅ Satisfied | P1–P5 present and passing |
| team-multi-developer | ✅ Satisfied | foundation + shared owned/edited by Tech Lead (Sophon) |

## Test Coverage Summary
| Area | Tests Exist | Assessment |
|---|---|---|
| shared: errors, events, auth (P1/P2/P3) | ✅ | Adequate |
| api: config, error filter, idempotency (P2/P4/P5) | ✅ | Adequate |
| EventBus, RbacRegistry | ❌ | Gap (MJ-3) |
| OIDC/JWT/guard, Prisma repos, health | ❌ | Runtime/DB/IdP-dependent — deferred (documented) |

## Recommendations
### Must Fix (before web integration / deploy)
1. CODE-CR-1: guard must read the token from the `epm_access` cookie (or change token delivery).

### Should Fix (before next release)
1. CODE-MJ-1: isolate audit failures in the guard.
2. CODE-MJ-2: enable CORS with credentials for the web origin.
3. CODE-MJ-3: add unit tests for EventBus + RbacRegistry.

### Consider
1. CODE-MN-1/2/3, CODE-SG-1.
