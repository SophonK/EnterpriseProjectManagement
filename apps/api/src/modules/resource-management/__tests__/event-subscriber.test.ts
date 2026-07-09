import { describe, it, expect, vi } from "vitest";
import type { DomainEvent } from "@epm/shared";
import { PROJECT_EXECUTION_EVENTS } from "@epm/shared";
import { InMemoryIdempotencyLedger } from "../../../foundation/events/idempotency.js";
import { ResourceManagementEventSub } from "../events/resource-management-event.sub.js";

// ---------------------------------------------------------------------------
// H2 — the project.archived handler must FLAG allocations `archived` (so they are
// excluded from active utilization/capacity) and must NOT touch the
// overAllocatedConfirmed manager-confirmation flag.
// ---------------------------------------------------------------------------

function makeHarness() {
  const handlers = new Map<string, (e: DomainEvent<unknown>) => Promise<void>>();
  const eventBus = {
    publish: vi.fn(),
    subscribe: vi.fn((type: string, handler: (e: DomainEvent<unknown>) => Promise<void>) => {
      handlers.set(type, handler);
    }),
  };
  const prisma = {
    allocation: { updateMany: vi.fn().mockResolvedValue({ count: 3 }) },
  };
  const sub = new ResourceManagementEventSub(eventBus as never, prisma as never, new InMemoryIdempotencyLedger());
  return { handlers, prisma, sub };
}

function archivedEvent(projectId: string, eventId = "evt-arch-1"): DomainEvent<{ projectId: string }> {
  return {
    eventId,
    eventType: PROJECT_EXECUTION_EVENTS.PROJECT_ARCHIVED,
    occurredAt: new Date().toISOString(),
    source: "project-execution",
    data: { projectId },
  };
}

describe("ResourceManagementEventSub — project.archived (H2)", () => {
  it("flags the project's allocations archived and does NOT mutate overAllocatedConfirmed", async () => {
    const h = makeHarness();
    const handler = h.handlers.get(PROJECT_EXECUTION_EVENTS.PROJECT_ARCHIVED)!;
    await handler(archivedEvent("proj-1"));

    expect(h.prisma.allocation.updateMany).toHaveBeenCalledTimes(1);
    const arg = h.prisma.allocation.updateMany.mock.calls[0]![0] as {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    };
    expect(arg.where).toMatchObject({ projectId: "proj-1" });
    expect(arg.data.archived).toBe(true);
    expect(arg.data).not.toHaveProperty("overAllocatedConfirmed");
  });

  it("is idempotent — a replayed archived event does not double-apply", async () => {
    const h = makeHarness();
    const handler = h.handlers.get(PROJECT_EXECUTION_EVENTS.PROJECT_ARCHIVED)!;
    const evt = archivedEvent("proj-2", "evt-replay");
    await handler(evt);
    await handler(evt);
    expect(h.prisma.allocation.updateMany).toHaveBeenCalledTimes(1);
  });
});
