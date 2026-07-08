import { describe, it, expect, vi, beforeEach } from "vitest";
import "../../../../../../packages/shared/src/errors/execution-error-codes.js";
import { ProjectRepository } from "../repositories/project.repository.js";
import { MilestoneRepository } from "../repositories/milestone.repository.js";
import { StatusUpdateRepository } from "../repositories/status-update.repository.js";
import { RollupSnapshotRepository } from "../repositories/rollup-snapshot.repository.js";
import type { AuthContext } from "@epm/shared";

// ---------------------------------------------------------------------------
// Mock PrismaService
// ---------------------------------------------------------------------------

function makePrisma() {
  return {
    project: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    milestone: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
    },
    statusUpdate: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    rollupSnapshot: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    // M-2 fix: RollupSnapshotRepository.upsert uses $transaction
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      // Pass through to the same prisma mock so findFirst/create/update work
      return fn({
        rollupSnapshot: {
          findFirst: vi.fn(),
          create: vi.fn(),
          update: vi.fn(),
        },
      });
    }),
  };
}

const DIRECTOR_CTX: AuthContext = {
  userId: "user-1",
  roles: ["EPMO_DIRECTOR"],
  recordScopes: [],
};

const PM_CTX: AuthContext = {
  userId: "user-pm",
  roles: ["PROJECT_MANAGER"],
  recordScopes: [],
};

const PORTFOLIO_MGR_CTX: AuthContext = {
  userId: "user-pm2",
  roles: ["PORTFOLIO_MANAGER"],
  recordScopes: [{ type: "portfolio", ids: ["port-1"] }],
};

function makeProjectRow(overrides: Partial<ReturnType<typeof baseProjectRow>> = {}) {
  return { ...baseProjectRow(), ...overrides };
}

function baseProjectRow() {
  return {
    id: "proj-1",
    name: "Test Project",
    description: null,
    ownerUserId: "user-pm",
    portfolioId: "port-1",
    programId: null,
    status: "Open",
    health: "OnTrack",
    plannedStart: new Date("2026-08-01"),
    plannedEnd: new Date("2027-01-31"),
    plannedBudget: null,
    sourceDemandId: null,
    archivedAt: null,
    createdAt: new Date("2026-07-08"),
    updatedAt: new Date("2026-07-08"),
    createdBy: "user-pm",
  };
}

// ---------------------------------------------------------------------------
// ProjectRepository
// ---------------------------------------------------------------------------

describe("ProjectRepository", () => {
  let prisma: ReturnType<typeof makePrisma>;
  let repo: ProjectRepository;

  beforeEach(() => {
    prisma = makePrisma();
    repo = new ProjectRepository(prisma as never);
  });

  it("has schema = execution", () => {
    expect(repo.schema).toBe("execution");
  });

  it("create — returns DTO with ISO date strings", async () => {
    prisma.project.create.mockResolvedValue(makeProjectRow());
    const dto = await repo.create({
      name: "Test Project",
      ownerUserId: "user-pm",
      portfolioId: "port-1",
      plannedStart: new Date("2026-08-01"),
      plannedEnd: new Date("2027-01-31"),
      createdBy: "user-pm",
    });
    expect(dto.plannedStart).toBe("2026-08-01");
    expect(dto.plannedEnd).toBe("2027-01-31");
    expect(dto.status).toBe("Open");
    expect(dto.health).toBe("OnTrack");
  });

  it("findById — returns null when not found", async () => {
    prisma.project.findFirst.mockResolvedValue(null);
    const result = await repo.findById("missing");
    expect(result).toBeNull();
  });

  it("findByIdOrThrow — throws EXECUTION_005 when missing", async () => {
    prisma.project.findFirst.mockResolvedValue(null);
    await expect(repo.findByIdOrThrow("missing")).rejects.toMatchObject({ code: "EXECUTION_005" });
  });

  it("findBySourceDemandId — returns null when no match", async () => {
    prisma.project.findFirst.mockResolvedValue(null);
    expect(await repo.findBySourceDemandId("demand-x")).toBeNull();
  });

  it("findMany — EPMO Director: no scope filter applied", async () => {
    prisma.project.findMany.mockResolvedValue([makeProjectRow()]);
    prisma.project.count.mockResolvedValue(1);
    await repo.findMany({}, DIRECTOR_CTX);
    const whereArg = prisma.project.findMany.mock.calls[0][0].where;
    expect(whereArg).not.toHaveProperty("ownerUserId");
    expect(whereArg).not.toHaveProperty("portfolioId.in");
  });

  it("findMany — Project Manager: scoped to ownerUserId", async () => {
    prisma.project.findMany.mockResolvedValue([]);
    prisma.project.count.mockResolvedValue(0);
    await repo.findMany({}, PM_CTX);
    const whereArg = prisma.project.findMany.mock.calls[0][0].where;
    expect(whereArg.ownerUserId).toBe("user-pm");
  });

  it("findMany — Portfolio Manager: scoped to portfolio ids", async () => {
    prisma.project.findMany.mockResolvedValue([]);
    prisma.project.count.mockResolvedValue(0);
    await repo.findMany({}, PORTFOLIO_MGR_CTX);
    const whereArg = prisma.project.findMany.mock.calls[0][0].where;
    expect(whereArg.portfolioId).toEqual({ in: ["port-1"] });
  });

  it("archive — calls update with archivedAt", async () => {
    prisma.project.update.mockResolvedValue(makeProjectRow({ archivedAt: new Date() }));
    await repo.archive("proj-1");
    expect(prisma.project.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "proj-1" } }),
    );
  });
});

// ---------------------------------------------------------------------------
// MilestoneRepository
// ---------------------------------------------------------------------------

describe("MilestoneRepository", () => {
  let prisma: ReturnType<typeof makePrisma>;
  let repo: MilestoneRepository;

  beforeEach(() => {
    prisma = makePrisma();
    repo = new MilestoneRepository(prisma as never);
  });

  it("has schema = execution", () => {
    expect(repo.schema).toBe("execution");
  });

  it("create — sets overdue=true for past due date", async () => {
    const pastDate = new Date("2020-01-01");
    prisma.milestone.create.mockResolvedValue({
      id: "ms-1", projectId: "proj-1", title: "Past", description: null,
      dueDate: pastDate, completedAt: null, overdue: true, sortOrder: 0,
      createdAt: new Date(), updatedAt: new Date(), createdBy: "user-pm",
    });
    const dto = await repo.create({
      projectId: "proj-1", title: "Past", dueDate: pastDate, createdBy: "user-pm",
    });
    expect(dto.overdue).toBe(true);
    const createArg = prisma.milestone.create.mock.calls[0][0].data;
    expect(createArg.overdue).toBe(true);
  });

  it("create — sets overdue=false for future due date", async () => {
    const futureDate = new Date("2099-01-01");
    prisma.milestone.create.mockResolvedValue({
      id: "ms-2", projectId: "proj-1", title: "Future", description: null,
      dueDate: futureDate, completedAt: null, overdue: false, sortOrder: 0,
      createdAt: new Date(), updatedAt: new Date(), createdBy: "user-pm",
    });
    await repo.create({
      projectId: "proj-1", title: "Future", dueDate: futureDate, createdBy: "user-pm",
    });
    const createArg = prisma.milestone.create.mock.calls[0][0].data;
    expect(createArg.overdue).toBe(false);
  });

  it("findByProject — materializes overdue flag for stale rows", async () => {
    const staleRow = {
      id: "ms-3", projectId: "proj-1", title: "Stale", description: null,
      dueDate: new Date("2020-01-01"), completedAt: null, overdue: false, sortOrder: 0,
      createdAt: new Date(), updatedAt: new Date(), createdBy: "user-pm",
    };
    prisma.milestone.findMany.mockResolvedValue([staleRow]);
    prisma.milestone.updateMany.mockResolvedValue({ count: 1 });
    const { milestones, newlyOverdueIds } = await repo.findByProject("proj-1");
    expect(milestones[0].overdue).toBe(true);
    expect(newlyOverdueIds).toContain("ms-3");
    expect(prisma.milestone.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ overdue: true }) }),
    );
  });

  it("delete — throws EXECUTION_005 if milestone not in project", async () => {
    prisma.milestone.findFirst.mockResolvedValue(null);
    await expect(repo.delete("ms-x", "proj-1")).rejects.toMatchObject({ code: "EXECUTION_005" });
  });
});

// ---------------------------------------------------------------------------
// StatusUpdateRepository
// ---------------------------------------------------------------------------

describe("StatusUpdateRepository", () => {
  let prisma: ReturnType<typeof makePrisma>;
  let repo: StatusUpdateRepository;

  beforeEach(() => {
    prisma = makePrisma();
    repo = new StatusUpdateRepository(prisma as never);
  });

  it("findByProject — returns rows in desc order", async () => {
    prisma.statusUpdate.findMany.mockResolvedValue([]);
    await repo.findByProject("proj-1");
    expect(prisma.statusUpdate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { recordedAt: "desc" } }),
    );
  });
});

// ---------------------------------------------------------------------------
// RollupSnapshotRepository
// ---------------------------------------------------------------------------

describe("RollupSnapshotRepository", () => {
  let prisma: ReturnType<typeof makePrisma>;
  let repo: RollupSnapshotRepository;

  beforeEach(() => {
    prisma = makePrisma();
    repo = new RollupSnapshotRepository(prisma as never);
  });

  it("upsert — creates and returns DTO when none exists", async () => {
    const createResult = {
      portfolioId: "port-1", programId: null,
      onTrackCount: 5, atRiskCount: 2, offTrackCount: 1, totalCount: 8,
      computedAt: new Date(),
    };
    // Override $transaction to use a tx with findFirst→null, create→result
    prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        rollupSnapshot: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue(createResult),
          update: vi.fn(),
        },
      }),
    );
    const dto = await repo.upsert({
      portfolioId: "port-1", programId: null,
      onTrackCount: 5, atRiskCount: 2, offTrackCount: 1, totalCount: 8,
    });
    expect(dto.totalCount).toBe(8);
    expect(dto.portfolioId).toBe("port-1");
  });

  it("upsert — updates existing snapshot when found", async () => {
    const updateResult = {
      portfolioId: "port-1", programId: null,
      onTrackCount: 6, atRiskCount: 1, offTrackCount: 1, totalCount: 8,
      computedAt: new Date(),
    };
    const txUpdate = vi.fn().mockResolvedValue(updateResult);
    prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        rollupSnapshot: {
          findFirst: vi.fn().mockResolvedValue({ id: "snap-1" }),
          update: txUpdate,
          create: vi.fn(),
        },
      }),
    );
    const dto = await repo.upsert({
      portfolioId: "port-1", programId: null,
      onTrackCount: 6, atRiskCount: 1, offTrackCount: 1, totalCount: 8,
    });
    expect(dto.onTrackCount).toBe(6);
    expect(txUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "snap-1" } }),
    );
  });

  it("find — returns null when not found", async () => {
    prisma.rollupSnapshot.findFirst.mockResolvedValue(null);
    expect(await repo.find("port-x", null)).toBeNull();
  });
});