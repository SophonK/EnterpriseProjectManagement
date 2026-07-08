import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  AppError,
  STRATEGY_PORTFOLIO_EVENTS,
  type AuthContext,
  type GoalLinkDTO,
} from "@epm/shared";
import { EVENT_BUS, type EventBus } from "../../../foundation/events/event-bus.js";
import { AuditService } from "../../../foundation/audit/audit.service.js";
import { GoalLinkRepository } from "../repositories/goal-link.repository.js";
import { StrategicGoalRepository } from "../repositories/strategic-goal.repository.js";
import { AlignmentService } from "./alignment.service.js";

/** Links a project to strategic goals and triggers realignment (US-008). */
@Injectable()
export class GoalLinkService {
  constructor(
    private readonly goalLinkRepo: GoalLinkRepository,
    private readonly goalRepo: StrategicGoalRepository,
    private readonly alignmentService: AlignmentService,
    @Inject(EVENT_BUS) private readonly eventBus: EventBus,
    private readonly auditService: AuditService,
  ) {}

  /**
   * BR-107: idempotent upsert — one GoalLink per `(goalId, projectId)` pair (set semantics
   * via `@@unique([goalId, projectId])`). Applying the same pair twice yields the same single
   * row, no duplicate and no error. After linking, alignment for `projectId` is recomputed and
   * the projection updated, then `strategy-portfolio.project.linked-to-goal` is published.
   */
  async linkProjectToGoals(
    projectId: string,
    goalIds: string[],
    linkedBy: string,
    ctx: AuthContext,
    requestId: string,
  ): Promise<GoalLinkDTO[]> {
    if (goalIds.length === 0) return []; // empty goalIds → no-op

    const links: GoalLinkDTO[] = [];
    for (const goalId of goalIds) {
      const exists = await this.goalRepo.existsById(goalId);
      if (!exists) throw new AppError("STRATEGY_002", `Strategic goal ${goalId} not found`);
      links.push(await this.goalLinkRepo.upsertLink(goalId, projectId, linkedBy));
    }

    // BR-107: recompute alignment for the project and update the projection.
    await this.alignmentService.evaluateAlignment(projectId);

    await this.auditService.record({
      actorId: ctx.userId,
      action: "create",
      entityType: "goal-link",
      entityId: projectId,
      after: { projectId, goalIds, linkedBy },
      requestId,
    });

    await this.eventBus.publish({
      eventId: randomUUID(),
      eventType: STRATEGY_PORTFOLIO_EVENTS.PROJECT_LINKED_TO_GOAL,
      occurredAt: new Date().toISOString(),
      source: "strategy-portfolio",
      data: { projectId, goalIds, linkedBy },
    });

    return links;
  }

  async unlinkGoal(id: string, ctx: AuthContext, requestId: string): Promise<void> {
    await this.goalLinkRepo.delete(id); // STRATEGY_006 if missing

    await this.auditService.record({
      actorId: ctx.userId,
      action: "delete",
      entityType: "goal-link",
      entityId: id,
      requestId,
    });
  }
}
