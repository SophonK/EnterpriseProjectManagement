import { Injectable } from "@nestjs/common";
import {
  AppError,
  type AuthContext,
  type DefineStrategicGoalCommand,
  type StrategicGoalDTO,
} from "@epm/shared";
import { AuditService } from "../../../foundation/audit/audit.service.js";
import { StrategicGoalRepository } from "../repositories/strategic-goal.repository.js";

/** Owns strategic goals / OKRs (US-006). */
@Injectable()
export class StrategicGoalService {
  constructor(
    private readonly goalRepo: StrategicGoalRepository,
    private readonly auditService: AuditService,
  ) {}

  // BR-101: title, description, and measure are all required and non-empty —
  // a save with any missing required field is rejected (STRATEGY_001), nothing written.
  async createGoal(
    cmd: DefineStrategicGoalCommand,
    ctx: AuthContext,
    requestId: string,
  ): Promise<StrategicGoalDTO> {
    if (!cmd.title?.trim() || !cmd.description?.trim() || !cmd.measure?.trim()) {
      throw new AppError("STRATEGY_001", "title, description, and measure are required");
    }

    const dto = await this.goalRepo.create({
      title: cmd.title,
      description: cmd.description,
      measure: cmd.measure,
      createdBy: ctx.userId, // BR (US-006): createdBy from AuthContext, immutable
    });

    await this.auditService.record({
      actorId: ctx.userId,
      action: "create",
      entityType: "strategic-goal",
      entityId: dto.id,
      after: dto,
      requestId,
    });

    return dto;
  }

  async listGoals(_ctx: AuthContext): Promise<StrategicGoalDTO[]> {
    return this.goalRepo.listActive();
  }

  // Archiving is a soft state change (Active → Archived), never a hard delete.
  async archiveGoal(id: string, ctx: AuthContext, requestId: string): Promise<void> {
    const before = await this.goalRepo.findByIdOrThrow(id); // STRATEGY_002 if missing
    await this.goalRepo.archive(id);

    await this.auditService.record({
      actorId: ctx.userId,
      action: "update",
      entityType: "strategic-goal",
      entityId: id,
      before,
      after: { ...before, status: "Archived" },
      requestId,
    });
  }
}
