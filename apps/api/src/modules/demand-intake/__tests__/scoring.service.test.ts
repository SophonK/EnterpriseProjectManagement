import { describe, it, expect, vi } from "vitest";
import "../../../../../../packages/shared/src/errors/demand-error-codes.js";
import { ScoringService } from "../services/scoring.service.js";
import type { AuthContext, DemandRequestDTO, ScoringModelDTO } from "@epm/shared";

const CTX: AuthContext = { userId: "user-1", roles: ["PORTFOLIO_MANAGER"], recordScopes: [] };

function makeDemandDTO(overrides: Partial<DemandRequestDTO> = {}): DemandRequestDTO {
  return {
    id: "demand-1",
    title: "New CRM",
    sponsor: "VP Sales",
    description: "Replace legacy CRM",
    expectedValue: null,
    status: "Screening",
    currentGate: "Screening",
    rejectionReason: null,
    submittedBy: "user-1",
    submittedAt: new Date().toISOString(),
    promotedProjectId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeModelDTO(): ScoringModelDTO {
  return {
    id: "model-1",
    name: "rubric",
    version: 1,
    isActive: true,
    createdBy: "director-1",
    criteria: [
      { id: "c-1", scoringModelId: "model-1", name: "Fit", weight: 3, maxScore: 100, goalId: null, sortOrder: 0 },
      { id: "c-2", scoringModelId: "model-1", name: "ROI", weight: 1, maxScore: 10, goalId: null, sortOrder: 1 },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function makeAudit() {
  return { record: vi.fn().mockResolvedValue(undefined) };
}

describe("ScoringService.scoreRequest — BR-203/BR-204 scoring guards", () => {
  it("computes weightedTotal via ScoreCalculator and upserts the single ScoreCard", async () => {
    const scoreCardRepo = {
      upsert: vi.fn().mockImplementation(async (data: { weightedTotal: number }) => ({
        id: "card-1",
        demandRequestId: "demand-1",
        scoringModelId: "model-1",
        weightedTotal: data.weightedTotal,
        scores: [],
        scoredBy: "user-1",
        scoredAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })),
      findByRequest: vi.fn(),
    };
    const modelRepo = { getActiveOrThrow: vi.fn().mockResolvedValue(makeModelDTO()) };
    const demandRepo = { findByIdScoped: vi.fn().mockResolvedValue(makeDemandDTO()), listForRanking: vi.fn() };
    const svc = new ScoringService(
      scoreCardRepo as never,
      modelRepo as never,
      demandRepo as never,
      makeAudit() as never,
    );

    // c-1: 100/100 = 1 (weight 3); c-2: 5/10 = 0.5 (weight 1) → (3*1 + 1*0.5)/4 * 100 = 87.5
    const card = await svc.scoreRequest(
      "demand-1",
      { scores: [{ criterionId: "c-1", rawScore: 100 }, { criterionId: "c-2", rawScore: 5 }] },
      CTX,
      "req-1",
    );

    expect(card.weightedTotal).toBeCloseTo(87.5, 6);
    expect(scoreCardRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ demandRequestId: "demand-1", scoringModelId: "model-1" }),
    );
  });

  it("rejects a rawScore above the criterion maxScore with DEMAND_004", async () => {
    const modelRepo = { getActiveOrThrow: vi.fn().mockResolvedValue(makeModelDTO()) };
    const demandRepo = { findByIdScoped: vi.fn().mockResolvedValue(makeDemandDTO()), listForRanking: vi.fn() };
    const svc = new ScoringService(
      { upsert: vi.fn(), findByRequest: vi.fn() } as never,
      modelRepo as never,
      demandRepo as never,
      makeAudit() as never,
    );

    await expect(
      svc.scoreRequest("demand-1", { scores: [{ criterionId: "c-2", rawScore: 50 }] }, CTX, "req-1"),
    ).rejects.toMatchObject({ code: "DEMAND_004" });
  });

  it("rejects scoring a non-scorable request (status Submitted) with DEMAND_007", async () => {
    const demandRepo = {
      findByIdScoped: vi.fn().mockResolvedValue(makeDemandDTO({ status: "Submitted" })),
      listForRanking: vi.fn(),
    };
    const svc = new ScoringService(
      { upsert: vi.fn(), findByRequest: vi.fn() } as never,
      { getActiveOrThrow: vi.fn() } as never,
      demandRepo as never,
      makeAudit() as never,
    );

    await expect(
      svc.scoreRequest("demand-1", { scores: [{ criterionId: "c-1", rawScore: 5 }] }, CTX, "req-1"),
    ).rejects.toMatchObject({ code: "DEMAND_007" });
  });

  it("rankRequests orders by weightedTotal desc with stable submittedAt tie-break", async () => {
    const demandRepo = {
      findByIdScoped: vi.fn(),
      listForRanking: vi.fn().mockResolvedValue([
        makeDemandDTO({ id: "a", submittedAt: "2026-01-01T00:00:00.000Z" }),
        makeDemandDTO({ id: "b", submittedAt: "2026-02-01T00:00:00.000Z" }),
        makeDemandDTO({ id: "c", submittedAt: "2026-01-15T00:00:00.000Z" }),
      ]),
    };
    const scoreCardRepo = {
      upsert: vi.fn(),
      findByRequest: vi.fn().mockImplementation(async (id: string) => {
        const totals: Record<string, number> = { a: 90, b: 90, c: 40 };
        return { weightedTotal: totals[id] };
      }),
    };
    const svc = new ScoringService(
      scoreCardRepo as never,
      { getActiveOrThrow: vi.fn() } as never,
      demandRepo as never,
      makeAudit() as never,
    );

    const ranked = await svc.rankRequests(CTX);

    // a and b tie at 90 → earlier submittedAt (a) first; c last
    expect(ranked.map((r) => r.demandRequestId)).toEqual(["a", "b", "c"]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3]);
  });
});
