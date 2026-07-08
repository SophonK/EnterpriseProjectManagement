import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  AppError,
  DEMAND_INTAKE_EVENTS,
  type AuthContext,
  type DemandRequestDTO,
  type SubmitIntakeCommand,
} from "@epm/shared";
import { EVENT_BUS, type EventBus } from "../../../foundation/events/event-bus.js";
import { AuditService } from "../../../foundation/audit/audit.service.js";
import { DemandRequestRepository } from "../repositories/demand-request.repository.js";

/** Owns the DemandRequest aggregate — submit / read / list intake requests (US-029). */
@Injectable()
export class DemandRequestService {
  constructor(
    private readonly demandRepo: DemandRequestRepository,
    @Inject(EVENT_BUS) private readonly eventBus: EventBus,
    private readonly auditService: AuditService,
  ) {}

  // BR-201: title, sponsor, and description are all required and non-empty — a submit
  // with any missing required field is rejected (DEMAND_001) and nothing is written.
  // On success the request is persisted with status = Submitted and currentGate =
  // Submitted (schema defaults; never client-supplied), the event is published and the
  // mutation audited. BR-202: submittedBy comes from the authenticated caller.
  async submitIntake(
    cmd: SubmitIntakeCommand,
    ctx: AuthContext,
    requestId: string,
  ): Promise<DemandRequestDTO> {
    if (!cmd.title?.trim() || !cmd.sponsor?.trim() || !cmd.description?.trim()) {
      throw new AppError("DEMAND_001", "title, sponsor, and description are required");
    }

    const dto = await this.demandRepo.create({
      title: cmd.title,
      sponsor: cmd.sponsor,
      description: cmd.description,
      expectedValue: cmd.expectedValue ?? null,
      submittedBy: ctx.userId,
    });

    await this.auditService.record({
      actorId: ctx.userId,
      action: "create",
      entityType: "demand-request",
      entityId: dto.id,
      after: dto,
      requestId,
    });

    await this.eventBus.publish({
      eventId: randomUUID(),
      eventType: DEMAND_INTAKE_EVENTS.DEMAND_SUBMITTED,
      occurredAt: new Date().toISOString(),
      source: "demand-intake",
      data: {
        demandId: dto.id,
        title: dto.title,
        submittedBy: dto.submittedBy,
      },
    });

    return dto;
  }

  // Scoped read — DEMAND_002 (not found) if missing OR caller lacks access (info hiding).
  async getRequest(id: string, ctx: AuthContext): Promise<DemandRequestDTO> {
    return this.demandRepo.findByIdScoped(id, ctx);
  }

  // BR-210: record-scoped — Director sees all requests, everyone else only their own.
  async listRequests(ctx: AuthContext): Promise<DemandRequestDTO[]> {
    return this.demandRepo.findManyScoped(ctx);
  }
}
