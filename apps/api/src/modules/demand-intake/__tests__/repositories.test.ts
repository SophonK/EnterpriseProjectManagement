import { describe, it, expect, vi, beforeEach } from "vitest";
import "../../../../../../packages/shared/src/errors/demand-error-codes.js";
import { DemandRequestRepository } from "../repositories/demand-request.repository.js";
import { ScoringModelRepository } from "../repositories/scoring-model.repository.js";
import { ScoreCardRepository } from "../repositories/score-card.repository.js";
import { GateDecisionRepository } from "../repositories/gate-decision.repository.js";
import type { AuthContext } from "@epm/shared";

// ---------------------------------------------------------------------------
// Mock PrismaService
//
// `$transaction(fn)` invokes `fn` with the SAME mock object, so the model mocks
// referenced inside a repository transaction are the ones asserted on here.
// ---------------------------------------------------------------------------

function makePrisma() {
  const prisma = {
    demandRequest: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    scoringModel: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    scoringCriterion: {
      createMany: vi.fn(),
      findMany: vi.fn(),
    },
    scoreCard: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
    },
    criterionScore: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
      findMany: vi.fn(),
    },
    gateDecision: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma));
  return prisma;
}

const DIRECTOR_CTX: AuthContext = {
  userId: "user-dir",
  roles: ["EPMO_DIRECTOR"],
  recordScopes: [],
};

const PM_CTX: AuthContext = {
  userId: "user-pm",
  roles: ["PORTFOLIO_MANAGER"],
  recordScopes: [],
};

const P2025 = Object.assign(new Error("not found"), { code: "P2025" });

// ---------------------------------------------------------------------------
// DemandRequestRepository
// ---------------------------------------------------------------------------

function demandRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "dr-1",
    title: "New CRM",
    sponsor: "VP Sales",
    description: "Replace the legacy CRM",
    expectedValue: 100000,
    status: "Submitted",
    currentGate: "Submitted",
    rejectionReason: null,
    submittedBy: "user-pm",
    submittedAt: new Date("2026-07-08T10:00:00.000Z"),
    promotedProjectId: null,
    createdAt: new Date("2026-07-08T10:00:00.000Z"),
    updatedAt: new Date("2026-07-08T10:00:00.000Z"),
    ...overrides,
  };
}

describe("DemandRequestRepository", () => {
  let prisma: ReturnType<typeof makePrisma>;
  let repo: DemandRequestRepository;

  beforeEach(() => {
    prisma = makePrisma();
    repo = new DemandRequestRepository(prisma as never);
  });

  it("has schema = intake", () => {
    expect(repo.schema).toBe("intake");
  });

  it("create — persists submitter and returns DTO with ISO timestamps + numeric expectedValue", async () => {
    prisma.demandRequest.create.mockResolvedValue(demandRow());
    const dto = await repo.create({
      title: "New CRM",
      sponsor: "VP Sales",
      description: "Replace the legacy CRM",
      expectedValue: 100000,
      submittedBy: "user-pm",
    });
    expect(dto.submittedBy).toBe("user-pm");
    expect(dto.status).toBe("Submitted");
    expect(dto.expectedValue).toBe(100000);
    expect(dto.submittedAt).toBe("2026-07-08T10:00:00.000Z");
  });

  it("create — null expectedValue when omitted", async () => {
    prisma.demandRequest.create.mockResolvedValue(demandRow({ expectedValue: null }));
    const dto = await repo.create({
      title: "New CRM",
      sponsor: "VP Sales",
      description: "Replace the legacy CRM",
      submittedBy: "user-pm",
    });
    expect(dto.expectedValue).toBeNull();
  });

  it("findByIdScoped — EPMO Director: no submittedBy scope filter", async () => {
    prisma.demandRequest.findFirst.mockResolvedValue(demandRow());
    await repo.findByIdScoped("dr-1", DIRECTOR_CTX);
    const whereArg = prisma.demandRequest.findFirst.mock.calls[0][0].where;
    expect(whereArg).not.toHaveProperty("submittedBy");
    expect(whereArg.id).toBe("dr-1");
  });

  it("findByIdScoped — Portfolio Manager: scoped to submittedBy", async () => {
    prisma.demandRequest.findFirst.mockResolvedValue(demandRow());
    await repo.findByIdScoped("dr-1", PM_CTX);
    const whereArg = prisma.demandRequest.findFirst.mock.calls[0][0].where;
    expect(whereArg.submittedBy).toBe("user-pm");
  });

  it("findByIdScoped — throws DEMAND_002 when not found / out of scope", async () => {
    prisma.demandRequest.findFirst.mockResolvedValue(null);
    await expect(repo.findByIdScoped("dr-x", PM_CTX)).rejects.toMatchObject({
      code: "DEMAND_002",
    });
  });

  it("findManyScoped — Director sees all (no submittedBy filter), newest first", async () => {
    prisma.demandRequest.findMany.mockResolvedValue([demandRow()]);
    await repo.findManyScoped(DIRECTOR_CTX);
    const arg = prisma.demandRequest.findMany.mock.calls[0][0];
    expect(arg.where).not.toHaveProperty("submittedBy");
    expect(arg.orderBy).toEqual({ submittedAt: "desc" });
  });

  it("findManyScoped — Portfolio Manager scoped to own submissions", async () => {
    prisma.demandRequest.findMany.mockResolvedValue([]);
    await repo.findManyScoped(PM_CTX);
    const whereArg = prisma.demandRequest.findMany.mock.calls[0][0].where;
    expect(whereArg.submittedBy).toBe("user-pm");
  });

  it("updateStatusGate — sets status + currentGate, applies provided fields only", async () => {
    prisma.demandRequest.update.mockResolvedValue(
      demandRow({ status: "Screening", currentGate: "Screening" }),
    );
    const dto = await repo.updateStatusGate("dr-1", {
      status: "Screening",
      currentGate: "Screening",
    });
    expect(dto.status).toBe("Screening");
    const arg = prisma.demandRequest.update.mock.calls[0][0];
    expect(arg.where).toEqual({ id: "dr-1" });
    expect(arg.data.status).toBe("Screening");
    expect(arg.data.currentGate).toBe("Screening");
    expect(arg.data).not.toHaveProperty("rejectionReason");
    expect(arg.data).not.toHaveProperty("promotedProjectId");
  });

  it("updateStatusGate — reject sets rejectionReason without touching currentGate", async () => {
    prisma.demandRequest.update.mockResolvedValue(
      demandRow({ status: "Rejected", rejectionReason: "out of budget" }),
    );
    await repo.updateStatusGate("dr-1", { status: "Rejected", rejectionReason: "out of budget" });
    const arg = prisma.demandRequest.update.mock.calls[0][0];
    expect(arg.data.rejectionReason).toBe("out of budget");
    expect(arg.data).not.toHaveProperty("currentGate");
  });

  it("updateStatusGate — promote stamps promotedProjectId", async () => {
    prisma.demandRequest.update.mockResolvedValue(
      demandRow({ status: "Promoted", promotedProjectId: "proj-9" }),
    );
    const dto = await repo.updateStatusGate("dr-1", {
      status: "Promoted",
      promotedProjectId: "proj-9",
    });
    expect(dto.promotedProjectId).toBe("proj-9");
    const arg = prisma.demandRequest.update.mock.calls[0][0];
    expect(arg.data.promotedProjectId).toBe("proj-9");
  });

  it("updateStatusGate — maps P2025 to DEMAND_002", async () => {
    prisma.demandRequest.update.mockRejectedValue(P2025);
    await expect(
      repo.updateStatusGate("missing", { status: "Screening" }),
    ).rejects.toMatchObject({ code: "DEMAND_002" });
  });

  it("listForRanking — filters scorable/ranked statuses, submittedAt ascending", async () => {
    prisma.demandRequest.findMany.mockResolvedValue([demandRow({ status: "Evaluation" })]);
    await repo.listForRanking();
    const arg = prisma.demandRequest.findMany.mock.calls[0][0];
    expect(arg.where).toEqual({ status: { in: ["Screening", "Evaluation", "Approved"] } });
    expect(arg.orderBy).toEqual({ submittedAt: "asc" });
  });
});

// ---------------------------------------------------------------------------
// ScoringModelRepository
// ---------------------------------------------------------------------------

function modelRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "sm-1",
    name: "FY26 Model",
    version: 1,
    isActive: false,
    createdBy: "user-dir",
    createdAt: new Date("2026-07-08T10:00:00.000Z"),
    updatedAt: new Date("2026-07-08T10:00:00.000Z"),
    ...overrides,
  };
}

function criterionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "crit-1",
    scoringModelId: "sm-1",
    name: "Strategic fit",
    weight: 3,
    maxScore: 100,
    goalId: null,
    sortOrder: 0,
    ...overrides,
  };
}

describe("ScoringModelRepository", () => {
  let prisma: ReturnType<typeof makePrisma>;
  let repo: ScoringModelRepository;

  beforeEach(() => {
    prisma = makePrisma();
    repo = new ScoringModelRepository(prisma as never);
  });

  it("has schema = intake", () => {
    expect(repo.schema).toBe("intake");
  });

  it("createWithCriteria — derives version = max+1 and inserts criteria in a tx", async () => {
    prisma.scoringModel.findFirst.mockResolvedValue({ version: 4 });
    prisma.scoringModel.create.mockResolvedValue(modelRow({ version: 5 }));
    prisma.scoringCriterion.createMany.mockResolvedValue({ count: 1 });
    prisma.scoringCriterion.findMany.mockResolvedValue([criterionRow()]);

    const dto = await repo.createWithCriteria(
      { name: "FY26 Model", createdBy: "user-dir" },
      [{ name: "Strategic fit", weight: 3, maxScore: 100, goalId: null, sortOrder: 0 }],
    );

    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(prisma.scoringModel.create.mock.calls[0][0].data.version).toBe(5);
    expect(prisma.scoringCriterion.createMany).toHaveBeenCalledOnce();
    expect(dto.version).toBe(5);
    expect(dto.criteria).toHaveLength(1);
    expect(dto.criteria[0].weight).toBe(3);
  });

  it("createWithCriteria — first version defaults to 1 when no prior model", async () => {
    prisma.scoringModel.findFirst.mockResolvedValue(null);
    prisma.scoringModel.create.mockResolvedValue(modelRow({ version: 1 }));
    prisma.scoringCriterion.createMany.mockResolvedValue({ count: 1 });
    prisma.scoringCriterion.findMany.mockResolvedValue([criterionRow()]);

    await repo.createWithCriteria({ name: "FY26 Model", createdBy: "user-dir" }, [
      { name: "Strategic fit", weight: 3, maxScore: 100, sortOrder: 0 },
    ]);
    expect(prisma.scoringModel.create.mock.calls[0][0].data.version).toBe(1);
  });

  it("activate — sets target active AND deactivates all others (single active)", async () => {
    prisma.scoringModel.updateMany.mockResolvedValue({ count: 2 });
    prisma.scoringModel.update.mockResolvedValue(modelRow({ isActive: true }));
    prisma.scoringCriterion.findMany.mockResolvedValue([criterionRow()]);

    const dto = await repo.activate("sm-1");

    // Deactivate everyone else...
    expect(prisma.scoringModel.updateMany).toHaveBeenCalledWith({
      where: { id: { not: "sm-1" }, isActive: true },
      data: { isActive: false },
    });
    // ...and activate the target.
    expect(prisma.scoringModel.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "sm-1" },
        data: expect.objectContaining({ isActive: true }),
      }),
    );
    expect(dto.isActive).toBe(true);
  });

  it("activate — maps P2025 to DEMAND_003", async () => {
    prisma.scoringModel.updateMany.mockResolvedValue({ count: 0 });
    prisma.scoringModel.update.mockRejectedValue(P2025);
    await expect(repo.activate("missing")).rejects.toMatchObject({ code: "DEMAND_003" });
  });

  it("getActiveOrThrow — returns the active model with criteria", async () => {
    prisma.scoringModel.findFirst.mockResolvedValue({
      ...modelRow({ isActive: true }),
      criteria: [criterionRow()],
    });
    const dto = await repo.getActiveOrThrow();
    expect(prisma.scoringModel.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isActive: true } }),
    );
    expect(dto.isActive).toBe(true);
    expect(dto.criteria).toHaveLength(1);
  });

  it("getActiveOrThrow — throws DEMAND_003 when no active model", async () => {
    prisma.scoringModel.findFirst.mockResolvedValue(null);
    await expect(repo.getActiveOrThrow()).rejects.toMatchObject({ code: "DEMAND_003" });
  });

  it("listCriteria — filters by model, sortOrder ascending", async () => {
    prisma.scoringCriterion.findMany.mockResolvedValue([criterionRow()]);
    await repo.listCriteria("sm-1");
    expect(prisma.scoringCriterion.findMany).toHaveBeenCalledWith({
      where: { scoringModelId: "sm-1" },
      orderBy: { sortOrder: "asc" },
    });
  });
});

// ---------------------------------------------------------------------------
// ScoreCardRepository
// ---------------------------------------------------------------------------

function cardRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "sc-1",
    demandRequestId: "dr-1",
    scoringModelId: "sm-1",
    weightedTotal: 72.5,
    scoredBy: "user-pm",
    scoredAt: new Date("2026-07-08T10:00:00.000Z"),
    createdAt: new Date("2026-07-08T10:00:00.000Z"),
    updatedAt: new Date("2026-07-08T10:00:00.000Z"),
    ...overrides,
  };
}

describe("ScoreCardRepository", () => {
  let prisma: ReturnType<typeof makePrisma>;
  let repo: ScoreCardRepository;

  beforeEach(() => {
    prisma = makePrisma();
    repo = new ScoreCardRepository(prisma as never);
  });

  it("has schema = intake", () => {
    expect(repo.schema).toBe("intake");
  });

  it("upsert — upserts card on demandRequestId unique and replaces criterion scores in a tx", async () => {
    prisma.scoreCard.upsert.mockResolvedValue(cardRow());
    prisma.criterionScore.deleteMany.mockResolvedValue({ count: 2 });
    prisma.criterionScore.createMany.mockResolvedValue({ count: 2 });
    prisma.criterionScore.findMany.mockResolvedValue([
      { criterionId: "crit-1", rawScore: 80 },
      { criterionId: "crit-2", rawScore: 60 },
    ]);

    const dto = await repo.upsert({
      demandRequestId: "dr-1",
      scoringModelId: "sm-1",
      weightedTotal: 72.5,
      scoredBy: "user-pm",
      scores: [
        { criterionId: "crit-1", rawScore: 80 },
        { criterionId: "crit-2", rawScore: 60 },
      ],
    });

    expect(prisma.$transaction).toHaveBeenCalledOnce();
    // Upsert keyed on the demandRequestId unique.
    expect(prisma.scoreCard.upsert.mock.calls[0][0].where).toEqual({
      demandRequestId: "dr-1",
    });
    // Replace = delete existing then createMany new.
    expect(prisma.criterionScore.deleteMany).toHaveBeenCalledWith({
      where: { scoreCardId: "sc-1" },
    });
    expect(prisma.criterionScore.createMany).toHaveBeenCalledWith({
      data: [
        { scoreCardId: "sc-1", criterionId: "crit-1", rawScore: 80 },
        { scoreCardId: "sc-1", criterionId: "crit-2", rawScore: 60 },
      ],
    });
    expect(dto.weightedTotal).toBe(72.5);
    expect(dto.scores).toHaveLength(2);
  });

  it("upsert — deletes existing scores even when the new set is empty", async () => {
    prisma.scoreCard.upsert.mockResolvedValue(cardRow());
    prisma.criterionScore.deleteMany.mockResolvedValue({ count: 1 });
    prisma.criterionScore.findMany.mockResolvedValue([]);

    await repo.upsert({
      demandRequestId: "dr-1",
      scoringModelId: "sm-1",
      weightedTotal: 0,
      scoredBy: "user-pm",
      scores: [],
    });
    expect(prisma.criterionScore.deleteMany).toHaveBeenCalledOnce();
    expect(prisma.criterionScore.createMany).not.toHaveBeenCalled();
  });

  it("findByRequest — returns null when no card", async () => {
    prisma.scoreCard.findUnique.mockResolvedValue(null);
    expect(await repo.findByRequest("dr-x")).toBeNull();
  });

  it("findByRequest — maps the card and its scores", async () => {
    prisma.scoreCard.findUnique.mockResolvedValue({
      ...cardRow(),
      scores: [{ criterionId: "crit-1", rawScore: 90 }],
    });
    const dto = await repo.findByRequest("dr-1");
    expect(prisma.scoreCard.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { demandRequestId: "dr-1" },
      }),
    );
    expect(dto?.scores[0]).toEqual({ criterionId: "crit-1", rawScore: 90 });
  });
});

// ---------------------------------------------------------------------------
// GateDecisionRepository
// ---------------------------------------------------------------------------

function gateRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "gd-1",
    demandRequestId: "dr-1",
    fromGate: "Submitted",
    toGate: "Screening",
    decision: "Advanced",
    reason: null,
    decidedBy: "user-pm",
    decidedAt: new Date("2026-07-08T10:00:00.000Z"),
    ...overrides,
  };
}

describe("GateDecisionRepository", () => {
  let prisma: ReturnType<typeof makePrisma>;
  let repo: GateDecisionRepository;

  beforeEach(() => {
    prisma = makePrisma();
    repo = new GateDecisionRepository(prisma as never);
  });

  it("has schema = intake", () => {
    expect(repo.schema).toBe("intake");
  });

  it("append — advance decision persisted with fromGate/toGate", async () => {
    prisma.gateDecision.create.mockResolvedValue(gateRow());
    const dto = await repo.append({
      demandRequestId: "dr-1",
      fromGate: "Submitted",
      toGate: "Screening",
      decision: "Advanced",
      decidedBy: "user-pm",
    });
    expect(dto.decision).toBe("Advanced");
    expect(dto.toGate).toBe("Screening");
    const arg = prisma.gateDecision.create.mock.calls[0][0].data;
    expect(arg.reason).toBeNull();
  });

  it("append — reject decision has null toGate and a reason", async () => {
    prisma.gateDecision.create.mockResolvedValue(
      gateRow({ toGate: null, decision: "Rejected", reason: "duplicate" }),
    );
    const dto = await repo.append({
      demandRequestId: "dr-1",
      fromGate: "Screening",
      toGate: null,
      decision: "Rejected",
      reason: "duplicate",
      decidedBy: "user-pm",
    });
    expect(dto.toGate).toBeNull();
    expect(dto.decision).toBe("Rejected");
    expect(dto.reason).toBe("duplicate");
  });

  it("listByRequest — filters by request, decidedAt ascending", async () => {
    prisma.gateDecision.findMany.mockResolvedValue([gateRow()]);
    await repo.listByRequest("dr-1");
    expect(prisma.gateDecision.findMany).toHaveBeenCalledWith({
      where: { demandRequestId: "dr-1" },
      orderBy: { decidedAt: "asc" },
    });
  });
});
