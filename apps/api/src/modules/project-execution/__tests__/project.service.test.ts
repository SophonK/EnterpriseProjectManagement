import { describe, it, expect, vi, beforeEach } from "vitest";
import fc from "fast-check";
import "../../../../../../packages/shared/src/errors/execution-error-codes.js";
import { ProjectService } from "../services/project.service.js";
import type { AuthContext, ProjectStatus, ProjectHealth } from "@epm/shared";

// ---------------------------------------------------------------------------
// Helpers / mocks
// ---------------------------------------------------------------------------

function makeProjectDTO(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "proj-1",
    name: "Test",
    description: null,
    ownerUserId: "user-1",
    portfolioId: "port-1",
    programId: null,
    status: "Open" as ProjectStatus,
    health: "OnTrack" as ProjectHealth,
    plannedStart: "2026-08-01",
    plannedEnd: "2027-01-31",
    plannedBudget: null,
    archivedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeProjectRepo(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    create: vi.fn().mockResolvedValue(makeProjectDTO()),
    findById: vi.fn().mockResolvedValue(makeProjectDTO()),
    findByIdOrThrow: vi.fn().mockResolvedValue(makeProjectDTO()),
    findBySourceDemandId: vi.fn().mockResolvedValue(null),
    findMany: vi.fn().mockResolvedValue({ data: [], total: 0 }),
    update: vi.fn().mockResolvedValue(makeProjectDTO()),
    updateStatusHealth: vi.fn().mockResolvedValue(undefined),
    archive: vi.fn().mockResolvedValue(undefined),
    existsByNameInPortfolio: vi.fn().mockResolvedValue(false),
    ...overrides,
  };
}

function makeStatusUpdateRepo() {
  return {
    append: vi.fn().mockResolvedValue({
      id: "su-1", projectId: "proj-1", status: "Active", health: "OnTrack",
      note: null, recordedBy: "user-1", recordedAt: new Date().toISOString(),
    }),
    findByProject: vi.fn().mockResolvedValue([]),
  };
}

function makeEventBus() {
  return { publish: vi.fn().mockResolvedValue(undefined), subscribe: vi.fn() };
}

function makeAuditService() {
  return { record: vi.fn().mockResolvedValue(undefined) };
}

const CTX: AuthContext = { userId: "user-1", roles: ["PROJECT_MANAGER"], recordScopes: [] };

function makeService(repoOverrides: Partial<Record<string, unknown>> = {}) {
  return new ProjectService(
    makeProjectRepo(repoOverrides) as never,
    makeStatusUpdateRepo() as never,
    makeEventBus() as never,
    makeAuditService() as never,
  );
}

// ---------------------------------------------------------------------------
// PBT P1: date-range rejection — plannedEnd < plannedStart → EXECUTION_001
// ---------------------------------------------------------------------------

describe("PBT P1 — date-range validation: reject when end < start", () => {
  it("always throws EXECUTION_001 for any end-before-start pair", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.date({ min: new Date("2020-01-01"), max: new Date("2030-12-31") }),
        fc.nat({ max: 365 }),
        async (endDate, offsetDays) => {
          const startDate = new Date(endDate);
          startDate.setDate(startDate.getDate() + offsetDays + 1); // start strictly after end

          const svc = makeService({ existsByNameInPortfolio: vi.fn().mockResolvedValue(false) });
          await expect(
            svc.createProject(
              {
                name: "P",
                portfolioId: "port-1",
                plannedStart: startDate.toISOString().slice(0, 10),
                plannedEnd:   endDate.toISOString().slice(0, 10),
              },
              CTX,
              "req-1",
            ),
          ).rejects.toMatchObject({ code: "EXECUTION_001" });
        },
      ),
      { numRuns: 50 },
    );
  });
});

// ---------------------------------------------------------------------------
// PBT P2: date-range acceptance — plannedEnd >= plannedStart → succeeds
// ---------------------------------------------------------------------------

describe("PBT P2 — date-range validation: accept when end >= start", () => {
  it("never throws for any valid date range", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.date({ min: new Date("2020-01-01"), max: new Date("2030-12-31") }),
        fc.nat({ max: 730 }),
        async (startDate, offsetDays) => {
          const endDate = new Date(startDate);
          endDate.setDate(endDate.getDate() + offsetDays);

          const svc = makeService({ existsByNameInPortfolio: vi.fn().mockResolvedValue(false) });
          await expect(
            svc.createProject(
              {
                name: "P",
                portfolioId: "port-1",
                plannedStart: startDate.toISOString().slice(0, 10),
                plannedEnd:   endDate.toISOString().slice(0, 10),
              },
              CTX,
              "req-1",
            ),
          ).resolves.toBeDefined();
        },
      ),
      { numRuns: 50 },
    );
  });
});

// ---------------------------------------------------------------------------
// PBT P5: status transition completeness
// ---------------------------------------------------------------------------

const ALL_STATUSES: ProjectStatus[] = ["Open", "Active", "Completed", "Cancelled"];

const VALID_TRANSITIONS: Array<[ProjectStatus, ProjectStatus]> = [
  ["Open",   "Active"],
  ["Active", "Completed"],
  ["Active", "Cancelled"],
];

const INVALID_TRANSITIONS: Array<[ProjectStatus, ProjectStatus]> = ALL_STATUSES.flatMap((from) =>
  ALL_STATUSES
    .filter((to) => !VALID_TRANSITIONS.some(([f, t]) => f === from && t === to))
    .map((to): [ProjectStatus, ProjectStatus] => [from, to]),
);

describe("PBT P5 — status transition completeness", () => {
  it.each(INVALID_TRANSITIONS)(
    "invalid: %s → %s throws EXECUTION_003",
    async (from, to) => {
      const svc = makeService({
        findByIdOrThrow: vi.fn().mockResolvedValue(makeProjectDTO({ status: from })),
      });
      await expect(
        svc.updateStatusHealth("proj-1", { status: to, health: "OnTrack" }, CTX, "req-1"),
      ).rejects.toMatchObject({ code: "EXECUTION_003" });
    },
  );

  it.each(VALID_TRANSITIONS)(
    "valid: %s → %s succeeds",
    async (from, to) => {
      const svc = makeService({
        findByIdOrThrow: vi.fn().mockResolvedValue(makeProjectDTO({ status: from })),
        updateStatusHealth: vi.fn().mockResolvedValue(undefined),
      });
      await expect(
        svc.updateStatusHealth("proj-1", { status: to, health: "OnTrack" }, CTX, "req-1"),
      ).resolves.toBeDefined();
    },
  );
});

// ---------------------------------------------------------------------------
// Unit tests — core service behaviours
// ---------------------------------------------------------------------------

describe("ProjectService.createProject", () => {
  it("returns existing project if sourceDemandId already used (idempotency)", async () => {
    const existing = makeProjectDTO({ id: "proj-existing" });
    const svc = makeService({ findBySourceDemandId: vi.fn().mockResolvedValue(existing) });
    const result = await svc.createProject(
      { name: "X", portfolioId: "port-1", plannedStart: "2026-08-01", plannedEnd: "2027-01-01", sourceDemandId: "demand-1" },
      CTX,
      "req-1",
    );
    expect(result.id).toBe("proj-existing");
  });

  it("throws EXECUTION_004 on duplicate name within portfolio", async () => {
    const svc = makeService({ existsByNameInPortfolio: vi.fn().mockResolvedValue(true) });
    await expect(
      svc.createProject(
        { name: "Dup", portfolioId: "port-1", plannedStart: "2026-08-01", plannedEnd: "2027-01-01" },
        CTX,
        "req-1",
      ),
    ).rejects.toMatchObject({ code: "EXECUTION_004" });
  });

  it("writes audit entry and publishes ProjectCreated event on success", async () => {
    const projectRepo = makeProjectRepo();
    const statusUpdateRepo = makeStatusUpdateRepo();
    const eventBus = makeEventBus();
    const auditService = makeAuditService();
    const svc = new ProjectService(
      projectRepo as never, statusUpdateRepo as never,
      eventBus as never, auditService as never,
    );

    await svc.createProject(
      { name: "New", portfolioId: "port-1", plannedStart: "2026-08-01", plannedEnd: "2027-01-01" },
      CTX,
      "req-1",
    );

    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "create", entityType: "project" }),
    );
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "project-execution.project.created" }),
    );
  });
});

describe("ProjectService.updateProject", () => {
  it("throws EXECUTION_001 when patched dates produce invalid range", async () => {
    const svc = makeService({
      findByIdOrThrow: vi.fn().mockResolvedValue(makeProjectDTO({
        plannedStart: "2026-08-01",
        plannedEnd:   "2027-01-31",
      })),
    });
    await expect(
      svc.updateProject("proj-1", { plannedEnd: "2026-07-01" }, CTX, "req-1"),
    ).rejects.toMatchObject({ code: "EXECUTION_001" });
  });
});

describe("ProjectService.updateStatusHealth", () => {
  it("publishes StatusChanged event with previousHealth", async () => {
    const eventBus = makeEventBus();
    const projectRepo = makeProjectRepo({
      findByIdOrThrow: vi.fn().mockResolvedValue(makeProjectDTO({ status: "Open", health: "OnTrack" })),
    });
    const svc = new ProjectService(
      projectRepo as never, makeStatusUpdateRepo() as never,
      eventBus as never, makeAuditService() as never,
    );

    await svc.updateStatusHealth("proj-1", { status: "Active", health: "AtRisk" }, CTX, "req-1");

    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "project-execution.project.status-changed",
        data: expect.objectContaining({ previousHealth: "OnTrack", health: "AtRisk" }),
      }),
    );
  });
});
