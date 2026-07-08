import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  AppError,
  DEMAND_INTAKE_EVENTS,
  INTAKE_GATE,
  type AuthContext,
  type DemandRequestDTO,
  type IntakeGate,
  type Permission,
  type RejectGateCommand,
} from "@epm/shared";
import { EVENT_BUS, type EventBus } from "../../../foundation/events/event-bus.js";
import { AuditService } from "../../../foundation/audit/audit.service.js";
import { RbacRegistry } from "../../../foundation/auth/rbac.registry.js";
import { DemandRequestRepository } from "../repositories/demand-request.repository.js";
import { GateDecisionRepository } from "../repositories/gate-decision.repository.js";

/** Fixed linear gate order Submitted → Screening → Evaluation → Approved (D3-4). */
const GATE_ORDER: readonly IntakeGate[] = INTAKE_GATE;

/** Statuses from which a request may still be rejected (active gates, BR-207). */
const ACTIVE_STATUSES = ["Submitted", "Screening", "Evaluation"] as const;

/**
 * Per-gate permission required to cross into the target gate (BR-205). `Submitted` has no
 * inbound advance; the coarse advance permission is a placeholder never checked in flow.
 */
const GATE_PERMISSION: Record<IntakeGate, Permission> = {
  Submitted: "intake:request:advance",
  Screening: "intake-gate:screening",
  Evaluation: "intake-gate:evaluation",
  Approved: "intake-gate:approval",
};

/** Service-layer state machine over the fixed linear stage-gate (US-031). */
@Injectable()
export class StageGateService {
  constructor(
    private readonly demandRepo: DemandRequestRepository,
    private readonly gateDecisionRepo: GateDecisionRepository,
    private readonly rbac: RbacRegistry,
    @Inject(EVENT_BUS) private readonly eventBus: EventBus,
    private readonly auditService: AuditService,
  ) {}

  /**
   * BR-205 / BR-206: advance a request one legal step forward. Illegal advances (from a
   * terminal state, or past Approved) throw DEMAND_005 before any write (fail-closed).
   * The target gate is authorized again here with the per-gate permission; a caller lacking
   * it is refused (403) with no mutation. On the final advance into Approved, status is set
   * to Approved and demand-intake.demand.approved is published.
   */
  async advanceGate(
    demandRequestId: string,
    ctx: AuthContext,
    requestId: string,
  ): Promise<DemandRequestDTO> {
    const request = await this.demandRepo.findByIdScoped(demandRequestId, ctx); // DEMAND_002

    if (request.status === "Rejected" || request.status === "Promoted") {
      throw new AppError("DEMAND_005", `cannot advance from terminal status ${request.status}`);
    }

    const next = this.nextGate(request.currentGate);
    if (next === null) {
      throw new AppError("DEMAND_005", `illegal advance from ${request.currentGate}`);
    }

    if (!this.rbac.permitted(ctx.roles, GATE_PERMISSION[next])) {
      throw AppError.forbidden(`missing per-gate permission for ${next}`);
    }

    await this.gateDecisionRepo.append({
      demandRequestId,
      fromGate: request.currentGate,
      toGate: next,
      decision: "Advanced",
      decidedBy: ctx.userId,
    });

    const updated = await this.demandRepo.updateStatusGate(demandRequestId, {
      status: next,
      currentGate: next,
    });

    if (next === "Approved") {
      await this.eventBus.publish({
        eventId: randomUUID(),
        eventType: DEMAND_INTAKE_EVENTS.DEMAND_APPROVED,
        occurredAt: new Date().toISOString(),
        source: "demand-intake",
        data: { demandId: demandRequestId },
      });
    }

    await this.auditService.record({
      actorId: ctx.userId,
      action: "update",
      entityType: "demand-request",
      entityId: demandRequestId,
      after: updated,
      requestId,
    });

    return updated;
  }

  /**
   * BR-207: reject a request from any active gate (Submitted/Screening/Evaluation) with a
   * non-empty reason. Sets status = Rejected (terminal) + rejectionReason, records a
   * GateDecision {decision: Rejected, toGate: null, reason}, publishes
   * demand-intake.demand.rejected, and audits. A reject on a non-active status throws
   * DEMAND_005 before any write; an empty reason throws DEMAND_001.
   */
  async rejectGate(
    demandRequestId: string,
    cmd: RejectGateCommand,
    ctx: AuthContext,
    requestId: string,
  ): Promise<DemandRequestDTO> {
    const request = await this.demandRepo.findByIdScoped(demandRequestId, ctx); // DEMAND_002

    if (!ACTIVE_STATUSES.includes(request.status as (typeof ACTIVE_STATUSES)[number])) {
      throw new AppError("DEMAND_005", `cannot reject from status ${request.status}`);
    }
    if (!cmd.reason?.trim()) {
      throw new AppError("DEMAND_001", "rejection reason is required");
    }

    await this.gateDecisionRepo.append({
      demandRequestId,
      fromGate: request.currentGate,
      toGate: null,
      decision: "Rejected",
      reason: cmd.reason,
      decidedBy: ctx.userId,
    });

    const updated = await this.demandRepo.updateStatusGate(demandRequestId, {
      status: "Rejected",
      rejectionReason: cmd.reason,
    });

    await this.eventBus.publish({
      eventId: randomUUID(),
      eventType: DEMAND_INTAKE_EVENTS.DEMAND_REJECTED,
      occurredAt: new Date().toISOString(),
      source: "demand-intake",
      data: { demandId: demandRequestId, reason: cmd.reason },
    });

    await this.auditService.record({
      actorId: ctx.userId,
      action: "update",
      entityType: "demand-request",
      entityId: demandRequestId,
      after: updated,
      requestId,
    });

    return updated;
  }

  /** Successor of `current` in the fixed linear sequence, or null if none (at/after Approved). */
  private nextGate(current: IntakeGate): IntakeGate | null {
    const idx = GATE_ORDER.indexOf(current);
    if (idx < 0 || idx >= GATE_ORDER.length - 1) return null;
    return GATE_ORDER[idx + 1] ?? null;
  }
}
