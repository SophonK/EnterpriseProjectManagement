import { describe, it, expect, vi } from "vitest";
import "../../../../../../packages/shared/src/errors/strategy-error-codes.js";
import { InvestmentMixService } from "../services/investment-mix.service.js";
import type { AuthContext } from "@epm/shared";

const CTX: AuthContext = { userId: "user-1", roles: ["PORTFOLIO_MANAGER"], recordScopes: [] };

describe("InvestmentMixService.getInvestmentMix — BR-108 grouping semantics", () => {
  it("groupBy=portfolio: maps aggregation and resolves portfolio names", async () => {
    const viewRepo = {
      aggregateByPortfolio: vi.fn().mockResolvedValue([
        { groupId: "port-1", projectCount: 3, totalPlannedBudget: 300 },
        { groupId: "port-2", projectCount: 1, totalPlannedBudget: 0 },
      ]),
      aggregateByGoal: vi.fn(),
    };
    const portfolioRepo = {
      findMany: vi.fn().mockResolvedValue([
        { id: "port-1", name: "Growth" },
        { id: "port-2", name: "Ops" },
      ]),
    };
    const svc = new InvestmentMixService(
      viewRepo as never,
      { count: vi.fn() } as never,
      { listActive: vi.fn() } as never,
      portfolioRepo as never,
    );

    const result = await svc.getInvestmentMix("portfolio", CTX);

    expect(result).toEqual([
      { groupingType: "portfolio", groupId: "port-1", groupName: "Growth", projectCount: 3, totalPlannedBudget: 300 },
      { groupingType: "portfolio", groupId: "port-2", groupName: "Ops", projectCount: 1, totalPlannedBudget: 0 },
    ]);
    expect(viewRepo.aggregateByGoal).not.toHaveBeenCalled();
  });

  it("groupBy=portfolio: falls back to groupId when the portfolio name is unknown", async () => {
    const viewRepo = {
      aggregateByPortfolio: vi.fn().mockResolvedValue([
        { groupId: "port-orphan", projectCount: 2, totalPlannedBudget: 50 },
      ]),
      aggregateByGoal: vi.fn(),
    };
    const svc = new InvestmentMixService(
      viewRepo as never,
      { count: vi.fn() } as never,
      { listActive: vi.fn() } as never,
      { findMany: vi.fn().mockResolvedValue([]) } as never,
    );

    const result = await svc.getInvestmentMix("portfolio", CTX);
    expect(result[0]?.groupName).toBe("port-orphan");
    expect(result[0]?.totalPlannedBudget).toBe(50);
  });

  it("forwards the AuthContext to the repository so aggregation is record-scoped", async () => {
    const viewRepo = {
      aggregateByPortfolio: vi.fn().mockResolvedValue([]),
      aggregateByGoal: vi.fn().mockResolvedValue([]),
    };
    const svc = new InvestmentMixService(
      viewRepo as never,
      { count: vi.fn() } as never,
      { listActive: vi.fn().mockResolvedValue([]) } as never,
      { findMany: vi.fn().mockResolvedValue([]) } as never,
    );

    await svc.getInvestmentMix("portfolio", CTX);
    expect(viewRepo.aggregateByPortfolio).toHaveBeenCalledWith(CTX);

    await svc.getInvestmentMix("goal", CTX);
    expect(viewRepo.aggregateByGoal).toHaveBeenCalledWith(CTX);
  });

  it("groupBy=goal: maps link-expanded aggregation and resolves goal titles", async () => {
    const viewRepo = {
      aggregateByPortfolio: vi.fn(),
      aggregateByGoal: vi.fn().mockResolvedValue([
        { groupId: "g-1", projectCount: 2, totalPlannedBudget: 200 },
      ]),
    };
    const goalRepo = {
      listActive: vi.fn().mockResolvedValue([{ id: "g-1", title: "Reduce churn" }]),
    };
    const svc = new InvestmentMixService(
      viewRepo as never,
      { count: vi.fn() } as never,
      goalRepo as never,
      { findMany: vi.fn() } as never,
    );

    const result = await svc.getInvestmentMix("goal", CTX);

    expect(result).toEqual([
      { groupingType: "goal", groupId: "g-1", groupName: "Reduce churn", projectCount: 2, totalPlannedBudget: 200 },
    ]);
    expect(viewRepo.aggregateByPortfolio).not.toHaveBeenCalled();
  });
});
