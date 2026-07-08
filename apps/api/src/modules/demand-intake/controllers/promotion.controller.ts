import { Body, Controller, HttpCode, Param, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import {
  PromoteToProjectSchema,
  type DemandRequestDTO,
  type PromoteToProjectCommand,
} from "@epm/shared";
import { RequirePermission } from "../../../foundation/auth/decorators.js";
import { getAuth, getRequestId } from "../../../foundation/logging/request-context.js";
import { ZodValidationPipe } from "../../../foundation/validation/zod-validation.pipe.js";
import { PromotionService } from "../services/promotion.service.js";

@Controller("api/v1/intake/requests")
export class PromotionController {
  constructor(private readonly promotionService: PromotionService) {}

  // US-032 — promote an Approved demand (Portfolio Manager, also EPMO Director). Requires
  // status = Approved (else DEMAND_006 — also guards re-promotion since Promoted is
  // terminal); publishes demand-intake.demand.promoted and sets status = Promoted → 200.
  @Post(":id/promote")
  @HttpCode(200)
  @RequirePermission("intake:request:promote")
  async promote(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(PromoteToProjectSchema, "DEMAND_001"))
    body: PromoteToProjectCommand,
    @Req() req: Request,
  ): Promise<DemandRequestDTO> {
    return this.promotionService.promoteToProject(id, body, getAuth(req)!, getRequestId(req));
  }
}
