import { describe, it, expect, vi, beforeEach } from "vitest";
import "../../../../../../packages/shared/src/errors/strategy-error-codes.js";
import { InMemoryIdempotencyLedger } from "../../../foundation/events/idempotency.js";
import { ProjectAlignmentProjector } from "../events/strategy-portfolio-event.sub.js";
import type {
  DomainEvent,
  ProjectCreatedPayload,
  StatusChangedPayload,
} from "@epm/shared";

// ---------------------------------------------------------------------------
// Helpers / mocks
// ---------------------------------------------------------------------------

function makeCreatedEvent(
  overrides: Partial<ProjectCreatedPayload> = {},
  eventId = "evt-created-1",
  occurredAt = "2026-07-01T00:00:00.000Z",
): DomainEvent<ProjectCreatedPayload> {
  return {
    eventId,
    eventType: "project-execution.project.created",
    occurredAt,
    source: "project-execution",
    data: {
      projectId: "proj-1",
      portfolioId: "port-1",
      programId: null,
      name: "Test Project",
      ownerUserId: "user-1",
      ...overrides,
    },
  };
}

function makeStatusChangedEvent(
  overrides: Partial<StatusChangedPayload> = {},
  eventId = "evt-status-1",
  occurredAt = "2026-07-02T00:00:00.000Z",
): DomainEvent<StatusChangedPayload> {
  return {
    eventId,
    eventType: "project-execution.project.status-changed",
    occurredAt,
    source: "project-execution",
    data: {
      projectId: "proj-1",
      portfolioId: "port-1",
      programId: null,
      status: "Active",
      health: "OnTrack",
      previousStatus: "Open",
      previousHealth: "OnTrack",
      ...overrides,
    },
  };
}

// ---------------------------------------------------------------------------
// Task 6.3 — projection idempotency + out-of-order (stale lastEventAt) tolerance
// ---------------------------------------------------------------------------

describe("ProjectAlignmentProjector — idempotency & order tolerance (task 6.3)", () => {
  let handlers: Map<string, (e: DomainEvent<unknown>) => Promise<void>>;
  let viewRepo: {
    upsertByProjectId: ReturnType<typeof vi.fn>;
    findByProject: ReturnType<typeof vi.fn>;
  };
  let alignmentService: { evaluateAlignment: ReturnType<typeof vi.fn> };
  let projector: ProjectAlignmentProjector;

  function makeEventBus() {
    return {
      publish: vi.fn(),
      subscribe: vi.fn((type: string, handler: (e: DomainEvent<unknown>) => Promise<void>) => {
        handlers.set(type, handler);
      }),
    };
  }

  beforeEach(() => {
    handlers = new Map();
    viewRepo = {
      // Default: projection write applied (fresh event).
      upsertByProjectId: vi.fn().mockResolvedValue(true),
      findByProject: vi.fn().mockResolvedValue(null),
    };
    alignmentService = { evaluateAlignment: vi.fn().mockResolvedValue(false) };

    // Inject InMemoryIdempotencyLedger so no Prisma is needed.
    projector = new ProjectAlignmentProjector(
      makeEventBus() as never,
      null as never, // PrismaService — unused when ledger is injected
      viewRepo as never,
      alignmentService as never,
      new InMemoryIdempotencyLedger(),
    );
    projector.onModuleInit();
  });

  it("subscribes to both execution events", () => {
    expect(handlers.has("project-execution.project.created")).toBe(true);
    expect(handlers.has("project-execution.project.status-changed")).toBe(true);
  });

  it("projects the view and evaluates alignment on first delivery of project.created", async () => {
    const handler = handlers.get("project-execution.project.created")!;
    await handler(makeCreatedEvent());

    expect(viewRepo.upsertByProjectId).toHaveBeenCalledTimes(1);
    expect(viewRepo.upsertByProjectId).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "proj-1", name: "Test Project", status: "Open" }),
      new Date("2026-07-01T00:00:00.000Z"),
    );
    expect(alignmentService.evaluateAlignment).toHaveBeenCalledTimes(1);
  });

  it("does NOT re-project or re-evaluate on replay of the same event (same eventId)", async () => {
    const handler = handlers.get("project-execution.project.created")!;
    const event = makeCreatedEvent({}, "evt-replay-1");

    await handler(event); // first delivery
    await handler(event); // exact replay — same eventId

    expect(viewRepo.upsertByProjectId).toHaveBeenCalledTimes(1);
    expect(alignmentService.evaluateAlignment).toHaveBeenCalledTimes(1);
  });

  it("mirrors the new status on project.status-changed and evaluates alignment", async () => {
    const handler = handlers.get("project-execution.project.status-changed")!;
    await handler(makeStatusChangedEvent());

    expect(viewRepo.upsertByProjectId).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "proj-1", status: "Active" }),
      new Date("2026-07-02T00:00:00.000Z"),
    );
    expect(alignmentService.evaluateAlignment).toHaveBeenCalledTimes(1);
  });

  it("skips alignment when a stale (out-of-order) event is a guarded no-op", async () => {
    // Repo reports the write was NOT applied (incoming lastEventAt older than stored).
    viewRepo.upsertByProjectId.mockResolvedValue(false);

    const handler = handlers.get("project-execution.project.status-changed")!;
    await handler(makeStatusChangedEvent({}, "evt-stale-1", "2020-01-01T00:00:00.000Z"));

    expect(viewRepo.upsertByProjectId).toHaveBeenCalledTimes(1);
    expect(alignmentService.evaluateAlignment).not.toHaveBeenCalled();
  });

  it("preserves the existing projected name when status-changed arrives without one", async () => {
    viewRepo.findByProject.mockResolvedValue({
      projectId: "proj-1",
      name: "Existing Name",
      status: "Open",
      plannedBudget: 1000,
      portfolioId: "port-1",
      programId: null,
      aligned: false,
      lastEventAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z",
    });

    const handler = handlers.get("project-execution.project.status-changed")!;
    await handler(makeStatusChangedEvent());

    expect(viewRepo.upsertByProjectId).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Existing Name", plannedBudget: 1000, status: "Active" }),
      expect.any(Date),
    );
  });
});
