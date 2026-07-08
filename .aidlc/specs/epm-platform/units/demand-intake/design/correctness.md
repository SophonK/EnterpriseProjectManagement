# Correctness & PBT — demand-intake

## Summary

This unit ships three property-based tests (fast-check), classified **partial / blocking** (D3-6), covering the invariants most vulnerable to boundary, combinatorial, and state-machine error:

- **P1 — Weighted-score bounded & correct**: `ScoreCalculator.computeWeightedTotal` always returns a value in `[0, 100]` equal to the hand-computed weight-normalized weighted sum, and returns a defined value (never `NaN`) when `Σ weight = 0`. *(BR-203, US-030)*
- **P2 — Ranking deterministic total order**: `ScoreCalculator.rank` produces a total order (antisymmetric + transitive) that is permutation-invariant, with a stable tie-break by `submittedAt` ascending. *(BR-204, US-030)*
- **P3 — Stage-gate transition validity**: only the single legal forward transition succeeds; `Rejected`/`Promoted` are terminal; an illegal advance throws `DEMAND_*` and does not mutate state. *(BR-206/BR-207/BR-208, US-031/US-032)*

Tests live in `apps/api/src/modules/demand-intake/__tests__/pbt.test.ts`, using `fc.assert(fc.asyncProperty(...), { numRuns: 100 })`, mirroring the `strategy-portfolio` / `project-execution` PBT style (`fast-check`, Vitest, mocked repositories). `ScoreCalculator` is a pure domain helper, so P1 and P2 test it directly with no mocks.

---

## Property-Based Tests (fast-check)

### P1: Weighted-Score Bounded & Correct

**Statement**: For any set of `ScoringCriterion` (each with `weight ≥ 0`, `maxScore ≥ 1`) and any matching `CriterionScore` (each `rawScore ∈ [0, maxScore]`), `ScoreCalculator.computeWeightedTotal(criteria, scores)` returns a number `t` such that:
- `0 ≤ t ≤ 100` (bounded), and
- `t` equals the hand-computed normalized weighted sum `( Σᵢ weightᵢ·(rawScoreᵢ/maxScoreᵢ) / Σᵢ weightᵢ ) × 100`, and
- when `Σ weight = 0` (all-zero weights or empty criteria), `t` is a defined finite value (`0`) — never `NaN` and never `Infinity`.

**Generator**:
```typescript
const criterion = fc.record({
  id:       fc.uuid(),
  weight:   fc.integer({ min: 0, max: 100 }),        // relative weight, 0 allowed
  maxScore: fc.integer({ min: 1, max: 100 }),
});
const model = fc
  .uniqueArray(criterion, { minLength: 0, maxLength: 12, selector: (c) => c.id })
  .chain((criteria) =>
    fc.tuple(
      fc.constant(criteria),
      // one rawScore per criterion, each in [0, maxScore]
      fc.tuple(...criteria.map((c) => fc.integer({ min: 0, max: c.maxScore }))),
    ),
  )
  .map(([criteria, raws]) => ({
    criteria,
    scores: criteria.map((c, i) => ({ criterionId: c.id, rawScore: raws[i] })),
  }));
```

**Assertion**:
```typescript
await fc.assert(
  fc.asyncProperty(model, async ({ criteria, scores }) => {
    const t = ScoreCalculator.computeWeightedTotal(criteria, scores);

    // bounded and finite — never NaN/Infinity even when Σweight = 0
    expect(Number.isFinite(t)).toBe(true);
    expect(t).toBeGreaterThanOrEqual(0);
    expect(t).toBeLessThanOrEqual(100);

    // equals the independent hand computation (BR-203)
    const byId = new Map(scores.map((s) => [s.criterionId, s.rawScore]));
    const totalWeight = criteria.reduce((s, c) => s + c.weight, 0);
    const expected =
      totalWeight === 0
        ? 0                                                    // Σweight = 0 guard
        : (criteria.reduce(
            (s, c) => s + c.weight * ((byId.get(c.id) ?? 0) / c.maxScore),
            0,
          ) / totalWeight) * 100;

    expect(t).toBeCloseTo(expected, 6);
  }),
  { numRuns: 100 },
);
```

**Why PBT**: division-by-zero (`Σweight = 0 → NaN`), un-normalized raw scores exceeding 100, and boundary rounding are exactly the errors example tests miss. The independent recomputation pins the formula, and the finiteness/bounds checks pin the guard.

---

### P2: Ranking Deterministic Total Order

**Statement**: For any set of scored requests `{ id, weightedTotal, submittedAt }`, `ScoreCalculator.rank(requests)` yields an ordering that is a **total order** — antisymmetric and transitive under the comparator (`weightedTotal` descending, then `submittedAt` ascending) — and is **permutation-invariant**: ranking any shuffle of the same set produces the identical `id → rank` assignment. Two distinct requests share a rank position only if both `weightedTotal` and `submittedAt` are equal.

**Generator**:
```typescript
const request = fc.record({
  id:            fc.uuid(),
  weightedTotal: fc.integer({ min: 0, max: 100 }),           // ties are common by design
  submittedAt:   fc.date({ min: new Date("2020-01-01"), max: new Date("2026-01-01") }),
});
const requests = fc.uniqueArray(request, {
  minLength: 0, maxLength: 40, selector: (r) => r.id,
});
```

**Assertion**:
```typescript
await fc.assert(
  fc.asyncProperty(
    requests,
    fc.func(fc.nat()),                                        // drives a deterministic shuffle
    async (input, shuffleKey) => {
      const shuffled = [...input].sort((a, b) => shuffleKey(a.id) - shuffleKey(b.id));

      const rankedA = ScoreCalculator.rank(input);
      const rankedB = ScoreCalculator.rank(shuffled);

      // permutation-invariant: same id -> same rank regardless of input order
      const mapA = new Map(rankedA.map((r) => [r.id, r.rank]));
      const mapB = new Map(rankedB.map((r) => [r.id, r.rank]));
      for (const [id, rank] of mapA) expect(mapB.get(id)).toBe(rank);

      // total order: verify the sort key is monotonically non-improving pairwise
      for (let i = 1; i < rankedA.length; i++) {
        const prev = rankedA[i - 1];
        const cur  = rankedA[i];
        const ordered =
          prev.weightedTotal > cur.weightedTotal ||           // desc primary
          (prev.weightedTotal === cur.weightedTotal &&
            prev.submittedAt <= cur.submittedAt);             // asc stable tie-break (BR-204)
        expect(ordered).toBe(true);

        // antisymmetry: distinct ranks unless both keys tie
        if (prev.weightedTotal === cur.weightedTotal &&
            +prev.submittedAt === +cur.submittedAt) {
          expect(cur.rank).toBe(prev.rank + 1);               // still a stable, distinct position
        }
      }
    },
  ),
  { numRuns: 100 },
);
```

**Why PBT**: an unstable sort or a comparator that is not a total order surfaces only on specific tie/permutation combinations. Re-ranking a shuffle and asserting an identical `id → rank` map proves determinism; the pairwise monotonicity check proves the ordering and the `submittedAt` tie-break.

---

### P3: Stage-Gate Transition Validity

**Statement**: For any `DemandRequest` in any state and any sequence of advance/reject commands, `StageGateService` allows **only** the single legal forward transition (`Submitted → Screening → Evaluation → Approved`) or a reject from an active gate. `Rejected` and `Promoted` are terminal (no outgoing transition). Every illegal command — skipping a gate, moving backward, advancing past `Approved`, or acting on a terminal state — throws `DEMAND_*` and leaves the request's `status`/`currentGate` **unchanged**.

**Generator**:
```typescript
const GATES = ["Submitted", "Screening", "Evaluation", "Approved"] as const;
const startState = fc.constantFrom(
  ...GATES, "Rejected", "Promoted",                           // include terminals
);
const command = fc.constantFrom("advance", "reject");
const script  = fc.array(command, { minLength: 1, maxLength: 8 });
```

**Assertion**:
```typescript
await fc.assert(
  fc.asyncProperty(startState, script, async (start, cmds) => {
    const request = {
      id: "d-1", status: start, currentGate: start,
      rejectionReason: null,
    };
    // full per-gate permission so RBAC never masks a transition-validity failure
    const ctx: AuthContext = {
      userId: "user-1", roles: ["PORTFOLIO_MANAGER"],
      recordScopes: [],
      permissions: ["intake-gate:screening", "intake-gate:evaluation", "intake-gate:approval"],
    };
    const repo = makeDemandRepo(request);
    const svc  = new StageGateService(
      repo as never, makeEventBus() as never, makeAudit() as never,
    );

    for (const cmd of cmds) {
      const before = { status: request.status, currentGate: request.currentGate };
      const terminal = before.status === "Rejected" || before.status === "Promoted";
      const legalAdvance =
        cmd === "advance" && !terminal &&
        GATES.indexOf(before.currentGate) >= 0 &&
        GATES.indexOf(before.currentGate) < GATES.length - 1;
      const legalReject =
        cmd === "reject" && !terminal && before.status !== "Approved" &&
        GATES.indexOf(before.currentGate) >= 0;

      if (legalAdvance) {
        await svc.advanceGate(request.id, ctx, "req-1");
        const next = GATES[GATES.indexOf(before.currentGate) + 1];
        expect(request.currentGate).toBe(next);               // exactly one step forward
        expect(request.status).toBe(next);
      } else if (legalReject) {
        await svc.rejectGate(request.id, "no budget", ctx, "req-1");
        expect(request.status).toBe("Rejected");              // terminal, reason recorded
        expect(request.rejectionReason).toBe("no budget");
      } else {
        // illegal: must throw DEMAND_* and NOT mutate
        await expect(
          cmd === "advance"
            ? svc.advanceGate(request.id, ctx, "req-1")
            : svc.rejectGate(request.id, "x", ctx, "req-1"),
        ).rejects.toThrow(/DEMAND_/);
        expect(request.status).toBe(before.status);           // unchanged
        expect(request.currentGate).toBe(before.currentGate);
      }
    }
  }),
  { numRuns: 100 },
);
```

**Why PBT**: a hand-picked example set cannot cover every `(state, command)` pair across arbitrary command sequences. Driving random scripts from every start state — including the two terminals — proves the state machine admits exactly the legal transitions and that rejected illegal commands never corrupt state.

---

## Unit Test Coverage Requirements

- `ScoreCalculator.computeWeightedTotal`: 100% branch coverage including the `Σweight = 0` / empty-criteria guard and `maxScore` normalization (BR-203).
- `ScoreCalculator.rank`: 100% branch coverage on the descending sort, the `submittedAt` tie-break, and the empty/single-element cases (BR-204).
- `StageGateService`: 100% branch coverage on `advanceGate` (each legal step, past-`Approved`, terminal) and `rejectGate` (each active gate, terminal, empty-reason reject) plus the per-gate RBAC deny path (BR-205/BR-206/BR-207).
- `DemandRequestService.submitIntake`: required-field validation (`DEMAND_001`) and the `Submitted` default path (BR-201/BR-202).
- `ScoringModelService.configureScoring`: single-active-version activation/deactivation (BR-209).
- `PromotionService.promoteToProject`: `Approved`-only guard, exact `demand.promoted` payload, `status = Promoted` (BR-208).

## Integration Tests (Testcontainers / real Postgres)

- Full pipeline: submit → configure scoring model → score → advance through gates → approve → promote; verify `sourceDemandId` traceability and the `demand.promoted` payload contract.
- Required-field validation rejects on missing `title`/`sponsor`/`description` with `DEMAND_001`; nothing persisted (BR-201).
- Single active `ScoringModel`: activating a new version deactivates the prior one; only one `isActive = true` row remains (BR-209).
- Re-scoring upserts the single `ScoreCard` (`@@unique([demandRequestId])`) and single `CriterionScore` per `(scoreCardId, criterionId)` — no duplicate rows (D3-3).
- Stage-gate: advancing without the per-gate permission is denied and writes no `GateDecision`; reject from an active gate sets `Rejected` + reason and is terminal (BR-205/BR-207).
- Promote is safe to retry — project-execution dedupes by `sourceDemandId`; a second publish creates no second project (BR-208, resiliency-baseline).
- Record-scope filter returns only `submittedBy = ctx.userId` requests for non-Director callers; audit entries written on submit/score/advance/reject/promote (BR-210).
