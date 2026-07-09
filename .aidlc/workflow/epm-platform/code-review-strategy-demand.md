# Code Review — strategy-portfolio + demand-intake

**Reviewer**: Tech Lead (Sophon) · **Date**: 2026-07-08 · **Method**: 3 parallel adversarial reviewers (per-unit + cross-cutting), findings verified against source/specs.
**Scope**: the two units built this session, on `main` at commit `8cd7d82`. Fixes landed in `6416899`.

## Verdict
Initial: **BLOCK** (1 Critical + 6 High confirmed). After Tier-A remediation: **MERGE-OK for the two units**; 3 cross-unit items deferred to project-execution's owner.

Full api suite after fixes: **216/216 green**, typecheck clean, TS strict no-`any`.

---

## Findings & resolution

### Fixed in this session (strategy-portfolio + demand-intake) — commit `6416899`
| ID | Sev | Finding | Fix |
|----|-----|---------|-----|
| H1 | High | `unlinkGoal` never recomputed alignment → last-link removal left `aligned=true` forever | `delete` returns projectId → `evaluateAlignment`; test added |
| H2 | High | investment-mix not record-scoped → PM saw platform-wide counts/budgets (data disclosure) | `ctx` threaded into aggregation; non-Director filtered to owned portfolios; test added |
| H4 | High | PM denied `intake-gate:approval` (undocumented SoD) vs components.md:256 / api-spec | Granted PM `intake-gate:approval` |
| H5 | High | single-active ScoringModel not race-safe, no DB guard → two active models possible | Partial unique index (migration 0006) + create/activate in one tx |
| H6 | High | gate/promote/score mutations non-transactional, no row lock → partial writes, concurrent double-advance | Wrapped in `prisma.$transaction` + `SELECT … FOR UPDATE`; decision+status+audit atomic; rollback test added |
| M1 | Med | archived goals linkable | active-only existence check on new links/associations |
| M2 | Med | `lastEventAt` guard admitted equal timestamps | reject `<=` |
| M3 | Med | goal-link upsert P2002 under concurrency → 500 | catch P2002 → idempotent success |
| M4 | Med | duplicate `criterionId` in a score submission → 500 | Zod uniqueness → `DEMAND_004` |
| M5 | Med | documented `?status=` list filter unimplemented | implemented + test |

### Deferred — project-execution (owner: Chavakorn) — see `findings-for-project-execution.md`
| ID | Sev | Finding |
|----|-----|---------|
| C1 | Critical | promote seam passes non-UUID `"system"` actor into `@db.Uuid` columns → on a real DB the project insert throws; demand stuck `Promoted`, no project, no retry |
| H3 | High | project-execution `ProjectCreatedPayload`/`StatusChangedPayload` lack `plannedBudget` → strategy-portfolio investment-mix budget totals are always 0 |
| C2 | Critical/design | promote marks `Promoted` (terminal) + commits before publish, and the in-process event bus swallows handler errors → silent unrecoverable orphan; needs outbox or reconciliation (architectural) |

### Accepted / not-fixed (documented, low value)
- SP null-portfolio drop in `aggregateByPortfolio` — non-issue in practice (projects always carry a portfolioId from project-execution); left as-is.
- `rankRequests` N+1 — fine at portfolio scale; optimize later.
- Minor spec/doc drifts (flagged-unaligned payload doc vs code; outbox-vs-direct-publish wording) — reconcile in specs when the next consumer subscribes.

## Note on why green tests missed these
Service unit tests mocked repositories whose behavior diverged from the real Prisma repos, and the DB-backed `*.int.test.ts` suites don't execute in this environment (`@nestjs/testing` + Docker absent). Remediation tests were written to exercise the real code paths (incl. transaction routing + rollback).
