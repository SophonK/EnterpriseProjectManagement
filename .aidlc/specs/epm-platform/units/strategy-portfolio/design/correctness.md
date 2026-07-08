# Correctness & PBT — strategy-portfolio

## Summary

This unit ships three property-based tests (fast-check), classified **partial / blocking** (D3-7), covering the invariants most vulnerable to boundary and combinatorial error:

- **P1 — Investment-mix total-preserving**: aggregation over `ProjectAlignmentView` neither loses nor double-counts budget or projects within a single `groupBy` dimension (partition on the portfolio dimension; documented link-expansion covering-set on the goal dimension). *(BR-108, US-009)*
- **P2 — Alignment exhaustive / deterministic**: `evaluateAlignment(projectId)` is a total boolean function equal to `(GoalLink count ≥ 1)` with no third state, and is idempotent. *(BR-103/BR-104, US-008/US-010)*
- **P3 — Link idempotency**: `linkProjectToGoals` / `associateGoals` applied twice with the same pair equals applied once (set semantics via `@@unique`) — no duplicate rows, no error. *(BR-106/BR-107, US-007/US-008)*

Tests live in `apps/api/src/modules/strategy-portfolio/__tests__/**/*.spec.ts`, using `fc.assert(fc.asyncProperty(...), { numRuns: 100 })`, mirroring the `project-execution` PBT style (`fast-check`, Vitest, mocked repositories).

---

## Property-Based Tests (fast-check)

### P1: Investment-Mix Total-Preserving

**Statement**: For any set of in-scope `ProjectAlignmentView` rows, `InvestmentMixService.getInvestmentMix(groupBy)` produces groups that partition the in-scope set on the chosen dimension such that:
- `SUM over groups of group.totalPlannedBudget == SUM of coalesce(plannedBudget, 0) over all in-scope rows`, and
- `SUM over groups of group.projectCount == count of in-scope rows`.

For `groupBy = 'portfolio'` this is a strict partition (each project in exactly one portfolio group, `null → "unassigned"`). For `groupBy = 'goal'` the invariant holds over the **link-expanded** set: a project linked to N goals contributes to N goal-groups by design, so the conserved quantity is the sum over `(project, goal)` links, not over distinct projects (documented caveat — the goal dimension is a covering multiset, not a partition).

**Generator**:
```typescript
const viewRow = fc.record({
  projectId:     fc.uuid(),
  plannedBudget: fc.option(fc.integer({ min: 0, max: 10_000_000 }), { nil: null }),
  portfolioId:   fc.option(fc.constantFrom("port-1", "port-2", "port-3"), { nil: null }),
});
const scope = fc.uniqueArray(viewRow, {
  minLength: 0, maxLength: 50, selector: (r) => r.projectId,
});
```

**Assertion** (portfolio dimension — strict partition):
```typescript
await fc.assert(
  fc.asyncProperty(scope, async (rows) => {
    const svc = new InvestmentMixService(
      makeViewRepo(rows) as never,
      makeGoalLinkRepo([]) as never,
      makePortfolioRepo() as never,
    );

    const groups = await svc.getInvestmentMix("portfolio");

    const expectedBudget = rows.reduce((s, r) => s + (r.plannedBudget ?? 0), 0);
    const sumBudget = groups.reduce((s, g) => s + g.totalPlannedBudget, 0);
    const sumCount  = groups.reduce((s, g) => s + g.projectCount, 0);

    expect(sumBudget).toBe(expectedBudget);   // no budget lost or double-counted
    expect(sumCount).toBe(rows.length);       // partition: every project counted exactly once
  }),
  { numRuns: 100 },
);
```

**Assertion** (goal dimension — link-expansion caveat): seed `GoalLink` rows and assert conservation over the expanded `(project, goal)` link set:
```typescript
const sumCount = groups.reduce((s, g) => s + g.projectCount, 0);
expect(sumCount).toBe(links.length);          // one count per link, by design
```

**Why PBT**: off-by-one in grouping, dropped null-budget/null-portfolio rows, and double-counting across group boundaries are exactly the errors example tests miss.

---

### P2: Alignment Exhaustive & Deterministic

**Statement**: For any `projectId` and any set of `GoalLink` rows, `AlignmentService.evaluateAlignment(projectId)` returns a boolean equal to `(GoalLink count for projectId ≥ 1)`. It is a **total** function — every input yields exactly `true` or `false`, never null and never a third state — and it is **idempotent**: calling it twice with unchanged links returns the same value and leaves the projection unchanged.

**Generator**:
```typescript
const linkCount = fc.nat({ max: 20 });   // 0 .. 20 GoalLink rows for the project
```

**Assertion**:
```typescript
await fc.assert(
  fc.asyncProperty(fc.uuid(), linkCount, async (projectId, n) => {
    const goalLinkRepo = makeGoalLinkRepo(
      Array.from({ length: n }, (_, i) => ({ goalId: `g-${i}`, projectId })),
    );
    const viewRepo = makeViewRepo([{ projectId, status: "Active", aligned: false }]);
    const svc = new AlignmentService(goalLinkRepo as never, viewRepo as never, makeEventBus() as never);

    const first  = await svc.evaluateAlignment(projectId);
    const second = await svc.evaluateAlignment(projectId);

    expect(typeof first).toBe("boolean");     // total: always a boolean, never null/undefined
    expect(first).toBe(n >= 1);               // exhaustive: aligned iff >= 1 link (BR-103)
    expect(second).toBe(first);               // deterministic / idempotent
    expect(viewRepo.setAligned).toHaveBeenLastCalledWith(projectId, n >= 1);
  }),
  { numRuns: 100 },
);
```

**Why PBT**: guarantees no boundary (0 vs 1 link) or repeat-evaluation drift produces a third state or an inconsistent projection.

---

### P3: Link Idempotency

**Statement**: For any `projectId` and any list of `goalIds`, applying `GoalLinkService.linkProjectToGoals` twice with the same input yields the same persisted state as applying it once — no duplicate `GoalLink` rows (guarded by `@@unique([goalId, projectId])`) and no error on the second call. The identical property holds for `PortfolioService.associateGoals` and `@@unique([portfolioId, goalId])`.

**Generator**:
```typescript
const goalIds = fc.uniqueArray(fc.uuid(), { minLength: 0, maxLength: 10 });
```

**Assertion**:
```typescript
await fc.assert(
  fc.asyncProperty(fc.uuid(), goalIds, async (projectId, goalIds) => {
    const store = new Set<string>();                       // simulates @@unique set semantics
    const repo = makeGoalLinkRepo([]);
    repo.upsert.mockImplementation(async ({ goalId, projectId }) => {
      store.add(`${goalId}:${projectId}`);                 // set insert — no duplicate key
      return { id: `${goalId}:${projectId}`, goalId, projectId };
    });
    const svc = new GoalLinkService(repo as never, makeAlignmentService() as never, makeEventBus() as never);

    await svc.linkProjectToGoals(projectId, goalIds, "user-1");
    const afterOnce = new Set(store);

    await expect(                                           // second apply must not throw
      svc.linkProjectToGoals(projectId, goalIds, "user-1"),
    ).resolves.toBeDefined();

    expect(store.size).toBe(afterOnce.size);               // no new rows
    expect(store.size).toBe(new Set(goalIds).size);        // exactly one row per distinct pair
  }),
  { numRuns: 100 },
);
```

**Why PBT**: re-linking is a normal user action (US-008 "created or edited"); the property proves the `@@unique` upsert path is safe across arbitrary goal sets and repeat calls, with no duplicates and no re-link error.

---

## Unit Test Coverage Requirements

- `AlignmentService`: 100% branch coverage on `evaluateAlignment` (0-link vs ≥1-link) and the active-unaligned flag path (BR-103/BR-104).
- `InvestmentMixService`: 100% branch coverage on both `groupBy` dimensions, including null `plannedBudget` and null `portfolioId` handling (BR-108).
- `GoalLinkService` / `PortfolioService`: idempotent upsert path, empty-`goalIds` no-op (BR-106/BR-107).
- `ProjectAlignmentProjector`: idempotency (dedupe by `eventId`) and `lastEventAt` out-of-order guard (BR-111).

## Integration Tests (Testcontainers / real Postgres)

- Full lifecycle: create goal → create portfolio (owner = creator) → associate goals → link project → evaluate alignment → investment-mix.
- Projection upsert from `project-execution.project.created` / `.status.changed` events; duplicate/out-of-order events produce no duplicate rows.
- `associateGoals` / `linkProjectToGoals` re-applied — `@@unique` prevents duplicate rows (P3 at the DB level).
- Unaligned report returns only `status = 'Active' AND aligned = false` rows with owner + portfolio (BR-109).
- Record-scope filter returns only owner-scoped portfolios for non-Director; audit entries written on every mutation (BR-110).
