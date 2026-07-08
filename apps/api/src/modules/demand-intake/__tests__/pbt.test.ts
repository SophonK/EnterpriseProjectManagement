import { describe, it, expect, vi } from "vitest";
import fc from "fast-check";
import "../../../../../../packages/shared/src/errors/demand-error-codes.js";
import { ScoreCalculator } from "../services/score-calculator.js";
import { StageGateService } from "../services/stage-gate.service.js";
import type { AuthContext, DemandStatus, IntakeGate } from "@epm/shared";

// ---------------------------------------------------------------------------
// Shared mocks / helpers
// ---------------------------------------------------------------------------

function makeEventBus() {
  return { publish: vi.fn().mockResolvedValue(undefined), subscribe: vi.fn() };
}

function makeAudit() {
  return { record: vi.fn().mockResolvedValue(undefined) };
}

// ---------------------------------------------------------------------------
// P1 — computeWeightedTotal bounded & correct (numRuns 100)
// ---------------------------------------------------------------------------

const criterion = fc.record({
  id: fc.uuid(),
  weight: fc.integer({ min: 0, max: 100 }), // relative weight, 0 allowed
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
    scores: criteria.map((c, i) => ({ criterionId: c.id, rawScore: raws[i] as number })),
  }));

describe("PBT P1 — computeWeightedTotal bounded & correct (BR-203)", () => {
  it("∈ [0,100], finite, and equals the independent hand computation", async () => {
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
            ? 0 // Σweight = 0 guard
            : (criteria.reduce(
                (s, c) => s + c.weight * ((byId.get(c.id) ?? 0) / c.maxScore),
                0,
              ) /
                totalWeight) *
              100;

        expect(t).toBeCloseTo(expected, 6);
      }),
      { numRuns: 100 },
    );
  });

  it("Σweight = 0 (all-zero weights or empty) is a defined 0, never NaN", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(
          fc.record({ id: fc.uuid(), maxScore: fc.integer({ min: 1, max: 100 }) }),
          { minLength: 0, maxLength: 10, selector: (c) => c.id },
        ),
        async (specs) => {
          const criteria = specs.map((c) => ({ id: c.id, weight: 0, maxScore: c.maxScore }));
          const scores = specs.map((c) => ({ criterionId: c.id, rawScore: c.maxScore }));
          const t = ScoreCalculator.computeWeightedTotal(criteria, scores);
          expect(Number.isFinite(t)).toBe(true);
          expect(t).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// P2 — rank() deterministic total order (numRuns 100)
// ---------------------------------------------------------------------------

const rankable = fc.record({
  demandRequestId: fc.uuid(),
  weightedTotal: fc.integer({ min: 0, max: 100 }), // ties are common by design
  submittedAt: fc
    .date({ min: new Date("2020-01-01"), max: new Date("2026-01-01") })
    .map((d) => d.toISOString()),
});
const rankables = fc.uniqueArray(rankable, {
  minLength: 0,
  maxLength: 40,
  selector: (r) => r.demandRequestId,
});

describe("PBT P2 — rank() deterministic total order (BR-204)", () => {
  it("permutation-invariant, monotone, and stable tie-break by submittedAt", async () => {
    await fc.assert(
      fc.asyncProperty(rankables, fc.func(fc.nat()), async (input, shuffleKey) => {
        const shuffled = [...input].sort(
          (a, b) => shuffleKey(a.demandRequestId) - shuffleKey(b.demandRequestId),
        );

        const rankedA = ScoreCalculator.rank(input);
        const rankedB = ScoreCalculator.rank(shuffled);

        // permutation-invariant: same id -> same rank regardless of input order
        const mapA = new Map(rankedA.map((r) => [r.demandRequestId, r.rank]));
        const mapB = new Map(rankedB.map((r) => [r.demandRequestId, r.rank]));
        expect(mapB.size).toBe(mapA.size);
        for (const [id, rank] of mapA) expect(mapB.get(id)).toBe(rank);

        // ranks are the exact 1..N sequence (a total order, distinct positions)
        expect(rankedA.map((r) => r.rank)).toEqual(rankedA.map((_, i) => i + 1));

        // total order: sort key monotonically non-improving pairwise (desc, then asc tie-break)
        for (let i = 1; i < rankedA.length; i++) {
          const prev = rankedA[i - 1]!;
          const cur = rankedA[i]!;
          const ordered =
            prev.weightedTotal > cur.weightedTotal ||
            (prev.weightedTotal === cur.weightedTotal && prev.submittedAt <= cur.submittedAt);
          expect(ordered).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// P3 — stage-gate transition validity (numRuns 100)
// ---------------------------------------------------------------------------

const GATES = ["Submitted", "Screening", "Evaluation", "Approved"] as const;
const startState = fc.constantFrom<DemandStatus>(...GATES, "Rejected", "Promoted");
const commandArb = fc.constantFrom("advance" as const, "reject" as const);
const script = fc.array(commandArb, { minLength: 1, maxLength: 8 });

interface MutableRequest {
  id: string;
  status: DemandStatus;
  currentGate: IntakeGate;
  rejectionReason: string | null;
}

// Demand repo mock backed by a single mutable request; updateStatusGate mutates it in place
// (mirrors the real persistence so "no mutation on illegal command" is observable).
function makeDemandRepo(request: MutableRequest) {
  return {
    findByIdScoped: vi.fn().mockImplementation(async () => ({
      ...request,
      title: "d",
      sponsor: "s",
      description: "x",
      expectedValue: null,
      submittedBy: "user-1",
      submittedAt: new Date().toISOString(),
      promotedProjectId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })),
    updateStatusGate: vi
      .fn()
      .mockImplementation(
        async (
          _id: string,
          data: {
            status: DemandStatus;
            currentGate?: IntakeGate;
            rejectionReason?: string | null;
          },
        ) => {
          request.status = data.status;
          if (data.currentGate !== undefined) request.currentGate = data.currentGate;
          if (data.rejectionReason !== undefined) request.rejectionReason = data.rejectionReason;
          return { ...request };
        },
      ),
  };
}

function makeGateDecisionRepo() {
  return { append: vi.fn().mockResolvedValue(undefined) };
}

// Full per-gate permission so RBAC never masks a transition-validity failure.
const permitAll = { permitted: () => true };

describe("PBT P3 — stage-gate transition validity (BR-206/BR-207)", () => {
  it("only legal forward step / active-gate reject succeeds; terminals frozen; illegal never mutates", async () => {
    await fc.assert(
      fc.asyncProperty(startState, script, async (start, cmds) => {
        const request: MutableRequest = {
          id: "d-1",
          status: start,
          // currentGate tracks a valid gate; for terminals it is irrelevant (guarded first)
          currentGate: (GATES.includes(start as IntakeGate) ? start : "Submitted") as IntakeGate,
          rejectionReason: null,
        };
        const ctx: AuthContext = { userId: "user-1", roles: ["PORTFOLIO_MANAGER"], recordScopes: [] };
        const svc = new StageGateService(
          makeDemandRepo(request) as never,
          makeGateDecisionRepo() as never,
          permitAll as never,
          makeEventBus() as never,
          makeAudit() as never,
        );

        for (const cmd of cmds) {
          const before = { status: request.status, currentGate: request.currentGate };
          const terminal = before.status === "Rejected" || before.status === "Promoted";
          const gateIdx = GATES.indexOf(before.currentGate as (typeof GATES)[number]);
          const legalAdvance =
            cmd === "advance" && !terminal && gateIdx >= 0 && gateIdx < GATES.length - 1;
          const legalReject =
            cmd === "reject" &&
            !terminal &&
            (before.status === "Submitted" ||
              before.status === "Screening" ||
              before.status === "Evaluation");

          if (legalAdvance) {
            await svc.advanceGate(request.id, ctx, "req-1");
            const next = GATES[gateIdx + 1]!;
            expect(request.currentGate).toBe(next); // exactly one step forward
            expect(request.status).toBe(next);
          } else if (legalReject) {
            await svc.rejectGate(request.id, { reason: "no budget" }, ctx, "req-1");
            expect(request.status).toBe("Rejected"); // terminal, reason recorded
            expect(request.rejectionReason).toBe("no budget");
          } else {
            // illegal: must throw DEMAND_* and NOT mutate
            await expect(
              cmd === "advance"
                ? svc.advanceGate(request.id, ctx, "req-1")
                : svc.rejectGate(request.id, { reason: "x" }, ctx, "req-1"),
            ).rejects.toMatchObject({ code: expect.stringMatching(/^DEMAND_/) });
            expect(request.status).toBe(before.status); // unchanged
            expect(request.currentGate).toBe(before.currentGate);
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});
