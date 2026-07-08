import { Body, Controller, Delete, HttpCode, Param, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import {
  LinkProjectToGoalsSchema,
  type LinkProjectToGoalsCommand,
  type GoalLinkDTO,
} from "@epm/shared";
import { RequirePermission } from "../../../foundation/auth/decorators.js";
import { getAuth, getRequestId } from "../../../foundation/logging/request-context.js";
import { ZodValidationPipe } from "../../../foundation/validation/zod-validation.pipe.js";
import { GoalLinkService } from "../services/goal-link.service.js";

@Controller("api/v1/strategy/goal-links")
export class GoalLinkController {
  constructor(private readonly goalLinkService: GoalLinkService) {}

  // Idempotent upsert (P3) — the caller is recorded as `linkedBy`. Returns 201.
  @Post()
  @RequirePermission("goal-link:create")
  async linkProjectToGoals(
    @Body(new ZodValidationPipe(LinkProjectToGoalsSchema, "STRATEGY_001"))
    body: LinkProjectToGoalsCommand,
    @Req() req: Request,
  ): Promise<GoalLinkDTO[]> {
    const ctx = getAuth(req)!;
    return this.goalLinkService.linkProjectToGoals(
      body.projectId,
      body.goalIds,
      ctx.userId,
      ctx,
      getRequestId(req),
    );
  }

  @Delete(":id")
  @HttpCode(204)
  @RequirePermission("goal-link:delete")
  async unlinkGoal(@Param("id") id: string, @Req() req: Request): Promise<void> {
    return this.goalLinkService.unlinkGoal(id, getAuth(req)!, getRequestId(req));
  }
}
