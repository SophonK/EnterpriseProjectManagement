import { describe, it, expect, vi } from "vitest";
import "../../../../../../packages/shared/src/errors/strategy-error-codes.js";
import { AppError } from "@epm/shared";
import { ProgramService } from "../services/program.service.js";
import type { AuthContext, ProgramDTO } from "@epm/shared";

const CTX: AuthContext = { userId: "user-1", roles: ["PORTFOLIO_MANAGER"], recordScopes: [] };

function makeProgramDTO(): ProgramDTO {
  return {
    id: "prog-1",
    portfolioId: "port-1",
    name: "Prog",
    description: null,
    status: "Active",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function makeProgramRepo(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    create: vi.fn().mockResolvedValue(makeProgramDTO()),
    listByPortfolio: vi.fn().mockResolvedValue([]),
    existsById: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

function makePortfolioRepo(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    findByIdScoped: vi.fn().mockResolvedValue({ id: "port-1", ownerId: "user-1" }),
    ...overrides,
  };
}

function makeEventBus() {
  return { publish: vi.fn().mockResolvedValue(undefined), subscribe: vi.fn() };
}

function makeAudit() {
  return { record: vi.fn().mockResolvedValue(undefined) };
}

describe("ProgramService.createProgram — BR-105 program requires a parent portfolio", () => {
  it("creates the program and publishes strategy-portfolio.program.created when parent exists", async () => {
    const programRepo = makeProgramRepo();
    const eventBus = makeEventBus();
    const svc = new ProgramService(
      programRepo as never,
      makePortfolioRepo() as never,
      eventBus as never,
      makeAudit() as never,
    );

    await svc.createProgram("port-1", { name: "Prog" }, CTX, "req-1");

    expect(programRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ portfolioId: "port-1", name: "Prog" }),
    );
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "strategy-portfolio.program.created",
        data: expect.objectContaining({ programId: "prog-1", portfolioId: "port-1" }),
      }),
    );
  });

  it("rejects with STRATEGY_003 when the parent portfolio does not exist / is out of scope", async () => {
    const programRepo = makeProgramRepo();
    const svc = new ProgramService(
      programRepo as never,
      makePortfolioRepo({
        findByIdScoped: vi.fn().mockRejectedValue(new AppError("STRATEGY_003", "Portfolio not found")),
      }) as never,
      makeEventBus() as never,
      makeAudit() as never,
    );

    await expect(
      svc.createProgram("missing", { name: "Prog" }, CTX, "req-1"),
    ).rejects.toMatchObject({ code: "STRATEGY_003" });
    expect(programRepo.create).not.toHaveBeenCalled();
  });
});

describe("ProgramService.programExists — REL-SP-04 graceful degradation", () => {
  it("returns the repository result when the check succeeds", async () => {
    const svc = new ProgramService(
      makeProgramRepo({ existsById: vi.fn().mockResolvedValue(true) }) as never,
      makePortfolioRepo() as never,
      makeEventBus() as never,
      makeAudit() as never,
    );
    await expect(svc.programExists("prog-1")).resolves.toBe(true);
  });

  it("fails open (returns true) when the repository throws", async () => {
    const svc = new ProgramService(
      makeProgramRepo({ existsById: vi.fn().mockRejectedValue(new Error("db down")) }) as never,
      makePortfolioRepo() as never,
      makeEventBus() as never,
      makeAudit() as never,
    );
    await expect(svc.programExists("prog-1")).resolves.toBe(true);
  });
});
