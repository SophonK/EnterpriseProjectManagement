import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  AppError,
  DEMAND_INTAKE_EVENTS,
  type AuthContext,
  type DemandRequestDTO,
  type PromoteToProjectCommand,
} from "@epm/shared";
import { EVENT_BUS, type EventBus } from "../../../foundation/events/event-bus.js";
import { AuditService } from "../../../foundation/audit/audit.service.js";
import { PrismaService } from "../../../foundation/db/prisma.service.js";
import { DemandRequestRepository } from "../repositories/demand-request.repository.js";

/** Promotes an approved demand into an execution Project — event-driven (US-032, D3-2). */
@Injectable()
export class PromotionService {
  constructor(
    private readonly demandRepo: DemandRequestRepository,
    @Inject(EVENT_BUS) private readonly eventBus: EventBus,
    private readonly auditService: AuditService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * BR-208: promote succeeds only when status = Approved (else DEMAND_006 — this also
   * guards re-promotion, since Promoted is terminal). The Portfolio Manager supplies the
   * promotion params the intake form lacks; `name` defaults from the demand title. Sets
   * status = Promoted (terminal), audits, then dispatches demand-intake.demand.promoted with
   * the EXACT project-execution DemandPromotedPayload.
   *
   * C2: the event is dispatched STRICTLY and INSIDE the transaction — if project-execution's
   * handler fails (e.g. a transient DB error), `dispatch` re-throws, the whole promote rolls
   * back, and the demand stays Approved (retryable) rather than becoming an orphaned Promoted
   * with no project. project-execution dedupes project creation by sourceDemandId, so a retry
   * never creates a duplicate.
   */
  async promoteToProject(
    demandRequestId: string,
    cmd: PromoteToProjectCommand,
    ctx: AuthContext,
    requestId: string,
  ): Promise<DemandRequestDTO> {
    // REL-DI-03 / SEC-DI-05: row lock + Approved-status check (fail-closed, before any write)
    // + status change + audit + strict event dispatch in ONE transaction. The lock also guards
    // concurrent promotes — once one commits Promoted, the other re-reads Promoted → DEMAND_006.
    return await this.prisma.$transaction(async (tx) => {
      const request = await this.demandRepo.findByIdScopedForUpdate(demandRequestId, ctx, tx); // DEMAND_002

      if (request.status !== "Approved") {
        throw new AppError("DEMAND_006", `promote requires Approved, got ${request.status}`);
      }

      const next = await this.demandRepo.updateStatusGate(
        demandRequestId,
        { status: "Promoted" },
        tx,
      );

      await this.auditService.record(
        {
          actorId: ctx.userId,
          action: "update",
          entityType: "demand-request",
          entityId: demandRequestId,
          after: next,
          requestId,
        },
        tx,
      );

      // Strict, in-transaction: a downstream project-creation failure rolls this promote back.
      await this.eventBus.dispatch({
        eventId: randomUUID(),
        eventType: DEMAND_INTAKE_EVENTS.DEMAND_PROMOTED,
        occurredAt: new Date().toISOString(),
        source: "demand-intake",
        data: {
          demandId: demandRequestId,
          name: request.title,
          portfolioId: cmd.portfolioId,
          programId: cmd.programId ?? null,
          plannedStart: cmd.plannedStart,
          plannedEnd: cmd.plannedEnd,
          plannedBudget: cmd.plannedBudget ?? null,
        },
      });

      return next;
    });
  }
}
