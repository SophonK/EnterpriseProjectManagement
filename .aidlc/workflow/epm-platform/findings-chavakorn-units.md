# Code Review — Chavakorn's units (resource-management, risk-raid, reporting-dashboards)

**Reviewer**: Tech Lead (Sophon) · **Date**: 2026-07-08 · **Method**: 4 parallel adversarial reviewers (3 per-unit + cross-cutting), findings verified against source/specs and real foundation types.
**Verdict**: **BLOCK** — 3 verified authorization Criticals (already merged to `main`, HEAD `1239088`), plus 7 High and multiple Medium/Low. Build/typecheck/254 tests are green — **none of the Criticals are test-covered** (systemic: hollow PBT, all-Director tests, mocked `buildScopeWhere`).

> **UPDATE — ALL RESOLVED by Sophon.**
> - Auth Criticals + export gate (`04efb29`): C1, C2, C3, H4 + 19 scoped-role tests.
> - resource-management (`f28ab35`): H1 (pool-scope on write), H2 (archived-allocation exclusion + migration), H3 (update events) + all Mediums (Zod validation, flag-clear recompute, P2002→RESOURCE_003, N+1, `/resource-pools` + capacity-period endpoints) + hollow-PBT rewrite.
> - risk-raid (`f9658f0`): H7 (RaidQueryService) + non-Risk escalation guard, archive-cascade audit (SYSTEM_ACTOR_ID), P2002 dependency handling, transactional mutations, threshold clamp + DependencyService tests + cycle-PBT rewrite.
> - reporting-dashboards (`496bcf2`): H5 (full risk export, no silent truncation), H6 (portfolio-scoped top risks via RaidQueryService), CSV formula-injection guard, alignment-count scope guard + getExportRows/REPORT_003 tests.
>
> **Full api suite 328/328 green, typecheck clean.** The systemic test-quality gap (all-Director tests, hollow PBT) was rebuilt: every fix ships with a non-Director scoped test. Only runtime-deferred items remain across the platform (live Postgres migrate, Testcontainers int-test execution, OIDC/IdP).

> Root theme: record-scoping was implemented against a wrong mental model of `RecordScope` (real shape `{ type: ScopeType('portfolio'|'program'|'project'|'resource-pool'); ids?; subtreeRootId? }`) and the platform only ever issues **`portfolio`**-type scopes (see `project.repository.ts:170-179`). Correct idiom to copy: project-execution's `buildScopeWhere`.

---

## 🔴 CRITICAL (authorization — live on main)

### C1 — resource scope fails OPEN → platform-wide resource/allocation exposure
`resource-management/repositories/resource.repository.ts:159-164`. Filters `type === "pool"` (never issued; real value `"resource-pool"`), reads `.id` (real field `.ids`), and a `as { type; id }` cast hid it from tsc. `poolIds` is always `[]` → `return {}` = no filter. Every non-Director with `resource:read` (PM/PROGRAM_MANAGER/PROJECT_MANAGER/RESOURCE_MANAGER/EXEC_SPONSOR) gets **all** resources via `GET /resources`, the utilization API, and the reporting capacity heatmap/CSV. Also enables cross-pool mutation via `findByIdOrThrow` in `allocate`.
**Fix**: `filter(s => s.type === "resource-pool").flatMap(s => [...(s.ids ?? []), ...(s.subtreeRootId ? [s.subtreeRootId] : [])])`, and return `{ poolId: { in: poolIds } }` **unconditionally** (empty ⇒ matches nothing = deny-by-default). Mirror project-execution.

### C2 — risk list: caller `projectId` clobbers scope → IDOR
`risk-raid/repositories/raid-item.repository.ts:138`. `{ ...scopeWhere, ...(filter.projectId ? { projectId } : {}) }` — same key, so `?projectId=<any>` overwrites the scope predicate. Any `raid:read` holder reads any project's full RAID register.
**Fix**: never let a filter override scope — `AND: [scopeWhere, filter.projectId ? { projectId } : {}]`, or intersect the requested id against the allowed set.

### C3 — risk scope keys on `project` type (never issued) → all non-Directors blocked
`risk-raid/repositories/raid-item.repository.ts:55-61`. Filters `type === "project"`, but only `portfolio` scopes exist → `projectId IN ()` → empty for every non-Director (and the flagship "top escalated risks" dashboard). Fails closed (not a leak) but breaks the primary persona. (C2 then becomes the *only* way to use the feature — via the insecure path.)
**Fix**: resolve accessible projects from portfolio/program scope (delegate to `ProjectService`/the project read-model), honor `subtreeRootId` + `ownerUserId`.

## 🟠 HIGH
- **H1** `resource.service.ts:23-79` — create/update resource never checks the target pool is in the caller's scope → unauthorized create/move across pools.
- **H2** `resource-management/events/resource-management-event.sub.ts:46-53` — `project.archived` handler sets `overAllocatedConfirmed=false` instead of excluding archived allocations; nothing filters that flag, so archived allocations still count toward utilization/over-allocation, and the manager's confirmation audit flag is corrupted. (integration.md:7 intent unmet.)
- **H3** `resource-management/services/allocation.service.ts:181-261` — `updateAllocation` publishes neither `resource.allocated` nor `resource.over-allocated`; allocation edits (incl. crossing 100%) are invisible to reporting/subscribers.
- **H4** `reporting-dashboards`: `/reports/export` gated only by `dashboard:read` but serves capacity (`utilization:read`) and risk (`raid:read`) datasets → PM pulls capacity via `?reportType=capacity`, bypassing the per-endpoint gate.
- **H5** `reporting-dashboards/services/dashboard.service.ts:88-92` — risk-summary export silently truncated to 100 rows (`Math.min(pageSize,100)`), ignoring `EXPORT_ROW_LIMIT`; incomplete CSV, no error.
- **H6** `reporting-dashboards/services/dashboard.service.ts:31` — `topEscalatedRisks` not scoped to the viewed portfolio → portfolio-health shows platform-wide risks mislabeled as this portfolio's.
- **H7** `risk-raid.module.ts` — specced `RaidQueryService` export (`listEscalatedRisks`, `getRaidSummary → RaidSummaryDTO`) not implemented; reporting worked around it by calling `listRaidItems` directly (inheriting C2/C3). `RaidSummaryDTO` is never produced.

## 🟡 MEDIUM
- resource: no Zod validation on utilization/capacity endpoints (`UtilizationQuerySchema`/`CapacityDemandQuerySchema` are dead code) → bad `from/to` silently return empty instead of RESOURCE_001.
- resource: `overAllocated` flag recompute wrong — `updateAllocation` only ever sets true (never clears); `deleteAllocation` trusts stale stored flags instead of re-summing (BR-6 violated).
- resource: soft-delete + non-partial `UNIQUE(email)` → re-create with a deleted email → P2002 500 instead of RESOURCE_003.
- resource: N+1 fan-out in utilization/capacity (O(resources×months×2) queries).
- resource: missing `GET/POST /resource-pools` (api-spec) → pools uncreatable via API, so `createResource` is unusable without DB seeding; `CapacityPeriod` upsert path unreachable.
- risk: non-Risk items (Issue/Assumption) can carry severity/probability → `escalated:true` + `risk.escalated` published (BR-2/BR-3 violated).
- risk: `closeAllForProject` archive-cascade writes no audit + uses `"system"` literal instead of `SYSTEM_ACTOR_ID`.
- risk: dependency duplicate handling branches on `err.message.includes("uq_dependency_pair")` (fragile) instead of `err.code === 'P2002'`.
- risk: no `$transaction` around persist + audit + publish (partial-write risk).
- reporting: CSV formula injection — `escapeCsvCell` doesn't neutralize leading `= + - @` in free-text RAID titles/names.
- reporting: `getAlignmentCoverage` takes no `AuthContext`; safe only by side-effect of a sibling `Promise.all` call (fragile latent leak).

## 🟢 LOW (see per-unit transcripts)
resource: `allocation_pct` DB check only `>0` (spec `0<x≤200`); util DTO shows allocatedPct but bands on utilPct; over-alloc warning DTO never produced. risk: dependency reads unscoped; only direct (not transitive) cycles prevented; unvalidated `RAID_ESCALATION_THRESHOLD`; Open→terminal user jump; partial-index Prisma/migration drift. reporting: magic `"Cancelled"` literal; nfr.md vs api-spec permission inconsistency.

## Test-quality (systemic — why all of this shipped "green")
- resource `allocation.service.test.ts` PBT is **hollow**: reimplements `naiveSum` and asserts naive-vs-naive; never calls `AllocationService.allocate`/`sumOverlapping`. All tests run as `EPMO_DIRECTOR` with `recordScopes: []` → Director bypass masks every scope bug.
- risk `buildScopeWhere` is mocked to `{}` in tests; `DependencyService` has **zero** tests; the cycle PBT reimplements the check inline.
- reporting: 1 test file exercises only the pure `toCsv`; `getExportRows` (incl. spec-required `REPORT_003`), scope, and aggregation math untested.
- **Every Critical would have been caught by one non-Director scoped-role test.** Remediation MUST add scoped-role tests, not just fix the code.

---

## Recommended remediation order
1. **C1, C2, C3 + H4** (authorization — live on main) — small, focused repo/handler fixes + scoped-role tests. Do first.
2. **H1, H2, H3, H5, H6, H7** (functional correctness + missing contract).
3. Mediums (validation, flag recompute, transactions, CSV injection) + test-quality rebuild.

C1/C2/C3 share one root cause (RecordScope idiom) — a single correct helper + delegation to project-execution's scope resolution fixes all three.
