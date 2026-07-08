import { describe, it, expect, vi } from "vitest";
import "../../../../../../packages/shared/src/errors/strategy-error-codes.js";
import { PortfolioService } from "../services/portfolio.service.js";
import type { AuthContext, PortfolioDTO } from "@epm/shared";

const CTX: AuthContext = { userId: "user-1", roles: ["PORTFOLIO_MANAGER"], recordScopes: [] };

function makePortfolioDTO(overrides: Partial<PortfolioDTO> = {}): PortfolioDTO {
  return {
    id: "port-1",
    name: "P",
    description: null,
    ownerId: "user-1",
    status: "Active",
    goalIds: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makePortfolioRepo(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    create: vi.fn().mockResolvedValue(makePortfolioDTO()),
    findByIdScoped: vi.fn().mockResolvedValue(makePortfolioDTO()),
    findMany: vi.fn().mockResolvedValue([]),
    associateGoals: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeGoalRepo(overrides: Partial<Record<string, unknown>> = {}) {
  return { existsById: vi.fn().mockResolvedValue(true), ...overrides };
}

function makeEventBus() {
  return { publish: vi.fn().mockResolvedValue(undefined), subscribe: vi.fn() };
}

function makeAudit() {
  return { record: vi.fn().mockResolvedValue(undefined) };
}

describe("PortfolioService.createPortfolio — BR-102 owner = creator", () => {
  it("sets ownerId from AuthContext (client cannot override) and returns the portfolio", async () => {
    const repo = makePortfolioRepo();
    const svc = new PortfolioService(
      repo as never,
      makeGoalRepo() as never,
      makeEventBus() as never,
      makeAudit() as never,
    );

    await svc.createPortfolio({ name: "Growth" }, CTX, "req-1");

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Growth", ownerId: "user-1" }),
    );
  });

  it("writes an audit entry and publishes strategy-portfolio.portfolio.created", async () => {
    const eventBus = makeEventBus();
    const audit = makeAudit();
    const svc = new PortfolioService(
      makePortfolioRepo() as never,
      makeGoalRepo() as never,
      eventBus as never,
      audit as never,
    );

    await svc.createPortfolio({ name: "Growth" }, CTX, "req-1");

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "create", entityType: "portfolio" }),
    );
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "strategy-portfolio.portfolio.created",
        data: expect.objectContaining({ portfolioId: "port-1", ownerId: "user-1" }),
      }),
    );
  });
});

describe("PortfolioService.associateGoals — BR-106 idempotent association", () => {
  it("upserts the join (idempotent) and returns the refreshed portfolio", async () => {
    const repo = makePortfolioRepo({
      findByIdScoped: vi
        .fn()
        .mockResolvedValueOnce(makePortfolioDTO())
        .mockResolvedValueOnce(makePortfolioDTO({ goalIds: ["g-1", "g-2"] })),
    });
    const svc = new PortfolioService(
      repo as never,
      makeGoalRepo() as never,
      makeEventBus() as never,
      makeAudit() as never,
    );

    const result = await svc.associateGoals("port-1", ["g-1", "g-2"], CTX, "req-1");

    expect(repo.associateGoals).toHaveBeenCalledWith("port-1", ["g-1", "g-2"]);
    expect(result.goalIds).toEqual(["g-1", "g-2"]);
  });

  it("throws STRATEGY_002 when a goal does not exist", async () => {
    const svc = new PortfolioService(
      makePortfolioRepo() as never,
      makeGoalRepo({ existsById: vi.fn().mockResolvedValue(false) }) as never,
      makeEventBus() as never,
      makeAudit() as never,
    );

    await expect(
      svc.associateGoals("port-1", ["missing"], CTX, "req-1"),
    ).rejects.toMatchObject({ code: "STRATEGY_002" });
  });
});
