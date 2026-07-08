import { describe, it, expect, vi } from "vitest";
import "../../../../../../packages/shared/src/errors/strategy-error-codes.js";
import { StrategicGoalService } from "../services/strategic-goal.service.js";
import type { AuthContext, StrategicGoalDTO } from "@epm/shared";

const CTX: AuthContext = { userId: "dir-1", roles: ["EPMO_DIRECTOR"], recordScopes: [] };

function makeGoalDTO(): StrategicGoalDTO {
  return {
    id: "goal-1",
    title: "Grow ARR",
    description: "Increase annual recurring revenue",
    measure: "+20% YoY",
    status: "Active",
    createdBy: "dir-1",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function makeGoalRepo(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    create: vi.fn().mockResolvedValue(makeGoalDTO()),
    listActive: vi.fn().mockResolvedValue([]),
    findByIdOrThrow: vi.fn().mockResolvedValue(makeGoalDTO()),
    archive: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeAudit() {
  return { record: vi.fn().mockResolvedValue(undefined) };
}

describe("StrategicGoalService.createGoal — BR-101 required fields", () => {
  it("persists the goal with createdBy from AuthContext and audits", async () => {
    const repo = makeGoalRepo();
    const audit = makeAudit();
    const svc = new StrategicGoalService(repo as never, audit as never);

    await svc.createGoal(
      { title: "Grow ARR", description: "Increase ARR", measure: "+20%" },
      CTX,
      "req-1",
    );

    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ createdBy: "dir-1" }));
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "create", entityType: "strategic-goal" }),
    );
  });

  it("rejects with STRATEGY_001 when a required field is blank", async () => {
    const repo = makeGoalRepo();
    const svc = new StrategicGoalService(repo as never, makeAudit() as never);

    await expect(
      svc.createGoal({ title: "  ", description: "d", measure: "m" }, CTX, "req-1"),
    ).rejects.toMatchObject({ code: "STRATEGY_001" });
    expect(repo.create).not.toHaveBeenCalled();
  });
});

describe("StrategicGoalService.archiveGoal", () => {
  it("archives an existing goal and audits the state change", async () => {
    const repo = makeGoalRepo();
    const audit = makeAudit();
    const svc = new StrategicGoalService(repo as never, audit as never);

    await svc.archiveGoal("goal-1", CTX, "req-1");

    expect(repo.archive).toHaveBeenCalledWith("goal-1");
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "update", entityType: "strategic-goal" }),
    );
  });
});
