import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  STRATEGY_PORTFOLIO_EVENTS,
  type AuthContext,
  type CreateProgramCommand,
  type ProgramDTO,
} from "@epm/shared";
import { EVENT_BUS, type EventBus } from "../../../foundation/events/event-bus.js";
import { AuditService } from "../../../foundation/audit/audit.service.js";
import { ProgramRepository } from "../repositories/program.repository.js";
import { PortfolioRepository } from "../repositories/portfolio.repository.js";

/** Owns programs, each within a required parent portfolio (US-011, D3-6). */
@Injectable()
export class ProgramService {
  constructor(
    private readonly programRepo: ProgramRepository,
    private readonly portfolioRepo: PortfolioRepository,
    @Inject(EVENT_BUS) private readonly eventBus: EventBus,
    private readonly auditService: AuditService,
  ) {}

  // BR-105: a program can only be created within an existing portfolio; the parent
  // must exist (and be in scope), else STRATEGY_003 (portfolio not found).
  async createProgram(
    portfolioId: string,
    cmd: CreateProgramCommand,
    ctx: AuthContext,
    requestId: string,
  ): Promise<ProgramDTO> {
    await this.portfolioRepo.findByIdScoped(portfolioId, ctx); // STRATEGY_003 if absent/out-of-scope

    const dto = await this.programRepo.create({
      portfolioId,
      name: cmd.name,
      description: cmd.description ?? null,
    });

    await this.auditService.record({
      actorId: ctx.userId,
      action: "create",
      entityType: "program",
      entityId: dto.id,
      after: dto,
      requestId,
    });

    await this.eventBus.publish({
      eventId: randomUUID(),
      eventType: STRATEGY_PORTFOLIO_EVENTS.PROGRAM_CREATED,
      occurredAt: new Date().toISOString(),
      source: "strategy-portfolio",
      data: {
        programId: dto.id,
        portfolioId: dto.portfolioId,
        name: dto.name,
      },
    });

    return dto;
  }

  async listPrograms(portfolioId: string, ctx: AuthContext): Promise<ProgramDTO[]> {
    await this.portfolioRepo.findByIdScoped(portfolioId, ctx); // scope via parent portfolio
    return this.programRepo.listByPortfolio(portfolioId);
  }

  /**
   * In-process module-API (D3-6): lets `project-execution` validate its soft `programId`
   * reference without a cross-schema FK. Graceful degradation (REL-SP-04): a transient
   * strategy-side failure fails open rather than hard-blocking an execution write —
   * eventual consistency is restored when the project event is projected.
   */
  async programExists(programId: string): Promise<boolean> {
    try {
      return await this.programRepo.existsById(programId);
    } catch {
      return true; // fail open — do not hard-block execution
    }
  }
}
