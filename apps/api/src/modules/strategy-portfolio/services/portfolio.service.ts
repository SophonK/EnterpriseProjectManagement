import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  AppError,
  STRATEGY_PORTFOLIO_EVENTS,
  type AuthContext,
  type CreatePortfolioCommand,
  type PortfolioDTO,
} from "@epm/shared";
import { EVENT_BUS, type EventBus } from "../../../foundation/events/event-bus.js";
import { AuditService } from "../../../foundation/audit/audit.service.js";
import { PortfolioRepository } from "../repositories/portfolio.repository.js";
import { StrategicGoalRepository } from "../repositories/strategic-goal.repository.js";

/** Owns portfolios and their many-to-many association to strategic goals (US-007). */
@Injectable()
export class PortfolioService {
  constructor(
    private readonly portfolioRepo: PortfolioRepository,
    private readonly goalRepo: StrategicGoalRepository,
    @Inject(EVENT_BUS) private readonly eventBus: EventBus,
    private readonly auditService: AuditService,
  ) {}

  // BR-102: ownerId is assigned from the authenticated caller — the creator is
  // always the owner; the client cannot set or override it.
  async createPortfolio(
    cmd: CreatePortfolioCommand,
    ctx: AuthContext,
    requestId: string,
  ): Promise<PortfolioDTO> {
    const dto = await this.portfolioRepo.create({
      name: cmd.name,
      description: cmd.description ?? null,
      ownerId: ctx.userId,
    });

    await this.auditService.record({
      actorId: ctx.userId,
      action: "create",
      entityType: "portfolio",
      entityId: dto.id,
      after: dto,
      requestId,
    });

    await this.eventBus.publish({
      eventId: randomUUID(),
      eventType: STRATEGY_PORTFOLIO_EVENTS.PORTFOLIO_CREATED,
      occurredAt: new Date().toISOString(),
      source: "strategy-portfolio",
      data: {
        portfolioId: dto.id,
        name: dto.name,
        ownerId: dto.ownerId,
      },
    });

    return dto;
  }

  // BR-110: record-scoped — Director sees all, everyone else only their own.
  async listPortfolios(ctx: AuthContext): Promise<PortfolioDTO[]> {
    return this.portfolioRepo.findMany(ctx);
  }

  // Scoped read — STRATEGY_003 (not found) if missing OR caller lacks access (info hiding).
  async getPortfolio(id: string, ctx: AuthContext): Promise<PortfolioDTO> {
    return this.portfolioRepo.findByIdScoped(id, ctx);
  }

  // BR-106: idempotent, additive association (set semantics via @@unique([portfolioId, goalId])).
  async associateGoals(
    portfolioId: string,
    goalIds: string[],
    ctx: AuthContext,
    requestId: string,
  ): Promise<PortfolioDTO> {
    // Scope + existence check on the parent portfolio.
    await this.portfolioRepo.findByIdScoped(portfolioId, ctx);

    // Both endpoints must be resolvable at association time — the goal must exist AND be
    // Active (an Archived goal cannot be freshly associated).
    for (const goalId of goalIds) {
      const exists = await this.goalRepo.existsActiveById(goalId);
      if (!exists) throw new AppError("STRATEGY_002", `Strategic goal ${goalId} not found`);
    }

    await this.portfolioRepo.associateGoals(portfolioId, goalIds); // no-op on re-associate

    await this.auditService.record({
      actorId: ctx.userId,
      action: "update",
      entityType: "portfolio.goals",
      entityId: portfolioId,
      after: { goalIds },
      requestId,
    });

    return this.portfolioRepo.findByIdScoped(portfolioId, ctx);
  }
}
