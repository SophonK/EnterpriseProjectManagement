import { Body, Controller, Get, HttpCode, Param, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import {
  ScoreRequestSchema,
  type RankedDemandDTO,
  type ScoreCardDTO,
  type ScoreRequestCommand,
} from "@epm/shared";
import { RequirePermission } from "../../../foundation/auth/decorators.js";
import { getAuth, getRequestId } from "../../../foundation/logging/request-context.js";
import { ZodValidationPipe } from "../../../foundation/validation/zod-validation.pipe.js";
import { ScoringService } from "../services/scoring.service.js";

@Controller("api/v1/intake/requests")
export class ScoringController {
  constructor(private readonly scoringService: ScoringService) {}

  // US-030 — ranked list (desc weightedTotal, stable tie-break by submittedAt asc).
  // Declared ahead of the parameterised `:id/score` route so the static path wins.
  @Get("ranked")
  @RequirePermission("intake:request:read")
  async ranked(@Req() req: Request): Promise<RankedDemandDTO[]> {
    return this.scoringService.rankRequests(getAuth(req)!);
  }

  // US-030 — enter per-criterion raw scores and compute the weighted total → 200.
  @Post(":id/score")
  @HttpCode(200)
  @RequirePermission("intake:request:score")
  async score(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(ScoreRequestSchema, "DEMAND_001"))
    body: ScoreRequestCommand,
    @Req() req: Request,
  ): Promise<ScoreCardDTO> {
    return this.scoringService.scoreRequest(id, body, getAuth(req)!, getRequestId(req));
  }
}
