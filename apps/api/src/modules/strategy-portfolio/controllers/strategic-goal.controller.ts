import { Body, Controller, Get, HttpCode, Param, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import {
  DefineStrategicGoalSchema,
  type DefineStrategicGoalCommand,
  type StrategicGoalDTO,
} from "@epm/shared";
import { RequirePermission } from "../../../foundation/auth/decorators.js";
import { getAuth, getRequestId } from "../../../foundation/logging/request-context.js";
import { ZodValidationPipe } from "../../../foundation/validation/zod-validation.pipe.js";
import { StrategicGoalService } from "../services/strategic-goal.service.js";

@Controller("api/v1/strategy/goals")
export class StrategicGoalController {
  constructor(private readonly goalService: StrategicGoalService) {}

  @Post()
  @RequirePermission("strategy-goal:create")
  async createGoal(
    @Body(new ZodValidationPipe(DefineStrategicGoalSchema, "STRATEGY_001"))
    body: DefineStrategicGoalCommand,
    @Req() req: Request,
  ): Promise<StrategicGoalDTO> {
    return this.goalService.createGoal(body, getAuth(req)!, getRequestId(req));
  }

  @Get()
  @RequirePermission("strategy-goal:read")
  async listGoals(@Req() req: Request): Promise<StrategicGoalDTO[]> {
    return this.goalService.listGoals(getAuth(req)!);
  }

  @Post(":id/archive")
  @HttpCode(204)
  @RequirePermission("strategy-goal:archive")
  async archiveGoal(@Param("id") id: string, @Req() req: Request): Promise<void> {
    return this.goalService.archiveGoal(id, getAuth(req)!, getRequestId(req));
  }
}
