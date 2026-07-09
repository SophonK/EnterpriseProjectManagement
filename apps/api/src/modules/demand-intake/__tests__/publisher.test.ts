/**
 * Phase 6 — publisher tests (D3-7: demand-intake PUBLISHES only, no subscriber).
 *
 * demand-intake has no dedicated publisher/registration file: its Wave-4 services publish
 * the four `demand-intake.demand.*` events DIRECTLY via `eventBus.publish` (the same pattern
 * as strategy-portfolio). These tests drive each publishing service with a mock EVENT_BUS
 * that captures the emitted DomainEvent envelopes and assert the exact `event.data` payload
 * and event-type constant for each of the four publications.
 */
import { describe, it, expect, vi } from "vitest";
import "../../../../../../packages/shared/src/errors/demand-error-codes.js";
import {
  DEMAND_INTAKE_EVENTS,
  isValidEventType,
  type AuthContext,
  type DemandRequestDTO,
  type DomainEvent,
} from "@epm/shared";
import { DemandRequestService } from "../services/demand-request.service.js";
import { StageGateService } from "../services/stage-gate.service.js";
import { PromotionService } from "../services/promotion.service.js";

const CTX: AuthContext = { userId: "user-1", roles: ["PORTFOLIO_MANAGER"], recordScopes: [] };

function makeDemandDTO(overrides: Partial<DemandRequestDTO> = {}): DemandRequestDTO {
  return {
    id: "demand-1",
    title: "New CRM",
    sponsor: "VP Sales",
    description: "Replace legacy CRM",
    expectedValue: null,
    status: "Submitted",
    currentGate: "Submitted",
    rejectionReason: null,
    submittedBy: "user-1",
    submittedAt: new Date().toISOString(),
    promotedProjectId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

/** Mock EventBus that records every published event for exact-payload assertions. */
function makeCapturingBus() {
  const published: DomainEvent<Record<string, unknown>>[] = [];
  return {
    published,
    bus: {
      publish: vi.fn(async (event: DomainEvent<Record<string, unknown>>) => {
        published.push(event);
      }),
      // promote uses strict dispatch (C2); capture it the same way for payload assertions
      dispatch: vi.fn(async (event: DomainEvent<Record<string, unknown>>) => {
        published.push(event);
      }),
      subscribe: vi.fn(),
    },
  };
}

function makeAudit() {
  return { record: vi.fn().mockResolvedValue(undefined) };
}

// Interactive-transaction stub: $transaction invokes the callback with a tx client that also
// answers the row-lock $queryRaw. The transactional services (StageGate/Promotion) publish
// their event only AFTER this callback resolves, so the capturing bus still sees each event.
const TX = { $queryRaw: vi.fn().mockResolvedValue([]) };

function makePrisma() {
  return {
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(TX)),
  };
}

describe("Phase 6 — demand-intake event publications (publisher-only, D3-7)", () => {
  it("submitIntake publishes demand.submitted with exact { demandId, title, submittedBy }", async () => {
    const repo = {
      create: vi.fn().mockResolvedValue(makeDemandDTO({ id: "demand-1", title: "New CRM", submittedBy: "user-1" })),
    };
    const { bus, published } = makeCapturingBus();
    const svc = new DemandRequestService(repo as never, bus as never, makeAudit() as never);

    await svc.submitIntake(
      { title: "New CRM", sponsor: "VP Sales", description: "Replace legacy CRM" },
      CTX,
      "req-1",
    );

    expect(published).toHaveLength(1);
    const event = published[0]!;
    expect(event.eventType).toBe(DEMAND_INTAKE_EVENTS.DEMAND_SUBMITTED);
    expect(isValidEventType(event.eventType)).toBe(true);
    expect(event.source).toBe("demand-intake");
    expect(event.data).toEqual({
      demandId: "demand-1",
      title: "New CRM",
      submittedBy: "user-1",
    });
  });

  it("advanceGate into Approved publishes demand.approved with exact { demandId }", async () => {
    const repo = {
      findByIdScopedForUpdate: vi
        .fn()
        .mockResolvedValue(makeDemandDTO({ status: "Evaluation", currentGate: "Evaluation" })),
      updateStatusGate: vi
        .fn()
        .mockResolvedValue(makeDemandDTO({ status: "Approved", currentGate: "Approved" })),
    };
    const gateDecisionRepo = { append: vi.fn().mockResolvedValue(undefined) };
    const rbac = { permitted: vi.fn().mockReturnValue(true) };
    const { bus, published } = makeCapturingBus();
    const svc = new StageGateService(
      repo as never,
      gateDecisionRepo as never,
      rbac as never,
      bus as never,
      makeAudit() as never,
      makePrisma() as never,
    );

    await svc.advanceGate("demand-1", CTX, "req-1");

    const approved = published.filter((e) => e.eventType === DEMAND_INTAKE_EVENTS.DEMAND_APPROVED);
    expect(approved).toHaveLength(1);
    expect(approved[0]!.source).toBe("demand-intake");
    expect(approved[0]!.data).toEqual({ demandId: "demand-1" });
  });

  it("advanceGate NOT reaching Approved publishes no event", async () => {
    const repo = {
      findByIdScopedForUpdate: vi
        .fn()
        .mockResolvedValue(makeDemandDTO({ status: "Submitted", currentGate: "Submitted" })),
      updateStatusGate: vi
        .fn()
        .mockResolvedValue(makeDemandDTO({ status: "Screening", currentGate: "Screening" })),
    };
    const gateDecisionRepo = { append: vi.fn().mockResolvedValue(undefined) };
    const rbac = { permitted: vi.fn().mockReturnValue(true) };
    const { bus, published } = makeCapturingBus();
    const svc = new StageGateService(
      repo as never,
      gateDecisionRepo as never,
      rbac as never,
      bus as never,
      makeAudit() as never,
      makePrisma() as never,
    );

    await svc.advanceGate("demand-1", CTX, "req-1");
    expect(published).toHaveLength(0);
  });

  it("rejectGate publishes demand.rejected with exact { demandId, reason }", async () => {
    const repo = {
      findByIdScopedForUpdate: vi
        .fn()
        .mockResolvedValue(makeDemandDTO({ status: "Screening", currentGate: "Screening" })),
      updateStatusGate: vi
        .fn()
        .mockResolvedValue(makeDemandDTO({ status: "Rejected", rejectionReason: "Out of scope" })),
    };
    const gateDecisionRepo = { append: vi.fn().mockResolvedValue(undefined) };
    const rbac = { permitted: vi.fn().mockReturnValue(true) };
    const { bus, published } = makeCapturingBus();
    const svc = new StageGateService(
      repo as never,
      gateDecisionRepo as never,
      rbac as never,
      bus as never,
      makeAudit() as never,
      makePrisma() as never,
    );

    await svc.rejectGate("demand-1", { reason: "Out of scope" }, CTX, "req-1");

    expect(published).toHaveLength(1);
    const event = published[0]!;
    expect(event.eventType).toBe(DEMAND_INTAKE_EVENTS.DEMAND_REJECTED);
    expect(event.source).toBe("demand-intake");
    expect(event.data).toEqual({ demandId: "demand-1", reason: "Out of scope" });
  });

  it("promoteToProject publishes demand.promoted with the EXACT project-execution payload", async () => {
    const repo = {
      findByIdScopedForUpdate: vi
        .fn()
        .mockResolvedValue(makeDemandDTO({ status: "Approved", currentGate: "Approved", title: "New CRM" })),
      updateStatusGate: vi.fn().mockResolvedValue(makeDemandDTO({ status: "Promoted" })),
    };
    const { bus, published } = makeCapturingBus();
    const svc = new PromotionService(repo as never, bus as never, makeAudit() as never, makePrisma() as never);

    await svc.promoteToProject(
      "demand-1",
      {
        portfolioId: "11111111-1111-1111-1111-111111111111",
        programId: "22222222-2222-2222-2222-222222222222",
        plannedStart: "2026-09-01",
        plannedEnd: "2027-03-31",
        plannedBudget: 750000,
      },
      CTX,
      "req-1",
    );

    expect(published).toHaveLength(1);
    const event = published[0]!;
    expect(event.eventType).toBe(DEMAND_INTAKE_EVENTS.DEMAND_PROMOTED);
    expect(event.source).toBe("demand-intake");
    expect(event.data).toEqual({
      demandId: "demand-1",
      name: "New CRM",
      portfolioId: "11111111-1111-1111-1111-111111111111",
      programId: "22222222-2222-2222-2222-222222222222",
      plannedStart: "2026-09-01",
      plannedEnd: "2027-03-31",
      plannedBudget: 750000,
    });
  });

  it("promoteToProject defaults optional programId / plannedBudget to null", async () => {
    const repo = {
      findByIdScopedForUpdate: vi
        .fn()
        .mockResolvedValue(makeDemandDTO({ status: "Approved", currentGate: "Approved", title: "New CRM" })),
      updateStatusGate: vi.fn().mockResolvedValue(makeDemandDTO({ status: "Promoted" })),
    };
    const { bus, published } = makeCapturingBus();
    const svc = new PromotionService(repo as never, bus as never, makeAudit() as never, makePrisma() as never);

    await svc.promoteToProject(
      "demand-1",
      {
        portfolioId: "11111111-1111-1111-1111-111111111111",
        plannedStart: "2026-09-01",
        plannedEnd: "2027-03-31",
      },
      CTX,
      "req-1",
    );

    expect(published[0]!.data).toEqual({
      demandId: "demand-1",
      name: "New CRM",
      portfolioId: "11111111-1111-1111-1111-111111111111",
      programId: null,
      plannedStart: "2026-09-01",
      plannedEnd: "2027-03-31",
      plannedBudget: null,
    });
  });
});
