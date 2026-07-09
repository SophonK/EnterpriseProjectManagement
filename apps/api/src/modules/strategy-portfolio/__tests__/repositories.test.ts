import { describe, it, expect, vi, beforeEach } from "vitest";
import "../../../../../../packages/shared/src/errors/strategy-error-codes.js";
import { StrategicGoalRepository } from "../repositories/strategic-goal.repository.js";
import { PortfolioRepository } from "../repositories/portfolio.repository.js";
import { ProgramRepository } from "../repositories/program.repository.js";
import { GoalLinkRepository } from "../repositories/goal-link.repository.js";
import { ProjectAlignmentViewRepository } from "../repositories/project-alignment-view.repository.js";
import type { AuthContext } from "@epm/shared";

// ---------------------------------------------------------------------------
// Mock PrismaService
// ---------------------------------------------------------------------------

function makePrisma() {
  return {
    strategicGoal: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    portfolio: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    portfolioGoal: {
      createMany: vi.fn(),
      findMany: vi.fn(),
    },
    program: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    goalLink: {
      upsert: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    projectAlignmentView: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      findMany: vi.fn(),
      groupBy: vi.fn(),
    },
    // ProjectAlignmentViewRepository.upsertByProjectId uses $transaction.
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        projectAlignmentView: {
          findUnique: vi.fn().mockResolvedValue(null),
          upsert: vi.fn(),
        },
      }),
    ),
  };
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
const P2002 = Object.assign(new Error("unique violation"), { code: "P2002" });

// ---------------------------------------------------------------------------
// StrategicGoalRepository
// ---------------------------------------------------------------------------

function goalRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "goal-1",
    title: "Grow ARR",
    description: "Increase annual recurring revenue",
    measure: "ARR +20% YoY",
    status: "Active",
    createdBy: "user-dir",
    createdAt: new Date("2026-07-08T10:00:00.000Z"),
    updatedAt: new Date("2026-07-08T10:00:00.000Z"),
    ...overrides,
  };
}

describe("StrategicGoalRepository", () => {
  let prisma: ReturnType<typeof makePrisma>;
  let repo: StrategicGoalRepository;

  beforeEach(() => {
    prisma = makePrisma();
    repo = new StrategicGoalRepository(prisma as never);
  });

  it("has schema = strategy", () => {
    expect(repo.schema).toBe("strategy");
  });

  it("create — returns DTO with ISO timestamps and Active status", async () => {
    prisma.strategicGoal.create.mockResolvedValue(goalRow());
    const dto = await repo.create({
      title: "Grow ARR",
      description: "Increase annual recurring revenue",
      measure: "ARR +20% YoY",
      createdBy: "user-dir",
    });
    expect(dto.status).toBe("Active");
    expect(dto.createdAt).toBe("2026-07-08T10:00:00.000Z");
  });

  it("findByIdOrThrow — throws STRATEGY_002 when missing", async () => {
    prisma.strategicGoal.findUnique.mockResolvedValue(null);
    await expect(repo.findByIdOrThrow("missing")).rejects.toMatchObject({ code: "STRATEGY_002" });
  });

  it("listActive — filters status=Active newest first", async () => {
    prisma.strategicGoal.findMany.mockResolvedValue([goalRow()]);
    await repo.listActive();
    expect(prisma.strategicGoal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: "Active" },
        orderBy: { createdAt: "desc" },
      }),
    );
  });

  it("archive — sets status=Archived", async () => {
    prisma.strategicGoal.update.mockResolvedValue(goalRow({ status: "Archived" }));
    await repo.archive("goal-1");
    expect(prisma.strategicGoal.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "goal-1" },
        data: expect.objectContaining({ status: "Archived" }),
      }),
    );
  });

  it("archive — maps P2025 to STRATEGY_002", async () => {
    prisma.strategicGoal.update.mockRejectedValue(P2025);
    await expect(repo.archive("missing")).rejects.toMatchObject({ code: "STRATEGY_002" });
  });

  it("existsById — true when row present, false otherwise", async () => {
    prisma.strategicGoal.findUnique.mockResolvedValueOnce({ id: "goal-1" });
    expect(await repo.existsById("goal-1")).toBe(true);
    prisma.strategicGoal.findUnique.mockResolvedValueOnce(null);
    expect(await repo.existsById("missing")).toBe(false);
  });

  it("existsActiveById — queries with status=Active; true when active, false when archived/missing", async () => {
    prisma.strategicGoal.findFirst.mockResolvedValueOnce({ id: "goal-1" });
    expect(await repo.existsActiveById("goal-1")).toBe(true);
    expect(prisma.strategicGoal.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "goal-1", status: "Active" } }),
    );

    // An Archived goal (or a missing one) yields no Active row → false.
    prisma.strategicGoal.findFirst.mockResolvedValueOnce(null);
    expect(await repo.existsActiveById("archived-goal")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// PortfolioRepository
// ---------------------------------------------------------------------------

function portfolioRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "port-1",
    name: "Digital Transformation",
    description: null,
    ownerId: "user-pm",
    status: "Active",
    createdAt: new Date("2026-07-08T10:00:00.000Z"),
    updatedAt: new Date("2026-07-08T10:00:00.000Z"),
    portfolioGoals: [],
    ...overrides,
  };
}

describe("PortfolioRepository", () => {
  let prisma: ReturnType<typeof makePrisma>;
  let repo: PortfolioRepository;

  beforeEach(() => {
    prisma = makePrisma();
    repo = new PortfolioRepository(prisma as never);
  });

  it("has schema = strategy", () => {
    expect(repo.schema).toBe("strategy");
  });

  it("create — owner set, empty goalIds", async () => {
    prisma.portfolio.create.mockResolvedValue(portfolioRow());
    const dto = await repo.create({ name: "Digital Transformation", ownerId: "user-pm" });
    expect(dto.ownerId).toBe("user-pm");
    expect(dto.goalIds).toEqual([]);
    const createArg = prisma.portfolio.create.mock.calls[0][0].data;
    expect(createArg.ownerId).toBe("user-pm");
  });

  it("findMany — EPMO Director: no ownerId scope filter", async () => {
    prisma.portfolio.findMany.mockResolvedValue([portfolioRow()]);
    await repo.findMany(DIRECTOR_CTX);
    const whereArg = prisma.portfolio.findMany.mock.calls[0][0].where;
    expect(whereArg).not.toHaveProperty("ownerId");
    expect(whereArg.status).toBe("Active");
  });

  it("findMany — Portfolio Manager: scoped to ownerId", async () => {
    prisma.portfolio.findMany.mockResolvedValue([]);
    await repo.findMany(PM_CTX);
    const whereArg = prisma.portfolio.findMany.mock.calls[0][0].where;
    expect(whereArg.ownerId).toBe("user-pm");
  });

  it("findMany — maps associated goalIds from the join", async () => {
    prisma.portfolio.findMany.mockResolvedValue([
      portfolioRow({ portfolioGoals: [{ goalId: "goal-1" }, { goalId: "goal-2" }] }),
    ]);
    const dtos = await repo.findMany(PM_CTX);
    expect(dtos[0].goalIds).toEqual(["goal-1", "goal-2"]);
  });

  it("findByIdScoped — throws STRATEGY_003 when not found / out of scope", async () => {
    prisma.portfolio.findFirst.mockResolvedValue(null);
    await expect(repo.findByIdScoped("port-x", PM_CTX)).rejects.toMatchObject({
      code: "STRATEGY_003",
    });
    // Non-Director query must carry the ownerId scope.
    const whereArg = prisma.portfolio.findFirst.mock.calls[0][0].where;
    expect(whereArg.ownerId).toBe("user-pm");
  });

  it("associateGoals — idempotent createMany with skipDuplicates", async () => {
    prisma.portfolioGoal.createMany.mockResolvedValue({ count: 2 });
    await repo.associateGoals("port-1", ["goal-1", "goal-2"]);
    expect(prisma.portfolioGoal.createMany).toHaveBeenCalledWith({
      data: [
        { portfolioId: "port-1", goalId: "goal-1" },
        { portfolioId: "port-1", goalId: "goal-2" },
      ],
      skipDuplicates: true,
    });
  });

  it("associateGoals — no-op on empty goalIds (no DB call)", async () => {
    await repo.associateGoals("port-1", []);
    expect(prisma.portfolioGoal.createMany).not.toHaveBeenCalled();
  });

  it("listGoalIds — returns the associated goal ids", async () => {
    prisma.portfolioGoal.findMany.mockResolvedValue([{ goalId: "goal-1" }, { goalId: "goal-9" }]);
    expect(await repo.listGoalIds("port-1")).toEqual(["goal-1", "goal-9"]);
  });
});

// ---------------------------------------------------------------------------
// ProgramRepository
// ---------------------------------------------------------------------------

function programRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "prog-1",
    portfolioId: "port-1",
    name: "Platform Modernization",
    description: null,
    status: "Active",
    createdAt: new Date("2026-07-08T10:00:00.000Z"),
    updatedAt: new Date("2026-07-08T10:00:00.000Z"),
    ...overrides,
  };
}

describe("ProgramRepository", () => {
  let prisma: ReturnType<typeof makePrisma>;
  let repo: ProgramRepository;

  beforeEach(() => {
    prisma = makePrisma();
    repo = new ProgramRepository(prisma as never);
  });

  it("has schema = strategy", () => {
    expect(repo.schema).toBe("strategy");
  });

  it("create — under a portfolio", async () => {
    prisma.program.create.mockResolvedValue(programRow());
    const dto = await repo.create({ portfolioId: "port-1", name: "Platform Modernization" });
    expect(dto.portfolioId).toBe("port-1");
  });

  it("existsById — true / false", async () => {
    prisma.program.findUnique.mockResolvedValueOnce({ id: "prog-1" });
    expect(await repo.existsById("prog-1")).toBe(true);
    prisma.program.findUnique.mockResolvedValueOnce(null);
    expect(await repo.existsById("missing")).toBe(false);
  });

  it("findByIdOrThrow — throws STRATEGY_004 when missing", async () => {
    prisma.program.findUnique.mockResolvedValue(null);
    await expect(repo.findByIdOrThrow("missing")).rejects.toMatchObject({ code: "STRATEGY_004" });
  });

  it("listByPortfolio — filters by portfolioId", async () => {
    prisma.program.findMany.mockResolvedValue([programRow()]);
    await repo.listByPortfolio("port-1");
    expect(prisma.program.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { portfolioId: "port-1" } }),
    );
  });
});

// ---------------------------------------------------------------------------
// GoalLinkRepository
// ---------------------------------------------------------------------------

function goalLinkRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "link-1",
    goalId: "goal-1",
    projectId: "proj-1",
    linkedBy: "user-pm",
    createdAt: new Date("2026-07-08T10:00:00.000Z"),
    ...overrides,
  };
}

describe("GoalLinkRepository", () => {
  let prisma: ReturnType<typeof makePrisma>;
  let repo: GoalLinkRepository;

  beforeEach(() => {
    prisma = makePrisma();
    repo = new GoalLinkRepository(prisma as never);
  });

  it("has schema = strategy", () => {
    expect(repo.schema).toBe("strategy");
  });

  it("upsertLink — idempotent upsert on the compound unique key", async () => {
    prisma.goalLink.upsert.mockResolvedValue(goalLinkRow());
    const dto = await repo.upsertLink("goal-1", "proj-1", "user-pm");
    expect(dto.id).toBe("link-1");
    expect(prisma.goalLink.upsert).toHaveBeenCalledWith({
      where: { uq_goal_link: { goalId: "goal-1", projectId: "proj-1" } },
      create: { goalId: "goal-1", projectId: "proj-1", linkedBy: "user-pm" },
      update: {},
    });
  });

  it("upsertLink — a concurrent P2002 unique violation is idempotent (reads the winning row back)", async () => {
    // Simulate losing the create race: upsert throws P2002, the pair already exists.
    prisma.goalLink.upsert.mockRejectedValue(P2002);
    prisma.goalLink.findUnique.mockResolvedValue(goalLinkRow());
    const dto = await repo.upsertLink("goal-1", "proj-1", "user-pm");
    expect(dto.id).toBe("link-1"); // success, not a 500
    expect(prisma.goalLink.findUnique).toHaveBeenCalledWith({
      where: { uq_goal_link: { goalId: "goal-1", projectId: "proj-1" } },
    });
  });

  it("upsertLink — rethrows non-P2002 errors", async () => {
    const boom = Object.assign(new Error("db down"), { code: "P1001" });
    prisma.goalLink.upsert.mockRejectedValue(boom);
    await expect(repo.upsertLink("goal-1", "proj-1", "user-pm")).rejects.toBe(boom);
    expect(prisma.goalLink.findUnique).not.toHaveBeenCalled();
  });

  it("delete — returns the deleted link's projectId (for realignment)", async () => {
    prisma.goalLink.delete.mockResolvedValue({ projectId: "proj-1" });
    expect(await repo.delete("link-1")).toBe("proj-1");
    expect(prisma.goalLink.delete).toHaveBeenCalledWith({
      where: { id: "link-1" },
      select: { projectId: true },
    });
  });

  it("delete — maps P2025 to STRATEGY_006", async () => {
    prisma.goalLink.delete.mockRejectedValue(P2025);
    await expect(repo.delete("missing")).rejects.toMatchObject({ code: "STRATEGY_006" });
  });

  it("countByProject — passes projectId filter", async () => {
    prisma.goalLink.count.mockResolvedValue(3);
    expect(await repo.countByProject("proj-1")).toBe(3);
    expect(prisma.goalLink.count).toHaveBeenCalledWith({ where: { projectId: "proj-1" } });
  });

  it("findGoalIdsByProject — returns goal ids", async () => {
    prisma.goalLink.findMany.mockResolvedValue([{ goalId: "goal-1" }, { goalId: "goal-2" }]);
    expect(await repo.findGoalIdsByProject("proj-1")).toEqual(["goal-1", "goal-2"]);
  });
});

// ---------------------------------------------------------------------------
// ProjectAlignmentViewRepository
// ---------------------------------------------------------------------------

describe("ProjectAlignmentViewRepository", () => {
  let prisma: ReturnType<typeof makePrisma>;
  let repo: ProjectAlignmentViewRepository;

  beforeEach(() => {
    prisma = makePrisma();
    repo = new ProjectAlignmentViewRepository(prisma as never);
  });

  it("has schema = strategy", () => {
    expect(repo.schema).toBe("strategy");
  });

  it("upsertByProjectId — applies (upsert called) when no existing row", async () => {
    const txUpsert = vi.fn().mockResolvedValue(undefined);
    prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        projectAlignmentView: {
          findUnique: vi.fn().mockResolvedValue(null),
          upsert: txUpsert,
        },
      }),
    );
    const applied = await repo.upsertByProjectId(
      { projectId: "proj-1", name: "P1", status: "Active", plannedBudget: 100 },
      new Date("2026-07-08T10:00:00.000Z"),
    );
    expect(applied).toBe(true);
    expect(txUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { projectId: "proj-1" } }),
    );
  });

  it("upsertByProjectId — applies when incoming event is newer", async () => {
    const txUpsert = vi.fn().mockResolvedValue(undefined);
    prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        projectAlignmentView: {
          findUnique: vi.fn().mockResolvedValue({ lastEventAt: new Date("2026-07-01T00:00:00.000Z") }),
          upsert: txUpsert,
        },
      }),
    );
    const applied = await repo.upsertByProjectId(
      { projectId: "proj-1", name: "P1", status: "Completed" },
      new Date("2026-07-08T00:00:00.000Z"),
    );
    expect(applied).toBe(true);
    expect(txUpsert).toHaveBeenCalledOnce();
  });

  it("upsertByProjectId — skips (no upsert) when incoming event is stale (lastEventAt guard)", async () => {
    const txUpsert = vi.fn();
    prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        projectAlignmentView: {
          findUnique: vi.fn().mockResolvedValue({ lastEventAt: new Date("2026-07-08T00:00:00.000Z") }),
          upsert: txUpsert,
        },
      }),
    );
    const applied = await repo.upsertByProjectId(
      { projectId: "proj-1", name: "P1", status: "Open" },
      new Date("2026-07-01T00:00:00.000Z"), // older → stale
    );
    expect(applied).toBe(false);
    expect(txUpsert).not.toHaveBeenCalled();
  });

  it("upsertByProjectId — skips (no upsert) when incoming ts EQUALS stored (not-newer guard)", async () => {
    // Invariant #3: an event that is NOT NEWER than stored must be ignored, so an equal
    // timestamp is a stale no-op (guards against re-processed duplicates).
    const txUpsert = vi.fn();
    const ts = new Date("2026-07-08T00:00:00.000Z");
    prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        projectAlignmentView: {
          findUnique: vi.fn().mockResolvedValue({ lastEventAt: ts }),
          upsert: txUpsert,
        },
      }),
    );
    const applied = await repo.upsertByProjectId(
      { projectId: "proj-1", name: "P1", status: "Completed" },
      new Date(ts), // equal → not newer → ignored
    );
    expect(applied).toBe(false);
    expect(txUpsert).not.toHaveBeenCalled();
  });

  it("setAligned — updateMany by projectId", async () => {
    prisma.projectAlignmentView.updateMany.mockResolvedValue({ count: 1 });
    await repo.setAligned("proj-1", true);
    expect(prisma.projectAlignmentView.updateMany).toHaveBeenCalledWith({
      where: { projectId: "proj-1" },
      data: { aligned: true },
    });
  });

  it("listUnaligned — filters Active+unaligned and enriches owner+portfolio", async () => {
    prisma.projectAlignmentView.findMany.mockResolvedValue([
      {
        projectId: "proj-1",
        name: "P1",
        status: "Active",
        plannedBudget: null,
        portfolioId: "port-1",
        programId: null,
        aligned: false,
        lastEventAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    prisma.portfolio.findMany.mockResolvedValue([
      { id: "port-1", name: "Digital", ownerId: "user-pm" },
    ]);
    const rows = await repo.listUnaligned();
    expect(prisma.projectAlignmentView.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: "Active", aligned: false } }),
    );
    expect(rows[0]).toEqual({
      projectId: "proj-1",
      name: "P1",
      portfolioId: "port-1",
      portfolioName: "Digital",
      ownerId: "user-pm",
    });
  });

  it("aggregateByPortfolio — Director: groups all portfolios (null→0), no owner scope", async () => {
    prisma.projectAlignmentView.groupBy.mockResolvedValue([
      { portfolioId: "port-1", _count: { projectId: 2 }, _sum: { plannedBudget: 300 } },
      { portfolioId: "port-2", _count: { projectId: 1 }, _sum: { plannedBudget: null } },
    ]);
    const groups = await repo.aggregateByPortfolio(DIRECTOR_CTX);
    expect(prisma.projectAlignmentView.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ["portfolioId"],
        where: { portfolioId: { not: null } },
        _sum: { plannedBudget: true },
      }),
    );
    // Director bypasses record-scope: no owned-portfolio resolution.
    expect(prisma.portfolio.findMany).not.toHaveBeenCalled();
    expect(groups).toEqual([
      { groupId: "port-1", projectCount: 2, totalPlannedBudget: 300 },
      { groupId: "port-2", projectCount: 1, totalPlannedBudget: 0 },
    ]);
  });

  it("aggregateByPortfolio — non-Director: record-scoped to owned portfolios (excludes others')", async () => {
    // PM owns only port-a; PM B's port-b must never enter the aggregation.
    prisma.portfolio.findMany.mockResolvedValue([{ id: "port-a" }]);
    prisma.projectAlignmentView.groupBy.mockResolvedValue([
      { portfolioId: "port-a", _count: { projectId: 2 }, _sum: { plannedBudget: 300 } },
    ]);
    const groups = await repo.aggregateByPortfolio(PM_CTX);

    // Owned-portfolio resolution is scoped to the caller.
    expect(prisma.portfolio.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { ownerId: "user-pm" }, select: { id: true } }),
    );
    // The projection query is restricted to owned portfolio ids only.
    const groupByWhere = prisma.projectAlignmentView.groupBy.mock.calls[0][0].where;
    expect(groupByWhere).toEqual({ portfolioId: { in: ["port-a"] } });
    expect(groups).toEqual([{ groupId: "port-a", projectCount: 2, totalPlannedBudget: 300 }]);
    // Data-disclosure guard: PM B's portfolio is absent.
    expect(groups.map((g) => g.groupId)).not.toContain("port-b");
  });

  it("aggregateByPortfolio — non-Director owning nothing: scopes to an empty id set", async () => {
    prisma.portfolio.findMany.mockResolvedValue([]);
    prisma.projectAlignmentView.groupBy.mockResolvedValue([]);
    const groups = await repo.aggregateByPortfolio(PM_CTX);
    const groupByWhere = prisma.projectAlignmentView.groupBy.mock.calls[0][0].where;
    expect(groupByWhere).toEqual({ portfolioId: { in: [] } });
    expect(groups).toEqual([]);
  });

  it("aggregateByGoal — Director: per-link expansion, null budget treated as 0", async () => {
    // proj-1 linked to goal-1 & goal-2 (expands to both groups); proj-2 (null budget) to goal-1.
    prisma.goalLink.findMany.mockResolvedValue([
      { goalId: "goal-1", projectId: "proj-1" },
      { goalId: "goal-2", projectId: "proj-1" },
      { goalId: "goal-1", projectId: "proj-2" },
    ]);
    prisma.projectAlignmentView.findMany.mockResolvedValue([
      { projectId: "proj-1", plannedBudget: 100 },
      { projectId: "proj-2", plannedBudget: null },
    ]);
    const groups = await repo.aggregateByGoal(DIRECTOR_CTX);
    // Director is unscoped — the projection query carries no portfolio filter.
    expect(prisma.portfolio.findMany).not.toHaveBeenCalled();
    const viewsWhere = prisma.projectAlignmentView.findMany.mock.calls[0][0].where;
    expect(viewsWhere).not.toHaveProperty("portfolioId");
    const byGoal = new Map(groups.map((g) => [g.groupId, g]));
    expect(byGoal.get("goal-1")).toEqual({
      groupId: "goal-1",
      projectCount: 2,
      totalPlannedBudget: 100,
    });
    expect(byGoal.get("goal-2")).toEqual({
      groupId: "goal-2",
      projectCount: 1,
      totalPlannedBudget: 100,
    });
  });

  it("aggregateByGoal — non-Director: restricts projects to owned portfolios (excludes others')", async () => {
    prisma.portfolio.findMany.mockResolvedValue([{ id: "port-a" }]);
    prisma.goalLink.findMany.mockResolvedValue([
      { goalId: "goal-1", projectId: "proj-owned" },
      { goalId: "goal-1", projectId: "proj-other" },
    ]);
    // The projection query (scoped to owned portfolios) only returns the owned project.
    prisma.projectAlignmentView.findMany.mockResolvedValue([
      { projectId: "proj-owned", plannedBudget: 100 },
    ]);
    const groups = await repo.aggregateByGoal(PM_CTX);

    const viewsWhere = prisma.projectAlignmentView.findMany.mock.calls[0][0].where;
    expect(viewsWhere.portfolioId).toEqual({ in: ["port-a"] });
    expect(viewsWhere.projectId).toEqual({ in: ["proj-owned", "proj-other"] });
    // proj-other's portfolio is not owned → excluded → only the owned project counts.
    expect(groups).toEqual([{ groupId: "goal-1", projectCount: 1, totalPlannedBudget: 100 }]);
  });

  it("aggregateByGoal — skips links whose project is not in the projection", async () => {
    prisma.goalLink.findMany.mockResolvedValue([{ goalId: "goal-1", projectId: "proj-ghost" }]);
    prisma.projectAlignmentView.findMany.mockResolvedValue([]);
    const groups = await repo.aggregateByGoal(DIRECTOR_CTX);
    expect(groups).toEqual([]);
  });

  it("aggregateByGoal — empty when no links", async () => {
    prisma.goalLink.findMany.mockResolvedValue([]);
    const groups = await repo.aggregateByGoal(DIRECTOR_CTX);
    expect(groups).toEqual([]);
    expect(prisma.projectAlignmentView.findMany).not.toHaveBeenCalled();
  });
});
