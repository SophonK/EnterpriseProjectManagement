# identity-access — NFR Requirements (expanded)

Elaborates nfr.md into measurable requirements. security-baseline + resiliency-baseline blocking.

## Security
| ID | Requirement | Target / Acceptance |
|---|---|---|
| IA-SEC-1 | Authz data sourced from DB, not IdP claims | roles/scopes on every request derive from `identity` tables (D3-4); tampered claims cannot escalate |
| IA-SEC-2 | Admin ops Director-only | non-Director → 403 `AUTH_002` + audit row on every `identity:*` mutation |
| IA-SEC-3 | All role/scope changes audited | 100% mutations produce an immutable `audit_log` entry (actor, target, before/after) in-tx |
| IA-SEC-4 | New identities have zero authz | JIT user created with no roles/scopes (deny-by-default) |
| IA-SEC-5 | Scope input validated | grant-scope rejects rows failing `recordScopeSchema` → 400 |

## Reliability / Resiliency
| ID | Requirement | Target |
|---|---|---|
| IA-REL-1 | RBAC available without per-request DB | role→permission served from in-memory registry loaded at boot |
| IA-REL-2 | Fail closed on resolution error | scope/role resolution failure ⇒ empty set ⇒ deny (never fail open) |
| IA-REL-3 | Provisioning resilient | login→provision is event-driven, idempotent; transient failure does not block login |
| IA-REL-4 | Registry reload path | a documented reload (re-run bootstrap) reflects DB grant changes without redeploy |

## Performance
| ID | Requirement | Target |
|---|---|---|
| IA-PERF-1 | Authz overhead | role/scope resolution < 10 ms p95 (indexed by userId, optional per-request cache) |
| IA-PERF-2 | User list bounded | pagination enforced (default 25, max 100) |

## Maintainability / Observability
| ID | Requirement | Target |
|---|---|---|
| IA-MNT-1 | Reuse shared contracts | Role/Permission/RecordScope from `@epm/shared`; no local redefinition |
| IA-OBS-1 | Admin actions traceable | audit + structured logs with requestId on every mutation |

## Tech-Stack Decisions (aligned with foundation/D3)
- NestJS module; Prisma `identity` schema; Zod DTOs; foundation AuthGuard/RbacRegistry/AuditService/EventBus reused.
- No new external dependencies. IdP consumed indirectly via foundation OIDC.
