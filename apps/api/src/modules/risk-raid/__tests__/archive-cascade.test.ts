import { describe, it, expect, vi } from "vitest";
import { SYSTEM_ACTOR_ID, PROJECT_EXECUTION_EVENTS } from "@epm/shared";
import type { DomainEvent, ProjectArchivedPayload } from "@epm/shared";
import { RaidItemRepository } from "../repositories/raid-item.repository.js";
import { RiskRaidEventSub } from "../events/risk-raid-event.sub.js";
import { InMemoryIdempotencyLedger } from "../../../foundation/events/idempotency.js";

// ---------------------------------------------------------------------------
// BR-8 archive cascade — closeAllForProject closes items with actor = SYSTEM_ACTOR_ID
// (not the "system" literal) and emits one audit row per closed item, wired through
// RiskRaidEventSub in a single transaction.
// ---------------------------------------------------------------------------

const OPEN_ROWS = [
  {
    id: "r1", projectId: "p1", type: "Risk", title: "R1", description: null,
    severity: 4, probability: 4, riskScore: 16, status: "Open", escalated: true,
    ownerUserId: null, mitigation: null, closedBy: null, closedAt: null,
    createdBy: "u1", createdAt: new Date(), updatedAt: new Date(),
  },
  {
    id: "r2", projectId: "p1", type: "Issue", title: "R2", description: null,
    severity: null, probability: null, riskScore: null, status: "InProgress", escalated: false,
    ownerUserId: null, mitigation: null, closedBy: null, closedAt: null,
    createdBy: "u1", createdAt: new Date(), updatedAt: new Date(),
  },
];

function makePrismaWithRows(rows: unknown[]) {
  const updateMany = vi.fn().mockResolvedValue({ count: rows.length });
  const findMany = vi.fn().mockResolvedValue(rows);
  const prisma = {
    raidItem: { findMany, updateMany },
    // repo calls this.prisma.$transaction(run) — run receives the tx client (the prisma stub itself)
    $transaction: vi.fn((arg: unknown) =>
      typeof arg === "function"
        ? (arg as (tx: unknown) => Promise<unknown>)(prisma)
        : Promise.all(arg as Promise<unknown>[]),
    ),
  };
  return { prisma, findMany, updateMany };
}

describe("RaidItemRepository.closeAllForProject", () => {
  it("closes with SYSTEM_ACTOR_ID and returns before/after pairs", async () => {
    const { prisma, updateMany } = makePrismaWithRows(OPEN_ROWS);
    const repo = new RaidItemRepository(prisma as never);

    const closedAt = new Date("2026-01-01T00:00:00Z");
    const pairs = await repo.closeAllForProject("p1", closedAt);

    // the bulk update must use the SYSTEM_ACTOR_ID sentinel, not the "system" literal
    const updateArg = updateMany.mock.calls[0]![0] as { data: { closedBy: string; status: string } };
    expect(updateArg.data.closedBy).toBe(SYSTEM_ACTOR_ID);
    expect(updateArg.data.status).toBe("Closed");

    expect(pairs).toHaveLength(2);
    expect(pairs[0]!.before.status).toBe("Open");
    expect(pairs[0]!.after.status).toBe("Closed");
    expect(pairs[0]!.after.closedBy).toBe(SYSTEM_ACTOR_ID);
  });

  it("returns an empty list (no update) when nothing is open", async () => {
    const { prisma, updateMany } = makePrismaWithRows([]);
    const repo = new RaidItemRepository(prisma as never);

    const pairs = await repo.closeAllForProject("p1", new Date());

    expect(pairs).toEqual([]);
    expect(updateMany).not.toHaveBeenCalled();
  });
});

describe("RiskRaidEventSub — project.archived audit wiring", () => {
  function makeSub(pairs: Array<{ before: unknown; after: unknown }>) {
    const handlers: Record<string, (e: DomainEvent<unknown>) => Promise<void>> = {};
    const eventBus = {
      subscribe: vi.fn((type: string, handler: (e: DomainEvent<unknown>) => Promise<void>) => {
        handlers[type] = handler;
      }),
      publish: vi.fn(),
    };
    const prisma = {
      $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
    };
    const raidItemRepo = { closeAllForProject: vi.fn().mockResolvedValue(pairs) };
    const auditService = { record: vi.fn().mockResolvedValue(undefined) };
    new RiskRaidEventSub(
      eventBus as never,
      prisma as never,
      raidItemRepo as never,
      auditService as never,
      new InMemoryIdempotencyLedger(),
    );
    return { handlers, raidItemRepo, auditService };
  }

  it("emits one audit row per closed item with actor SYSTEM_ACTOR_ID and action update", async () => {
    const pairs = [
      { before: { id: "r1" }, after: { id: "r1", status: "Closed" } },
      { before: { id: "r2" }, after: { id: "r2", status: "Closed" } },
    ];
    const { handlers, raidItemRepo, auditService } = makeSub(pairs);

    const event: DomainEvent<ProjectArchivedPayload> = {
      eventId: "evt-1",
      eventType: PROJECT_EXECUTION_EVENTS.PROJECT_ARCHIVED,
      occurredAt: new Date().toISOString(),
      source: "project-execution",
      data: { projectId: "p1", portfolioId: "pf1", programId: null },
    };

    await handlers[PROJECT_EXECUTION_EVENTS.PROJECT_ARCHIVED]!(event as DomainEvent<unknown>);

    expect(raidItemRepo.closeAllForProject).toHaveBeenCalledWith("p1", expect.any(Date), expect.anything());
    expect(auditService.record).toHaveBeenCalledTimes(2);
    for (const call of auditService.record.mock.calls) {
      const input = call[0] as { actorId: string; action: string; entityType: string };
      expect(input.actorId).toBe(SYSTEM_ACTOR_ID);
      expect(input.action).toBe("update");
      expect(input.entityType).toBe("RaidItem");
      // audit must be written inside the transaction (tx client passed as 2nd arg)
      expect(call[1]).toBeDefined();
    }
  });
});
