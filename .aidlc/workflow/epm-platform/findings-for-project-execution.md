# Findings for project-execution (owner: Chavakorn)

Surfaced during the Tech-Lead code review of strategy-portfolio + demand-intake (2026-07-08).
These live in **your** unit / the cross-unit event contract, so they're handed to you rather than fixed by Sophon. The demand→project promote flow (US-032) does not work end-to-end on a real database until C1 is fixed.

Context: demand-intake now publishes `demand-intake.demand.promoted` `{demandId,name,portfolioId,programId?,plannedStart,plannedEnd,plannedBudget?}`, consumed by `ProjectExecutionEventSub`. Everything below is about how that consumer + the project-execution event payloads behave.

---

## C1 — 🔴 Critical: promote seam writes a non-UUID actor into `@db.Uuid` columns
**File**: `apps/api/src/modules/project-execution/events/project-execution-event.sub.ts:49-53`
**Problem**: the `DemandPromoted` handler builds `systemCtx = { userId: "system", … }` and passes it to `projectService.createProject`, which sets `ownerUserId: ctx.userId` and `createdBy: ctx.userId` (project.service.ts:66,73) → both are `@db.Uuid` (schema.prisma:152,162). Postgres rejects `"system"` with `invalid input syntax for type uuid`. `AuditService.record` would also fail (`actor_id @db.Uuid`).
**Failure scenario**: `promoteToProject` marks the demand `Promoted` (terminal) and commits **before** publishing; the subscriber then throws on insert; the in-process bus catches & only logs (`event-bus.ts:38-47`), so promote returns 200. Net: demand is `Promoted` with **no Project created and no retry path** (re-promote is blocked by the `Approved`-only guard). Invisible to unit tests (Prisma mocked) and to CI here (int tests need Docker).
**Suggested fix**: introduce a real system-actor sentinel UUID (e.g. seed a `system` user, or a `NIL_UUID = "00000000-0000-0000-0000-000000000000"` constant) and use it in `systemCtx`; ensure any FK on `owner_user_id`/`created_by`/`actor_id` tolerates it (seed the row if a FK exists). Add a DB-backed int test that promotes a demand and asserts a Project row with `source_demand_id` is created.

## H3 — 🟠 High: project-execution event payloads lack `plannedBudget`
**File**: `packages/shared/src/events/project-execution-events.ts` (`ProjectCreatedPayload`, `StatusChangedPayload`)
**Problem**: neither payload carries `plannedBudget`. strategy-portfolio's `ProjectAlignmentProjector` therefore stores `plannedBudget: null` permanently, so the US-009 investment-mix **budget totals are always 0** in production regardless of real budgets. (Counts are correct; only budget is dead.)
**Suggested fix**: add `plannedBudget: number | null` to `ProjectCreatedPayload` (and ideally a `project.updated`/status-changed carrying it), and populate it in project-execution's publishers. This is a **shared-contract change** (`@epm/shared` SemVer bump) — coordinate with Sophon; strategy-portfolio's projector will then project it (its upsert already has the column).

## C2 — 🔴 design/reliability: promote is fire-and-forget with swallowed errors
**Files**: `apps/api/src/modules/demand-intake/services/promotion.service.ts` (mark-terminal-before-publish) + `apps/api/src/foundation/events/event-bus.ts:38-47` (swallows handler errors)
**Problem**: even with C1 fixed, any consumer error (e.g. execution's duplicate-name guard `EXECUTION_004`, or a transient DB error) is swallowed, leaving an orphaned `Promoted` demand with no project and no retry. The in-process bus is fire-and-forget for ALL units.
**Suggested fix (architectural, needs Sophon sign-off)**: route `demand.promoted` through the transactional outbox (`OutboxWriter`) so delivery is retried, OR have demand-intake set `promotedProjectId` from a project-created callback and expose a reconciliation path, OR don't mark the demand terminal until project creation is confirmed. Pick one at the platform level (affects the event-bus contract).

---

**Priority order**: C1 (blocks the flow) → C2 (reliability of the flow) → H3 (correctness of investment-mix budget). C1 is a small, safe fix; H3/C2 involve the shared event contract / bus design and should be decided with the Tech Lead.
