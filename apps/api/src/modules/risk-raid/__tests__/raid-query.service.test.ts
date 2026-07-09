import { describe, it, expect, vi } from "vitest";
import { RaidQueryService } from "../services/raid-query.service.js";

// ---------------------------------------------------------------------------
// H7 — RaidQueryService (reporting read side). Record-scoped: a non-Director only
// ever sees risks for the projects listProjects returns; getRaidSummary intersects
// the requested project ids with that accessible set (fail-closed).
// ---------------------------------------------------------------------------

const DIRECTOR = { userId: "d1", roles: ["EPMO_DIRECTOR"] as const, recordScopes: [] };
const SCOPED = { userId: "pm1", roles: ["PROJECT_MANAGER"] as const, recordScopes: [] };

function makeRepo(over: Partial<Record<string, unknown>> = {}) {
  return {
    findEscalated: vi.fn().mockResolvedValue([]),
    getSummaryData: vi.fn().mockResolvedValue({
      totalOpen: 0,
      totalEscalated: 0,
      riskScores: [],
      topEscalated: [],
    }),
    ...over,
  };
}

function makeProjectService(accessibleIds: string[]) {
  return {
    listProjects: vi.fn().mockResolvedValue({
      data: accessibleIds.map((id) => ({ id })),
      total: accessibleIds.length,
      page: 1,
      pageSize: 100,
    }),
  };
}

describe("RaidQueryService.listEscalatedRisks", () => {
  it("Director ⇒ unrestricted (findEscalated with null), listProjects never called", async () => {
    const repo = makeRepo();
    const projectService = makeProjectService(["pA"]);
    const svc = new RaidQueryService(repo as never, projectService as never);

    await svc.listEscalatedRisks(DIRECTOR);

    expect(projectService.listProjects).not.toHaveBeenCalled();
    expect(repo.findEscalated).toHaveBeenCalledWith(null);
  });

  it("non-Director ⇒ findEscalated scoped to the accessible project ids", async () => {
    const repo = makeRepo();
    const projectService = makeProjectService(["pA", "pB"]);
    const svc = new RaidQueryService(repo as never, projectService as never);

    await svc.listEscalatedRisks(SCOPED);

    expect(repo.findEscalated).toHaveBeenCalledWith(["pA", "pB"]);
  });
});

describe("RaidQueryService.getRaidSummary", () => {
  it("non-Director: requested ids are intersected with the accessible set", async () => {
    const repo = makeRepo();
    const projectService = makeProjectService(["pA", "pB"]);
    const svc = new RaidQueryService(repo as never, projectService as never);

    // caller asks for pA, pB, and pEVIL (outside scope)
    await svc.getRaidSummary(["pA", "pB", "pEVIL"], SCOPED);

    const [ids] = repo.getSummaryData.mock.calls[0] as [string[], number];
    expect(ids).toEqual(["pA", "pB"]); // pEVIL dropped
  });

  it("scoped caller with no overlap ⇒ empty id set (fail-closed all-zero summary)", async () => {
    const repo = makeRepo();
    const projectService = makeProjectService(["pA"]);
    const svc = new RaidQueryService(repo as never, projectService as never);

    const summary = await svc.getRaidSummary(["pOTHER"], SCOPED);

    const [ids] = repo.getSummaryData.mock.calls[0] as [string[], number];
    expect(ids).toEqual([]);
    expect(summary.totalOpen).toBe(0);
    expect(summary.totalEscalated).toBe(0);
  });

  it("Director: requested ids used as-is (no filtering)", async () => {
    const repo = makeRepo();
    const projectService = makeProjectService([]);
    const svc = new RaidQueryService(repo as never, projectService as never);

    await svc.getRaidSummary(["pA", "pB"], DIRECTOR);

    expect(projectService.listProjects).not.toHaveBeenCalled();
    const [ids] = repo.getSummaryData.mock.calls[0] as [string[], number];
    expect(ids).toEqual(["pA", "pB"]);
  });

  it("aggregates riskScores into byCriticality bands and passes through counts", async () => {
    const topEscalated = [{ id: "r1" }];
    const repo = makeRepo({
      getSummaryData: vi.fn().mockResolvedValue({
        totalOpen: 7,
        totalEscalated: 3,
        // 3→Low, 6→Medium, 12→High, 20→Critical, 25→Critical
        riskScores: [3, 6, 12, 20, 25],
        topEscalated,
      }),
    });
    const svc = new RaidQueryService(repo as never, makeProjectService([]) as never);

    const summary = await svc.getRaidSummary(["pA"], DIRECTOR);

    expect(summary.totalOpen).toBe(7);
    expect(summary.totalEscalated).toBe(3);
    expect(summary.byCriticality).toEqual({ Low: 1, Medium: 1, High: 1, Critical: 2 });
    expect(summary.topEscalated).toBe(topEscalated);
  });
});
