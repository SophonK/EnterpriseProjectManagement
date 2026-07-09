import { describe, it, expect, vi } from "vitest";
import fc from "fast-check";
import "../../../../../../packages/shared/src/errors/risk-error-codes.js";
import {
  computeRiskScore,
  riskBand,
  isValidStatusTransition,
} from "../../../../../../packages/shared/src/types/risk-raid.js";
import { RaidItemService } from "../services/raid-item.service.js";
import {
  RaidItemRepository,
  scopeWhereForProjects,
} from "../repositories/raid-item.repository.js";

// ---------------------------------------------------------------------------
// PBT P1 — Risk score formula: severity × probability
// ---------------------------------------------------------------------------

describe("PBT P1 — risk score is severity × probability", () => {
  it("computeRiskScore(s, p) === s * p for all valid inputs", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5 }),
        fc.integer({ min: 1, max: 5 }),
        (s, p) => computeRiskScore(s, p) === s * p,
      ),
      { numRuns: 50 },
    );
  });

  it("returns null when severity or probability is null", () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.constant(null), fc.integer({ min: 1, max: 5 })),
        fc.oneof(fc.constant(null), fc.integer({ min: 1, max: 5 })),
        (s, p) => {
          if (s == null || p == null) return computeRiskScore(s, p) === null;
          return computeRiskScore(s, p) === s * p;
        },
      ),
      { numRuns: 50 },
    );
  });
});

// ---------------------------------------------------------------------------
// PBT P2 — Escalation completeness: every item with score >= 15 is escalated
// ---------------------------------------------------------------------------

describe("PBT P2 — escalation detection completeness", () => {
  it("escalated ⟺ riskScore >= threshold", () => {
    const THRESHOLD = 15;
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            severity: fc.integer({ min: 1, max: 5 }),
            probability: fc.integer({ min: 1, max: 5 }),
          }),
          { minLength: 1, maxLength: 10 },
        ),
        (items) => {
          return items.every(({ severity, probability }) => {
            const score = computeRiskScore(severity, probability)!;
            const shouldEscalate = score >= THRESHOLD;
            return shouldEscalate === (score >= THRESHOLD);
          });
        },
      ),
      { numRuns: 50 },
    );
  });
});

// ---------------------------------------------------------------------------
// PBT P3 — Score bounds: 1–25; riskBand maps exhaustively and non-overlapping
// ---------------------------------------------------------------------------

describe("PBT P3 — score bounds and band exhaustiveness", () => {
  it("score ∈ [1, 25] for all valid severity/probability", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5 }),
        fc.integer({ min: 1, max: 5 }),
        (s, p) => {
          const score = computeRiskScore(s, p)!;
          return score >= 1 && score <= 25;
        },
      ),
      { numRuns: 50 },
    );
  });

  it("every score in [1,25] maps to exactly one band", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 25 }), (score) => {
        const band = riskBand(score);
        const isLow      = score <= 4;
        const isMedium   = score >= 5 && score <= 9;
        const isHigh     = score >= 10 && score <= 14;
        const isCritical = score >= 15;
        const expected = isLow ? "Low" : isMedium ? "Medium" : isHigh ? "High" : "Critical";
        const exactlyOne = [isLow, isMedium, isHigh, isCritical].filter(Boolean).length === 1;
        return band === expected && exactlyOne;
      }),
      { numRuns: 100 },
    );
  });
});

// PBT P4 (circular dependency) was moved to dependency.service.test.ts, where it now
// drives the REAL DependencyService.linkDependency instead of an inline reimplementation.

// ---------------------------------------------------------------------------
// Deterministic unit assertions
// ---------------------------------------------------------------------------

function makeRaidItemRepo(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    buildScopeWhere: vi.fn().mockReturnValue({}),
    findByIdOrThrow: vi.fn().mockResolvedValue({
      id: "raid-1", projectId: "proj-1", type: "Risk", title: "Test risk",
      description: null, severity: 3, probability: 4, riskScore: 12,
      status: "Open", escalated: false, ownerUserId: null,
      mitigation: null, closedBy: null, closedAt: null,
      createdBy: "user-1", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    }),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn().mockResolvedValue(undefined),
    findMany: vi.fn().mockResolvedValue([[], 0]),
    closeAllForProject: vi.fn().mockResolvedValue(0),
    ...overrides,
  };
}

function makeEventBus() {
  return { publish: vi.fn().mockResolvedValue(undefined), subscribe: vi.fn() };
}

function makeAuditService() {
  return { record: vi.fn().mockResolvedValue(undefined) };
}

// $transaction runs its callback with a stub tx client; the repo/audit mocks ignore it.
function makePrisma() {
  return {
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
  };
}

function makeProjectService(rejects = false) {
  return {
    getProject: rejects
      ? vi.fn().mockRejectedValue(new Error("not found"))
      : vi.fn().mockResolvedValue({ id: "proj-1" }),
  };
}

const CTX = { userId: "user-1", roles: ["EPMO_DIRECTOR"] as const, recordScopes: [] };

const RAID_ROW = {
  id: "raid-1", projectId: "proj-1", type: "Risk" as const, title: "Test",
  description: null, severity: 4, probability: 4, riskScore: 16,
  status: "Open" as const, escalated: false, ownerUserId: null,
  mitigation: null, closedBy: null, closedAt: null,
  createdBy: "user-1", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
};

function makeService(
  raidRepoOverrides: Partial<Record<string, unknown>> = {},
  rejectProject = false,
) {
  return new RaidItemService(
    makeRaidItemRepo(raidRepoOverrides) as never,
    makeEventBus() as never,
    makeAuditService() as never,
    makeProjectService(rejectProject) as never,
    makePrisma() as never,
  );
}

describe("RaidItemService unit assertions", () => {
  it("1 — computeRiskScore(4,4) === 16", () => {
    expect(computeRiskScore(4, 4)).toBe(16);
  });

  it("2 — computeRiskScore(null, null) === null", () => {
    expect(computeRiskScore(null, null)).toBeNull();
  });

  it("3 — escalation fires when score >= 15", async () => {
    const repo = makeRaidItemRepo({ create: vi.fn().mockResolvedValue({ ...RAID_ROW, riskScore: 16, escalated: true }) });
    const svc = new RaidItemService(repo as never, makeEventBus() as never, makeAuditService() as never, makeProjectService() as never, makePrisma() as never);
    const result = await svc.createRaidItem(
      { projectId: "proj-1", type: "Risk", title: "High risk", severity: 4, probability: 4 },
      CTX, "req-1",
    );
    expect(result.escalated).toBe(true);
  });

  it("4 — no escalation when score < 15", async () => {
    const repo = makeRaidItemRepo({ create: vi.fn().mockResolvedValue({ ...RAID_ROW, severity: 2, probability: 3, riskScore: 6, escalated: false }) });
    const svc = new RaidItemService(repo as never, makeEventBus() as never, makeAuditService() as never, makeProjectService() as never, makePrisma() as never);
    const result = await svc.createRaidItem(
      { projectId: "proj-1", type: "Risk", title: "Low risk", severity: 2, probability: 3 },
      CTX, "req-1",
    );
    expect(result.escalated).toBe(false);
  });

  it("5 — isValidStatusTransition Open → InProgress is allowed", () => {
    expect(isValidStatusTransition("Open", "InProgress")).toBe(true);
  });

  it("6 — terminal status blocks further transitions", () => {
    expect(isValidStatusTransition("Resolved", "InProgress")).toBe(false);
    expect(isValidStatusTransition("Closed", "Open")).toBe(false);
    expect(isValidStatusTransition("Accepted", "InProgress")).toBe(false);
    expect(isValidStatusTransition("Rejected", "Open")).toBe(false);
  });

  it("7 — throws RISK_005 on invalid transition", async () => {
    const svc = makeService({
      findByIdOrThrow: vi.fn().mockResolvedValue({ ...RAID_ROW, status: "Resolved" }),
    });
    await expect(
      svc.updateRaidItem("raid-1", { status: "InProgress" }, CTX, "req-1"),
    ).rejects.toMatchObject({ code: "RISK_005" });
  });

  it("8 — throws RISK_002 when project not found", async () => {
    const svc = makeService({}, true);
    await expect(
      svc.createRaidItem({ projectId: "bad", type: "Risk", title: "x", severity: 1, probability: 1 }, CTX, "req-1"),
    ).rejects.toMatchObject({ code: "RISK_002" });
  });

  it("9 — riskBand(15) === Critical", () => {
    expect(riskBand(15)).toBe("Critical");
  });

  it("10 — riskBand(6) === Medium", () => {
    expect(riskBand(6)).toBe("Medium");
  });
});

// ---------------------------------------------------------------------------
// BR-2 / BR-3 — non-Risk items never carry a score and never escalate
// ---------------------------------------------------------------------------

describe("non-Risk escalation (BR-2/BR-3)", () => {
  it("an Issue with high severity/probability does NOT escalate or publish risk.escalated", async () => {
    // Repo echoes back what the service asked it to persist so we can assert the
    // forced-null score fields and escalated=false end up on the row.
    const create = vi.fn((data: Record<string, unknown>) => ({
      ...RAID_ROW,
      type: "Issue",
      severity: data["severity"] ?? null,
      probability: data["probability"] ?? null,
      riskScore: data["riskScore"] ?? null,
      escalated: data["escalated"] as boolean,
    }));
    const repo = makeRaidItemRepo({ create });
    const eventBus = makeEventBus();
    const svc = new RaidItemService(
      repo as never,
      eventBus as never,
      makeAuditService() as never,
      makeProjectService() as never,
      makePrisma() as never,
    );

    const result = await svc.createRaidItem(
      // deliberately pass a score-worthy severity/probability on a non-Risk type
      { projectId: "proj-1", type: "Issue", title: "Big issue", severity: 5, probability: 5 } as never,
      CTX,
      "req-1",
    );

    // score fields forced null, not escalated
    expect(result.escalated).toBe(false);
    expect(result.riskScore).toBeNull();
    // service must have told the repo NOT to persist a score for a non-Risk item
    const createArg = create.mock.calls[0]![0] as Record<string, unknown>;
    expect(createArg["severity"]).toBeUndefined();
    expect(createArg["probability"]).toBeUndefined();
    expect(createArg["riskScore"]).toBeUndefined();
    expect(createArg["escalated"]).toBe(false);
    // only raid.logged is published — never risk.escalated
    const publishedTypes = eventBus.publish.mock.calls.map(
      (c) => (c[0] as { eventType: string }).eventType,
    );
    expect(publishedTypes).toContain("risk-raid.raid.logged");
    expect(publishedTypes).not.toContain("risk-raid.risk.escalated");
  });

  it("updating a non-Risk item forces score fields null and never escalates", async () => {
    const update = vi.fn((_, data: Record<string, unknown>) => ({
      ...RAID_ROW,
      type: "Assumption",
      severity: data["severity"] ?? null,
      probability: data["probability"] ?? null,
      riskScore: data["riskScore"] ?? null,
      escalated: data["escalated"] as boolean,
    }));
    const eventBus = makeEventBus();
    const svc = new RaidItemService(
      makeRaidItemRepo({
        findByIdOrThrow: vi.fn().mockResolvedValue({
          ...RAID_ROW,
          type: "Assumption",
          severity: null,
          probability: null,
          riskScore: null,
          escalated: false,
        }),
        update,
      }) as never,
      eventBus as never,
      makeAuditService() as never,
      makeProjectServiceWithList([]) as never, // Director path below via CTX
      makePrisma() as never,
    );

    const result = await svc.updateRaidItem(
      "raid-1",
      { severity: 5, probability: 5 } as never,
      CTX,
      "req-1",
    );

    expect(result.escalated).toBe(false);
    const updateArg = update.mock.calls[0]![1] as Record<string, unknown>;
    expect(updateArg["severity"]).toBeNull();
    expect(updateArg["probability"]).toBeNull();
    expect(updateArg["riskScore"]).toBeNull();
    expect(updateArg["escalated"]).toBe(false);
    const publishedTypes = eventBus.publish.mock.calls.map(
      (c) => (c[0] as { eventType: string }).eventType,
    );
    expect(publishedTypes).not.toContain("risk-raid.risk.escalated");
  });
});

// ---------------------------------------------------------------------------
// C3 — scoped-role (NON-Director) access resolution
//
// The platform never issues project-type record scopes, so scope MUST be derived
// from project-execution's listProjects. These tests run as a NON-Director and
// would FAIL if the service reverted to deriving scope from ctx.recordScopes.
// ---------------------------------------------------------------------------

const SCOPED_CTX = {
  userId: "pm-1",
  roles: ["PROJECT_MANAGER"] as const,
  recordScopes: [], // deliberately empty: proves scope comes from listProjects, not ctx
};

function makeProjectServiceWithList(
  accessibleIds: string[],
  overrides: Partial<Record<string, unknown>> = {},
) {
  return {
    getProject: vi.fn().mockResolvedValue({ id: "proj-1" }),
    listProjects: vi.fn().mockResolvedValue({
      data: accessibleIds.map((id) => ({ id })),
      total: accessibleIds.length,
      page: 1,
      pageSize: 100,
    }),
    ...overrides,
  };
}

describe("C3 — scoped-role project-id resolution", () => {
  it("listRaidItems resolves accessible ids from listProjects and passes them to findMany", async () => {
    const repo = makeRaidItemRepo();
    const projectService = makeProjectServiceWithList(["proj-A", "proj-B"]);
    const svc = new RaidItemService(
      repo as never,
      makeEventBus() as never,
      makeAuditService() as never,
      projectService as never,
      makePrisma() as never,
    );

    await svc.listRaidItems({ page: 1, pageSize: 25 }, SCOPED_CTX);

    expect(projectService.listProjects).toHaveBeenCalled();
    expect(repo.findMany).toHaveBeenCalledWith(
      { page: 1, pageSize: 25 },
      ["proj-A", "proj-B"],
    );
  });

  it("getRaidItem passes the resolved accessible ids to findByIdOrThrow", async () => {
    const repo = makeRaidItemRepo();
    const projectService = makeProjectServiceWithList(["proj-A"]);
    const svc = new RaidItemService(
      repo as never,
      makeEventBus() as never,
      makeAuditService() as never,
      projectService as never,
      makePrisma() as never,
    );

    await svc.getRaidItem("raid-1", SCOPED_CTX);

    expect(repo.findByIdOrThrow).toHaveBeenCalledWith("raid-1", ["proj-A"]);
  });

  it("a scoped caller with NO accessible projects gets an empty (fail-closed) id list, not null", async () => {
    const repo = makeRaidItemRepo();
    const projectService = makeProjectServiceWithList([]);
    const svc = new RaidItemService(
      repo as never,
      makeEventBus() as never,
      makeAuditService() as never,
      projectService as never,
      makePrisma() as never,
    );

    await svc.listRaidItems({}, SCOPED_CTX);

    expect(repo.findMany).toHaveBeenCalledWith({}, []);
  });

  it("Director ⇒ null accessible ids (unrestricted) and listProjects is never called", async () => {
    const repo = makeRaidItemRepo();
    const projectService = makeProjectServiceWithList(["proj-A"]);
    const svc = new RaidItemService(
      repo as never,
      makeEventBus() as never,
      makeAuditService() as never,
      projectService as never,
      makePrisma() as never,
    );

    await svc.listRaidItems({}, CTX); // CTX is EPMO_DIRECTOR

    expect(projectService.listProjects).not.toHaveBeenCalled();
    expect(repo.findMany).toHaveBeenCalledWith({}, null);
  });

  it("paginates listProjects to collect ALL accessible ids across pages", async () => {
    const repo = makeRaidItemRepo();
    const page1 = Array.from({ length: 100 }, (_, i) => ({ id: `p${i}` }));
    const page2 = [{ id: "p100" }, { id: "p101" }];
    const listProjects = vi
      .fn()
      .mockResolvedValueOnce({ data: page1, total: 102, page: 1, pageSize: 100 })
      .mockResolvedValueOnce({ data: page2, total: 102, page: 2, pageSize: 100 });
    const projectService = { getProject: vi.fn(), listProjects };
    const svc = new RaidItemService(
      repo as never,
      makeEventBus() as never,
      makeAuditService() as never,
      projectService as never,
      makePrisma() as never,
    );

    await svc.listRaidItems({}, SCOPED_CTX);

    expect(listProjects).toHaveBeenCalledTimes(2);
    const [, ids] = repo.findMany.mock.calls[0] as [unknown, string[]];
    expect(ids).toHaveLength(102);
    expect(ids).toContain("p101");
  });
});

// ---------------------------------------------------------------------------
// C2 + C3 — repository where-shape (real RaidItemRepository against a mock prisma)
//
// These guard the IDOR fix directly: the scope clause and the caller-supplied
// projectId filter MUST be ANDed, never spread onto the same `projectId` key.
// ---------------------------------------------------------------------------

function makePrismaSpy() {
  const captured: { where?: unknown; findFirstWhere?: unknown } = {};
  const prisma = {
    raidItem: {
      findMany: vi.fn((args: { where: unknown }) => {
        captured.where = args.where;
        return [];
      }),
      count: vi.fn(() => 0),
      findFirst: vi.fn((args: { where: unknown }) => {
        captured.findFirstWhere = args.where;
        return null;
      }),
    },
    $transaction: (ops: unknown[]) => Promise.all(ops),
  };
  return { prisma, captured };
}

describe("scopeWhereForProjects — pure helper", () => {
  it("null ⇒ unrestricted {}", () => {
    expect(scopeWhereForProjects(null)).toEqual({});
  });
  it("empty array ⇒ fail-closed { projectId: { in: [] } }", () => {
    expect(scopeWhereForProjects([])).toEqual({ projectId: { in: [] } });
  });
  it("ids ⇒ { projectId: { in: ids } }", () => {
    expect(scopeWhereForProjects(["proj-A"])).toEqual({ projectId: { in: ["proj-A"] } });
  });
});

describe("RaidItemRepository.findMany — C2 scope/filter ANDing", () => {
  it("ANDs scope with a caller-supplied projectId filter (no overwrite/IDOR)", async () => {
    const { prisma, captured } = makePrismaSpy();
    const repo = new RaidItemRepository(prisma as never);

    // caller is scoped to proj-A/proj-B but requests ?projectId=proj-EVIL
    await repo.findMany({ projectId: "proj-EVIL" }, ["proj-A", "proj-B"]);

    // scope clause must still be present AND the projectId filter is a SEPARATE term,
    // so the query resolves to (projectId in [A,B]) AND (projectId = EVIL) ⇒ no rows.
    expect(captured.where).toEqual({
      AND: [
        { projectId: { in: ["proj-A", "proj-B"] } },
        { projectId: "proj-EVIL" },
      ],
    });
    // regression guard: scope must NOT have been overwritten by the raw projectId
    expect(captured.where).not.toEqual({ projectId: "proj-EVIL" });
  });

  it("findByIdOrThrow ANDs the scope clause with the id lookup", async () => {
    const { prisma, captured } = makePrismaSpy();
    const repo = new RaidItemRepository(prisma as never);

    await expect(
      repo.findByIdOrThrow("raid-1", ["proj-A"]),
    ).rejects.toMatchObject({ code: "RISK_004" });

    expect(captured.findFirstWhere).toEqual({
      AND: [{ projectId: { in: ["proj-A"] } }, { id: "raid-1" }],
    });
  });
});
