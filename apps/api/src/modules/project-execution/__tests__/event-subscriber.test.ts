import { describe, it, expect, vi, beforeEach } from "vitest";
import "../../../../../../packages/shared/src/errors/execution-error-codes.js";
import { InMemoryIdempotencyLedger } from "../../../foundation/events/idempotency.js";
import { ProjectExecutionEventSub } from "../events/project-execution-event.sub.js";
import type { DomainEvent } from "@epm/shared";

// ---------------------------------------------------------------------------
// Helpers / mocks
// ---------------------------------------------------------------------------

interface DemandPromotedPayload {
  demandId: string;
  name: string;
  portfolioId: string;
  programId?: string | null;
  plannedStart: string;
  plannedEnd: string;
  plannedBudget?: number | null;
}

function makeEvent<T>(data: T, eventId = "evt-1"): DomainEvent<T> {
  return {
    eventId,
    eventType: "demand-intake.demand.promoted",
    occurredAt: new Date().toISOString(),
    source: "demand-intake",
    data,
  };
}

function makeDemandPayload(overrides: Partial<DemandPromotedPayload> = {}): DemandPromotedPayload {
  return {
    demandId: "demand-1",
    name: "Test Project",
    portfolioId: "port-1",
    plannedStart: "2026-08-01",
    plannedEnd: "2027-01-31",
    ...overrides,
  };
}

function makeProjectDTO() {
  return { id: "proj-1", name: "Test Project", portfolioId: "port-1", status: "Open" };
}

// ---------------------------------------------------------------------------
// Task 6.3 — Idempotency: replaying the same DemandPromoted event must NOT
// create a duplicate project
// ---------------------------------------------------------------------------

describe("ProjectExecutionEventSub — idempotency (task 6.3)", () => {
  let handlers: Map<string, (e: DomainEvent<unknown>) => Promise<void>>;
  let projectService: { createProject: ReturnType<typeof vi.fn> };
  let rollupService: { recomputeRollup: ReturnType<typeof vi.fn> };
  let sub: ProjectExecutionEventSub;

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
    projectService = { createProject: vi.fn().mockResolvedValue(makeProjectDTO()) };
    rollupService = { recomputeRollup: vi.fn().mockResolvedValue(undefined) };

    // Inject InMemoryIdempotencyLedger so no Prisma needed
    sub = new ProjectExecutionEventSub(
      makeEventBus() as never,
      null as never,          // PrismaService — not used when ledger is injected
      projectService as never,
      rollupService as never,
      new InMemoryIdempotencyLedger(), // override ledger
    );
    sub.onModuleInit();
  });

  it("creates a project on first delivery of DemandPromoted", async () => {
    const handler = handlers.get("demand-intake.demand.promoted")!;
    await handler(makeEvent(makeDemandPayload()));
    expect(projectService.createProject).toHaveBeenCalledTimes(1);
  });

  it("does NOT create a duplicate on replay of the same event (same eventId)", async () => {
    const handler = handlers.get("demand-intake.demand.promoted")!;
    const event = makeEvent(makeDemandPayload(), "evt-replay-1");

    await handler(event); // first delivery
    await handler(event); // exact replay — same eventId

    expect(projectService.createProject).toHaveBeenCalledTimes(1);
  });

  it("creates a second project when eventId differs (different demand)", async () => {
    const handler = handlers.get("demand-intake.demand.promoted")!;

    await handler(makeEvent(makeDemandPayload({ demandId: "demand-A" }), "evt-A"));
    await handler(makeEvent(makeDemandPayload({ demandId: "demand-B" }), "evt-B"));

    expect(projectService.createProject).toHaveBeenCalledTimes(2);
  });

  it("triggers rollup recompute on StatusChanged", async () => {
    const handler = handlers.get("project-execution.project.status-changed")!;
    await handler({
      eventId: "evt-sc-1",
      eventType: "project-execution.project.status-changed",
      occurredAt: new Date().toISOString(),
      source: "project-execution",
      data: {
        projectId: "proj-1",
        portfolioId: "port-1",
        programId: "prog-1",
        status: "Active",
        health: "AtRisk",
        previousHealth: "OnTrack",
      },
    } as DomainEvent<unknown>);

    // Portfolio + program-level rollup both recomputed
    expect(rollupService.recomputeRollup).toHaveBeenCalledTimes(2);
  });
});
