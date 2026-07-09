import { describe, it, expect, vi, beforeEach } from "vitest";
import type {
  AuthContext,
  ExportFilter,
  ProjectDTO,
  RaidItemDTO,
  RaidListDTO,
  RaidSummaryDTO,
  UtilizationDTO,
} from "@epm/shared";

// Side-effect: register REPORT_* error codes (REPORT_001/002/003).
import "../../../../../../packages/shared/src/errors/report-error-codes.js";

import { DashboardService } from "../services/dashboard.service.js";

// ---------------------------------------------------------------------------
// Test fixtures. We deliberately drive these tests as a NON-Director
// (PORTFOLIO_MANAGER) with a portfolio-scoped context so the scope-sensitive
// paths (H6 project resolution, getAlignmentCoverage guard) are actually exercised.
// ---------------------------------------------------------------------------

const PORTFOLIO_ID = "pf-1";

function makeCtx(scopedPortfolioId: string = PORTFOLIO_ID): AuthContext {
  return {
    userId: "u-1",
    roles: ["PORTFOLIO_MANAGER"],
    recordScopes: [{ type: "portfolio", ids: [scopedPortfolioId] }],
  };
}

function makeProject(id: string, over: Partial<ProjectDTO> = {}): ProjectDTO {
  return {
    id,
    name: `Project ${id}`,
    description: null,
    ownerUserId: "u-1",
    portfolioId: PORTFOLIO_ID,
    programId: null,
    status: "Active",
    health: "AtRisk",
    plannedStart: "2026-01-01",
    plannedEnd: "2026-12-31",
    plannedBudget: null,
    archivedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

function makeRaid(id: string, over: Partial<RaidItemDTO> = {}): RaidItemDTO {
  return {
    id,
    projectId: "p-1",
    type: "Risk",
    title: `Risk ${id}`,
    description: null,
    severity: 4,
    probability: 4,
    riskScore: 16,
    status: "Open",
    escalated: true,
    ownerUserId: null,
    mitigation: null,
    closedBy: null,
    closedAt: null,
    createdBy: "u-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

const EMPTY_SUMMARY: RaidSummaryDTO = {
  totalOpen: 0,
  totalEscalated: 0,
  byCriticality: { Low: 0, Medium: 0, High: 0, Critical: 0 },
  topEscalated: [],
};

interface Mocks {
  projectQueryService: {
    getPortfolioRollup: ReturnType<typeof vi.fn>;
    getAtRiskProjects: ReturnType<typeof vi.fn>;
  };
  projectService: { listProjects: ReturnType<typeof vi.fn> };
  utilizationService: { getUtilization: ReturnType<typeof vi.fn> };
  raidItemService: { listRaidItems: ReturnType<typeof vi.fn> };
  raidQueryService: { getRaidSummary: ReturnType<typeof vi.fn> };
  prisma: {
    projectAlignmentView: { count: ReturnType<typeof vi.fn> };
    $transaction: ReturnType<typeof vi.fn>;
  };
}

function makeService(): { service: DashboardService; mocks: Mocks } {
  const mocks: Mocks = {
    projectQueryService: {
      getPortfolioRollup: vi.fn().mockResolvedValue(null),
      getAtRiskProjects: vi.fn().mockResolvedValue([]),
    },
    projectService: {
      // Default: one accessible project in this portfolio.
      listProjects: vi.fn().mockResolvedValue({
        data: [makeProject("p-1")],
        total: 1,
        page: 1,
        pageSize: 100,
      }),
    },
    utilizationService: {
      getUtilization: vi.fn().mockResolvedValue({ from: "2026-01", to: "2026-03", rows: [] } as UtilizationDTO),
    },
    raidItemService: {
      listRaidItems: vi.fn().mockResolvedValue({ data: [], total: 0, page: 1, pageSize: 100 } as RaidListDTO),
    },
    raidQueryService: {
      getRaidSummary: vi.fn().mockResolvedValue(EMPTY_SUMMARY),
    },
    prisma: {
      // count() calls are evaluated as arguments to $transaction; the mock just needs the
      // property to exist. $transaction resolves [activeCount, alignedCount].
      projectAlignmentView: { count: vi.fn().mockReturnValue({}) },
      $transaction: vi.fn().mockResolvedValue([2, 1]),
    },
  };

  const service = new DashboardService(
    mocks.projectQueryService as never,
    mocks.projectService as never,
    mocks.utilizationService as never,
    mocks.raidItemService as never,
    mocks.raidQueryService as never,
    mocks.prisma as never,
  );
  return { service, mocks };
}

// ---------------------------------------------------------------------------
// getExportRows — validation & dispatch (correctness.md test #7 + REPORT_001)
// ---------------------------------------------------------------------------

describe("DashboardService.getExportRows — validation", () => {
  let harness: ReturnType<typeof makeService>;
  beforeEach(() => {
    harness = makeService();
  });

  it("throws REPORT_003 for an unknown reportType (correctness.md #7)", async () => {
    const { service } = harness;
    // ExportFilter's type union only permits 3 values; cast to reach the service default.
    const filter = { reportType: "totally-unknown" } as unknown as ExportFilter;
    await expect(service.getExportRows(filter, makeCtx())).rejects.toMatchObject({
      code: "REPORT_003",
    });
  });

  it("throws REPORT_001 when portfolio-health export omits portfolioId", async () => {
    const { service } = harness;
    await expect(
      service.getExportRows({ reportType: "portfolio-health" }, makeCtx()),
    ).rejects.toMatchObject({ code: "REPORT_001" });
  });

  it("throws REPORT_001 when capacity export omits from/to", async () => {
    const { service } = harness;
    await expect(
      service.getExportRows({ reportType: "capacity", from: "2026-01" }, makeCtx()),
    ).rejects.toMatchObject({ code: "REPORT_001" });
  });
});

// ---------------------------------------------------------------------------
// getExportRows — the three row-mapping branches
// ---------------------------------------------------------------------------

describe("DashboardService.getExportRows — row mapping", () => {
  it("portfolio-health maps at-risk projects to flat rows", async () => {
    const { service, mocks } = makeService();
    mocks.projectQueryService.getAtRiskProjects.mockResolvedValue([
      makeProject("proj-a", { name: "Alpha", programId: "prog-1" }),
    ]);

    const rows = await service.getExportRows(
      { reportType: "portfolio-health", portfolioId: PORTFOLIO_ID },
      makeCtx(),
    );

    expect(rows).toEqual([
      {
        id: "proj-a",
        name: "Alpha",
        status: "Active",
        health: "AtRisk",
        portfolioId: PORTFOLIO_ID,
        programId: "prog-1",
      },
    ]);
  });

  it("capacity flattens utilization rows × periods", async () => {
    const { service, mocks } = makeService();
    const util: UtilizationDTO = {
      from: "2026-01",
      to: "2026-02",
      rows: [
        {
          resourceId: "r-1",
          resourceName: "Ada",
          poolId: "pool-1",
          periods: [
            { month: "2026-01", allocatedPct: 80, band: "Optimal" },
            { month: "2026-02", allocatedPct: 120, band: "Over" },
          ],
        },
      ],
    };
    mocks.utilizationService.getUtilization.mockResolvedValue(util);

    const rows = await service.getExportRows(
      { reportType: "capacity", from: "2026-01", to: "2026-02" },
      makeCtx(),
    );

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ resourceId: "r-1", month: "2026-01", allocatedPct: 80, band: "Optimal" });
    expect(rows[1]).toMatchObject({ month: "2026-02", allocatedPct: 120, band: "Over" });
  });

  it("risk-summary maps raid items, coalescing nullable fields to empty strings", async () => {
    const { service, mocks } = makeService();
    mocks.raidItemService.listRaidItems.mockResolvedValue({
      data: [makeRaid("raid-1", { severity: null, probability: null, riskScore: null, ownerUserId: null })],
      total: 1,
      page: 1,
      pageSize: 100,
    } as RaidListDTO);

    const rows = await service.getExportRows({ reportType: "risk-summary" }, makeCtx());

    expect(rows).toEqual([
      {
        id: "raid-1",
        projectId: "p-1",
        type: "Risk",
        title: "Risk raid-1",
        severity: "",
        probability: "",
        riskScore: "",
        status: "Open",
        escalated: true,
        ownerUserId: "",
      },
    ]);
  });
});

// ---------------------------------------------------------------------------
// H6 — portfolio-health topEscalatedRisks scoped to the portfolio's projects
// ---------------------------------------------------------------------------

describe("DashboardService.getPortfolioHealth — H6 escalated risks are portfolio-scoped", () => {
  it("passes the portfolio's accessible project ids to RaidQueryService.getRaidSummary", async () => {
    const { service, mocks } = makeService();
    const ctx = makeCtx();

    // The viewed portfolio resolves to exactly these two projects under the caller's scope.
    mocks.projectService.listProjects.mockResolvedValue({
      data: [makeProject("proj-1"), makeProject("proj-2")],
      total: 2,
      page: 1,
      pageSize: 100,
    });

    const escalated = [makeRaid("high-risk", { riskScore: 25 })];
    mocks.raidQueryService.getRaidSummary.mockResolvedValue({
      ...EMPTY_SUMMARY,
      totalEscalated: 1,
      topEscalated: escalated,
    });

    const dashboard = await service.getPortfolioHealth(PORTFOLIO_ID, ctx);

    // Resolution queried project-execution scoped to THIS portfolio.
    expect(mocks.projectService.listProjects).toHaveBeenCalledWith(
      expect.objectContaining({ portfolioId: PORTFOLIO_ID }),
      ctx,
    );
    // The risk summary was asked ONLY for this portfolio's project ids (record-scoped).
    expect(mocks.raidQueryService.getRaidSummary).toHaveBeenCalledWith(["proj-1", "proj-2"], ctx);
    // And the card shows exactly what that scoped summary returned.
    expect(dashboard.topEscalatedRisks).toBe(escalated);
  });

  it("getAlignmentCoverage refuses an out-of-scope portfolio (defense-in-depth guard)", async () => {
    const { service } = makeService();
    // Caller is scoped to a DIFFERENT portfolio than the one requested.
    const ctx = makeCtx("some-other-portfolio");

    await expect(service.getPortfolioHealth(PORTFOLIO_ID, ctx)).rejects.toMatchObject({
      status: 403,
    });
  });
});

// ---------------------------------------------------------------------------
// H5 — risk export returns ALL rows (>100) instead of a silently truncated page
// ---------------------------------------------------------------------------

describe("DashboardService.getExportRows — H5 risk export is not truncated at 100", () => {
  it("loops the scoped paginated call and returns all 250 rows", async () => {
    const { service, mocks } = makeService();
    const TOTAL = 250;

    // Simulate the RAID repo's hard 100-row page cap: each call returns at most 100 rows.
    mocks.raidItemService.listRaidItems.mockImplementation(
      (filter: { page?: number; pageSize?: number }) => {
        const page = filter.page ?? 1;
        const pageSize = filter.pageSize ?? 100;
        const start = (page - 1) * pageSize;
        const count = Math.max(0, Math.min(pageSize, TOTAL - start));
        return Promise.resolve({
          data: Array.from({ length: count }, (_, i) => makeRaid(`r-${start + i}`)),
          total: TOTAL,
          page,
          pageSize,
        } as RaidListDTO);
      },
    );

    const rows = await service.getExportRows({ reportType: "risk-summary" }, makeCtx());

    expect(rows).toHaveLength(TOTAL);
    // 250 rows over a 100-row page cap ⇒ 3 paginated fetches, not one truncated call.
    expect(mocks.raidItemService.listRaidItems).toHaveBeenCalledTimes(3);
    const ids = rows.map((r) => (r as { id: string }).id);
    expect(ids[0]).toBe("r-0");
    expect(ids[TOTAL - 1]).toBe(`r-${TOTAL - 1}`);
  });
});
