import { describe, it, expect, vi } from "vitest";
import fc from "fast-check";
import "../../../../../../packages/shared/src/errors/strategy-error-codes.js";
import { InvestmentMixService } from "../services/investment-mix.service.js";
import { AlignmentService } from "../services/alignment.service.js";
import { GoalLinkService } from "../services/goal-link.service.js";
import { PortfolioService } from "../services/portfolio.service.js";
import type { AuthContext } from "@epm/shared";

// ---------------------------------------------------------------------------
// Shared mocks / helpers
// ---------------------------------------------------------------------------

const CTX: AuthContext = { userId: "user-1", roles: ["PORTFOLIO_MANAGER"], recordScopes: [] };

function makeEventBus() {
  return { publish: vi.fn().mockResolvedValue(undefined), subscribe: vi.fn() };
}

function makeAudit() {
  return { record: vi.fn().mockResolvedValue(undefined) };
}

interface ViewRow {
  projectId: string;
  plannedBudget: number | null;
  portfolioId: string | null;
}

interface Link {
  goalId: string;
  projectId: string;
}

/**
 * View repo mock whose aggregations mirror the real repository:
 * - portfolio dimension = partition over rows WITH a portfolio (null portfolio excluded,
 *   matching `aggregateByPortfolio`'s `where: { portfolioId: { not: null } }`),
 * - goal dimension = per-link expansion over links whose project is in the projection.
 */
function makeViewRepo(rows: ViewRow[], links: Link[]) {
  return {
    aggregateByPortfolio: vi.fn().mockImplementation(async () => {
      const acc = new Map<string, { projectCount: number; totalPlannedBudget: number }>();
      for (const r of rows) {
        if (r.portfolioId === null) continue; // real repo excludes portfolio-less rows
        const cur = acc.get(r.portfolioId) ?? { projectCount: 0, totalPlannedBudget: 0 };
        cur.projectCount += 1;
        cur.totalPlannedBudget += r.plannedBudget ?? 0;
        acc.set(r.portfolioId, cur);
      }
      return [...acc.entries()].map(([groupId, v]) => ({ groupId, ...v }));
    }),
    aggregateByGoal: vi.fn().mockImplementation(async () => {
      const budgetByProject = new Map(rows.map((r) => [r.projectId, r.plannedBudget ?? 0]));
      const acc = new Map<string, { projectCount: number; totalPlannedBudget: number }>();
      for (const l of links) {
        if (!budgetByProject.has(l.projectId)) continue;
        const b = budgetByProject.get(l.projectId) ?? 0;
        const cur = acc.get(l.goalId) ?? { projectCount: 0, totalPlannedBudget: 0 };
        cur.projectCount += 1;
        cur.totalPlannedBudget += b;
        acc.set(l.goalId, cur);
      }
      return [...acc.entries()].map(([groupId, v]) => ({ groupId, ...v }));
    }),
  };
}

// ---------------------------------------------------------------------------
// P1 — Investment-mix total-preserving (numRuns 100)
// ---------------------------------------------------------------------------

const viewRow = fc.record({
  projectId: fc.uuid(),
  plannedBudget: fc.option(fc.integer({ min: 0, max: 10_000_000 }), { nil: null }),
  portfolioId: fc.option(fc.constantFrom("port-1", "port-2", "port-3"), { nil: null }),
});
const scope = fc.uniqueArray(viewRow, { minLength: 0, maxLength: 50, selector: (r) => r.projectId });

describe("PBT P1 — investment-mix total-preserving", () => {
  it("portfolio dimension: strict partition conserves budget and project count", async () => {
    await fc.assert(
      fc.asyncProperty(scope, async (rows) => {
        const svc = new InvestmentMixService(
          makeViewRepo(rows, []) as never,
          { count: vi.fn() } as never,
          { listActive: vi.fn().mockResolvedValue([]) } as never,
          { findMany: vi.fn().mockResolvedValue([]) } as never,
        );

        const groups = await svc.getInvestmentMix("portfolio", CTX);

        // The real repo excludes portfolio-less rows, so the conserved quantity is over
        // rows that HAVE a portfolio, not all rows.
        const scoped = rows.filter((r) => r.portfolioId !== null);
        const expectedBudget = scoped.reduce((s, r) => s + (r.plannedBudget ?? 0), 0);
        const sumBudget = groups.reduce((s, g) => s + g.totalPlannedBudget, 0);
        const sumCount = groups.reduce((s, g) => s + g.projectCount, 0);

        expect(sumBudget).toBe(expectedBudget); // no budget lost or double-counted
        expect(sumCount).toBe(scoped.length); // partition over portfolio-bearing projects
      }),
      { numRuns: 100 },
    );
  });

  it("goal dimension: link-expansion conserves budget and count over the (project,goal) link set", async () => {
    const goalScenario = scope.chain((rows) => {
      if (rows.length === 0) return fc.constant({ rows, links: [] as Link[] });
      const link = fc.record({
        goalId: fc.constantFrom("g-1", "g-2", "g-3"),
        projectId: fc.constantFrom(...rows.map((r) => r.projectId)),
      });
      return fc
        .uniqueArray(link, { maxLength: 30, selector: (l) => `${l.goalId}:${l.projectId}` })
        .map((links) => ({ rows, links }));
    });

    await fc.assert(
      fc.asyncProperty(goalScenario, async ({ rows, links }) => {
        const svc = new InvestmentMixService(
          makeViewRepo(rows, links) as never,
          { count: vi.fn() } as never,
          { listActive: vi.fn().mockResolvedValue([]) } as never,
          { findMany: vi.fn().mockResolvedValue([]) } as never,
        );

        const groups = await svc.getInvestmentMix("goal", CTX);

        const budgetByProject = new Map(rows.map((r) => [r.projectId, r.plannedBudget ?? 0]));
        const expectedBudget = links.reduce((s, l) => s + (budgetByProject.get(l.projectId) ?? 0), 0);
        const sumBudget = groups.reduce((s, g) => s + g.totalPlannedBudget, 0);
        const sumCount = groups.reduce((s, g) => s + g.projectCount, 0);

        expect(sumBudget).toBe(expectedBudget);
        expect(sumCount).toBe(links.length); // one count per link, by design
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// P2 — Alignment exhaustive / deterministic (numRuns 100)
// ---------------------------------------------------------------------------

describe("PBT P2 — alignment exhaustive & deterministic", () => {
  it("evaluateAlignment == (linkCount >= 1), total, and idempotent", async () => {
    await fc.assert(
      fc.asyncProperty(fc.uuid(), fc.nat({ max: 20 }), async (projectId, n) => {
        const goalLinkRepo = { countByProject: vi.fn().mockResolvedValue(n) };
        const setAligned = vi.fn().mockResolvedValue(undefined);
        const viewRepo = {
          findByProject: vi.fn().mockResolvedValue({
            projectId,
            name: "P",
            status: "Active",
            plannedBudget: null,
            portfolioId: null,
            programId: null,
            aligned: false,
            lastEventAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }),
          setAligned,
        };
        const svc = new AlignmentService(
          goalLinkRepo as never,
          viewRepo as never,
          makeEventBus() as never,
        );

        const first = await svc.evaluateAlignment(projectId);
        const second = await svc.evaluateAlignment(projectId);

        expect(typeof first).toBe("boolean"); // total: always a boolean, never null/undefined
        expect(first).toBe(n >= 1); // exhaustive: aligned iff >= 1 link (BR-103)
        expect(second).toBe(first); // deterministic / idempotent
        expect(setAligned).toHaveBeenLastCalledWith(projectId, n >= 1);
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// P3 — Link idempotency (numRuns 100)
// ---------------------------------------------------------------------------

const goalIdsArb = fc.uniqueArray(fc.uuid(), { minLength: 0, maxLength: 10 });

describe("PBT P3 — link idempotency (set semantics via @@unique)", () => {
  it("linkProjectToGoals applied twice == once: no duplicate rows, no throw", async () => {
    await fc.assert(
      fc.asyncProperty(fc.uuid(), goalIdsArb, async (projectId, goalIds) => {
        const store = new Set<string>();
        const goalLinkRepo = {
          upsertLink: vi.fn().mockImplementation(async (goalId: string, pid: string, linkedBy: string) => {
            store.add(`${goalId}:${pid}`); // set insert — no duplicate key
            return { id: `${goalId}:${pid}`, goalId, projectId: pid, linkedBy, createdAt: "" };
          }),
          countByProject: vi.fn().mockResolvedValue(goalIds.length),
        };
        const goalRepo = { existsActiveById: vi.fn().mockResolvedValue(true) };
        const alignmentService = {
          evaluateAlignment: vi.fn().mockResolvedValue(goalIds.length >= 1),
        };
        const svc = new GoalLinkService(
          goalLinkRepo as never,
          goalRepo as never,
          alignmentService as never,
          makeEventBus() as never,
          makeAudit() as never,
        );

        await svc.linkProjectToGoals(projectId, goalIds, "user-1", CTX, "req-1");
        const afterOnce = new Set(store);

        await expect(
          svc.linkProjectToGoals(projectId, goalIds, "user-1", CTX, "req-1"),
        ).resolves.toBeDefined(); // second apply must not throw

        expect(store.size).toBe(afterOnce.size); // no new rows
        expect(store.size).toBe(new Set(goalIds).size); // exactly one row per distinct pair
      }),
      { numRuns: 100 },
    );
  });

  it("associateGoals applied twice == once: no duplicate PortfolioGoal rows, no throw", async () => {
    await fc.assert(
      fc.asyncProperty(fc.uuid(), goalIdsArb, async (portfolioId, goalIds) => {
        const store = new Set<string>();
        const portfolioRepo = {
          findByIdScoped: vi.fn().mockResolvedValue({
            id: portfolioId,
            name: "P",
            description: null,
            ownerId: "user-1",
            status: "Active",
            goalIds: [...store],
            createdAt: "",
            updatedAt: "",
          }),
          associateGoals: vi.fn().mockImplementation(async (pid: string, ids: string[]) => {
            for (const g of ids) store.add(`${pid}:${g}`);
          }),
        };
        const goalRepo = { existsActiveById: vi.fn().mockResolvedValue(true) };
        const svc = new PortfolioService(
          portfolioRepo as never,
          goalRepo as never,
          makeEventBus() as never,
          makeAudit() as never,
        );

        await svc.associateGoals(portfolioId, goalIds, CTX, "req-1");
        const afterOnce = new Set(store);

        await expect(
          svc.associateGoals(portfolioId, goalIds, CTX, "req-1"),
        ).resolves.toBeDefined();

        expect(store.size).toBe(afterOnce.size);
        expect(store.size).toBe(new Set(goalIds).size);
      }),
      { numRuns: 100 },
    );
  });
});
