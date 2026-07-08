import { describe, it, expect, vi } from "vitest";
import fc from "fast-check";
import { MilestoneService } from "../services/milestone.service.js";
import type { AuthContext, MilestoneDTO } from "@epm/shared";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CTX: AuthContext = { userId: "user-1", roles: ["PROJECT_MANAGER"], recordScopes: [] };

function makeProjectRepo() {
  return { findByIdOrThrow: vi.fn().mockResolvedValue({ id: "proj-1" }) };
}

function makeEventBus() {
  return { publish: vi.fn().mockResolvedValue(undefined), subscribe: vi.fn() };
}

function makeAuditService() {
  return { record: vi.fn().mockResolvedValue(undefined) };
}

function makeMilestoneDTO(overrides: Partial<MilestoneDTO> = {}): MilestoneDTO {
  return {
    id: "ms-1",
    projectId: "proj-1",
    title: "Test",
    description: null,
    dueDate: "2099-01-01",
    completedAt: null,
    overdue: false,
    sortOrder: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// PBT P4 — milestone overdue completeness
// ---------------------------------------------------------------------------

describe("PBT P4 — milestone overdue completeness", () => {
  it("overdue=true for any past dueDate with completedAt=null", async () => {
    await fc.assert(
      fc.asyncProperty(
        // A date strictly in the past
        fc.date({ min: new Date("2000-01-01"), max: new Date("2026-07-07") }),
        async (pastDate) => {
          const overdueDTO = makeMilestoneDTO({ dueDate: pastDate.toISOString().slice(0, 10), overdue: true });

          const milestoneRepo = {
            create: vi.fn().mockResolvedValue(overdueDTO),
            findByIdOrThrow: vi.fn(),
            update: vi.fn(),
            delete: vi.fn(),
            findByProject: vi.fn(),
          };

          const svc = new MilestoneService(
            milestoneRepo as never,
            makeProjectRepo() as never,
            makeEventBus() as never,
            makeAuditService() as never,
          );

          const dto = await svc.addMilestone(
            "proj-1",
            { title: "Past", dueDate: pastDate.toISOString().slice(0, 10), sortOrder: 0 },
            CTX,
            "req-1",
          );

          expect(dto.overdue).toBe(true);
        },
      ),
      { numRuns: 50 },
    );
  });

  it("overdue=false for any completedAt milestone regardless of dueDate", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.date({ min: new Date("2000-01-01"), max: new Date("2026-07-07") }),
        fc.date(),
        async (pastDate, completedAt) => {
          const completedDTO = makeMilestoneDTO({
            dueDate: pastDate.toISOString().slice(0, 10),
            completedAt: completedAt.toISOString(),
            overdue: false,
          });

          const milestoneRepo = {
            create: vi.fn().mockResolvedValue(completedDTO),
            findByIdOrThrow: vi.fn().mockResolvedValue(makeMilestoneDTO({ overdue: true })),
            update: vi.fn().mockResolvedValue(completedDTO),
            delete: vi.fn(),
            findByProject: vi.fn(),
          };

          const svc = new MilestoneService(
            milestoneRepo as never,
            makeProjectRepo() as never,
            makeEventBus() as never,
            makeAuditService() as never,
          );

          const dto = await svc.updateMilestone(
            "ms-1",
            "proj-1",
            { completedAt: completedAt.toISOString() },
            CTX,
            "req-1",
          );

          expect(dto.overdue).toBe(false);
        },
      ),
      { numRuns: 50 },
    );
  });
});

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

describe("MilestoneService", () => {
  it("publishes MilestoneOverdue on addMilestone with past dueDate", async () => {
    const eventBus = makeEventBus();
    const overdueDTO = makeMilestoneDTO({ overdue: true, dueDate: "2020-01-01" });
    const milestoneRepo = {
      create: vi.fn().mockResolvedValue(overdueDTO),
      findByIdOrThrow: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findByProject: vi.fn(),
    };

    const svc = new MilestoneService(
      milestoneRepo as never,
      makeProjectRepo() as never,
      eventBus as never,
      makeAuditService() as never,
    );

    await svc.addMilestone("proj-1", { title: "Past", dueDate: "2020-01-01", sortOrder: 0 }, CTX, "req-1");

    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "project-execution.milestone.overdue" }),
    );
  });

  it("does NOT publish overdue event for future dueDate", async () => {
    const eventBus = makeEventBus();
    const futureDTO = makeMilestoneDTO({ overdue: false, dueDate: "2099-01-01" });
    const milestoneRepo = {
      create: vi.fn().mockResolvedValue(futureDTO),
      findByIdOrThrow: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findByProject: vi.fn(),
    };

    const svc = new MilestoneService(
      milestoneRepo as never,
      makeProjectRepo() as never,
      eventBus as never,
      makeAuditService() as never,
    );

    await svc.addMilestone("proj-1", { title: "Future", dueDate: "2099-01-01", sortOrder: 0 }, CTX, "req-1");

    expect(eventBus.publish).not.toHaveBeenCalled();
  });
});
