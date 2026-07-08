import { Body, Controller, Get, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import {
  ConfigureScoringSchema,
  type ConfigureScoringCommand,
  type ScoringModelDTO,
} from "@epm/shared";
import { RequirePermission } from "../../../foundation/auth/decorators.js";
import { getAuth, getRequestId } from "../../../foundation/logging/request-context.js";
import { ZodValidationPipe } from "../../../foundation/validation/zod-validation.pipe.js";
import { ScoringModelService } from "../services/scoring-model.service.js";

@Controller("api/v1/intake/scoring-models")
export class ScoringModelController {
  constructor(private readonly scoringModelService: ScoringModelService) {}

  // US-030 — configure a scoring model (EPMO Director). Creates + activates a new
  // version, deactivating any prior active model (single-active invariant) → 201.
  @Post()
  @RequirePermission("intake:scoring-model:configure")
  async configure(
    @Body(new ZodValidationPipe(ConfigureScoringSchema, "DEMAND_001"))
    body: ConfigureScoringCommand,
    @Req() req: Request,
  ): Promise<ScoringModelDTO> {
    return this.scoringModelService.configureScoring(body, getAuth(req)!, getRequestId(req));
  }

  // The single active scoring model with its criteria, or DEMAND_003 (404) if none.
  @Get("active")
  @RequirePermission("intake:scoring-model:read")
  async getActive(@Req() req: Request): Promise<ScoringModelDTO> {
    return this.scoringModelService.getActiveModel(getAuth(req)!);
  }
}
