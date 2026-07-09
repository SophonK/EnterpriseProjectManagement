import { describe, it, expect, vi } from "vitest";
import "../../../../../../packages/shared/src/errors/strategy-error-codes.js";
import { GoalLinkService } from "../services/goal-link.service.js";
import type { AuthContext } from "@epm/shared";

const CTX: AuthContext = { userId: "user-1", roles: ["PORTFOLIO_MANAGER"], recordScopes: [] };

function makeGoalLinkRepo(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    upsertLink: vi.fn().mockImplementation(async (goalId: string, projectId: string, linkedBy: string) => ({
      id: `${goalId}:${projectId}`,
      goalId,
      projectId,
      linkedBy,
      createdAt: new Date().toISOString(),
    })),
    delete: vi.fn().mockResolvedValue("proj-1"),
    countByProject: vi.fn().mockResolvedValue(1),
    ...overrides,
  };
}

function makeGoalRepo(overrides: Partial<Record<string, unknown>> = {}) {
  return { existsActiveById: vi.fn().mockResolvedValue(true), ...overrides };
}

function makeAlignmentService() {
  return { evaluateAlignment: vi.fn().mockResolvedValue(true) };
}

function makeEventBus() {
  return { publish: vi.fn().mockResolvedValue(undefined), subscribe: vi.fn() };
}

function makeAudit() {
  return { record: vi.fn().mockResolvedValue(undefined) };
}

describe("GoalLinkService.linkProjectToGoals — BR-107", () => {
  it("upserts a link per goal, recomputes alignment, audits and publishes linked-to-goal", async () => {
    const goalLinkRepo = makeGoalLinkRepo();
    const alignment = makeAlignmentService();
    const eventBus = makeEventBus();
    const audit = makeAudit();
    const svc = new GoalLinkService(
      goalLinkRepo as never,
      makeGoalRepo() as never,
      alignment as never,
      eventBus as never,
      audit as never,
    );

    const links = await svc.linkProjectToGoals("proj-1", ["g-1", "g-2"], "user-1", CTX, "req-1");

    expect(links).toHaveLength(2);
    expect(goalLinkRepo.upsertLink).toHaveBeenCalledTimes(2);
    expect(alignment.evaluateAlignment).toHaveBeenCalledWith("proj-1");
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "create", entityType: "goal-link" }),
    );
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "strategy-portfolio.project.linked-to-goal",
        data: expect.objectContaining({ projectId: "proj-1", goalIds: ["g-1", "g-2"], linkedBy: "user-1" }),
      }),
    );
  });

  it("is a no-op for empty goalIds (no upsert, no publish)", async () => {
    const goalLinkRepo = makeGoalLinkRepo();
    const eventBus = makeEventBus();
    const svc = new GoalLinkService(
      goalLinkRepo as never,
      makeGoalRepo() as never,
      makeAlignmentService() as never,
      eventBus as never,
      makeAudit() as never,
    );

    const links = await svc.linkProjectToGoals("proj-1", [], "user-1", CTX, "req-1");

    expect(links).toEqual([]);
    expect(goalLinkRepo.upsertLink).not.toHaveBeenCalled();
    expect(eventBus.publish).not.toHaveBeenCalled();
  });

  it("throws STRATEGY_002 when a goal does not exist", async () => {
    const svc = new GoalLinkService(
      makeGoalLinkRepo() as never,
      makeGoalRepo({ existsActiveById: vi.fn().mockResolvedValue(false) }) as never,
      makeAlignmentService() as never,
      makeEventBus() as never,
      makeAudit() as never,
    );

    await expect(
      svc.linkProjectToGoals("proj-1", ["missing"], "user-1", CTX, "req-1"),
    ).rejects.toMatchObject({ code: "STRATEGY_002" });
  });

  it("rejects linking an Archived (non-Active) goal with STRATEGY_002 and never upserts", async () => {
    const goalLinkRepo = makeGoalLinkRepo();
    // existsActiveById is false for an Archived goal (it exists but is not Active).
    const svc = new GoalLinkService(
      goalLinkRepo as never,
      makeGoalRepo({ existsActiveById: vi.fn().mockResolvedValue(false) }) as never,
      makeAlignmentService() as never,
      makeEventBus() as never,
      makeAudit() as never,
    );

    await expect(
      svc.linkProjectToGoals("proj-1", ["archived-goal"], "user-1", CTX, "req-1"),
    ).rejects.toMatchObject({ code: "STRATEGY_002" });
    expect(goalLinkRepo.upsertLink).not.toHaveBeenCalled();
  });
});

describe("GoalLinkService.unlinkGoal", () => {
  it("deletes the link, recomputes alignment for the freed project, and audits", async () => {
    // delete() returns the projectId the deleted link belonged to.
    const goalLinkRepo = makeGoalLinkRepo({ delete: vi.fn().mockResolvedValue("proj-42") });
    const alignment = makeAlignmentService();
    const audit = makeAudit();
    const svc = new GoalLinkService(
      goalLinkRepo as never,
      makeGoalRepo() as never,
      alignment as never,
      makeEventBus() as never,
      audit as never,
    );

    await svc.unlinkGoal("link-1", CTX, "req-1");

    expect(goalLinkRepo.delete).toHaveBeenCalledWith("link-1");
    // H1: alignment must be re-evaluated for the project whose link was removed so a
    // project losing its last link becomes unaligned (and, if active, is flagged).
    expect(alignment.evaluateAlignment).toHaveBeenCalledWith("proj-42");
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "delete", entityType: "goal-link" }),
    );
  });
});
