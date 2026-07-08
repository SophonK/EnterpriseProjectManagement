import { Body, Controller, HttpCode, Param, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import {
  AdvanceGateSchema,
  RejectGateSchema,
  type AdvanceGateCommand,
  type DemandRequestDTO,
  type RejectGateCommand,
} from "@epm/shared";
import { RequirePermission } from "../../../foundation/auth/decorators.js";
import { getAuth, getRequestId } from "../../../foundation/logging/request-context.js";
import { ZodValidationPipe } from "../../../foundation/validation/zod-validation.pipe.js";
import { StageGateService } from "../services/stage-gate.service.js";

@Controller("api/v1/intake/requests")
export class StageGateController {
  constructor(private readonly stageGateService: StageGateService) {}

  // US-031 — advance one gate forward (Portfolio Manager, also EPMO Director). The
  // per-gate permission (intake-gate:screening|evaluation|approval) is enforced in the
  // service for the target transition; an illegal transition throws DEMAND_005 → 200.
  @Post(":id/advance")
  @HttpCode(200)
  @RequirePermission("intake:request:advance")
  async advance(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(AdvanceGateSchema, "DEMAND_001"))
    _body: AdvanceGateCommand,
    @Req() req: Request,
  ): Promise<DemandRequestDTO> {
    return this.stageGateService.advanceGate(id, getAuth(req)!, getRequestId(req));
  }

  // US-031 — reject at the current active gate → Rejected + reason (terminal) → 200.
  @Post(":id/reject")
  @HttpCode(200)
  @RequirePermission("intake:request:reject")
  async reject(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(RejectGateSchema, "DEMAND_001"))
    body: RejectGateCommand,
    @Req() req: Request,
  ): Promise<DemandRequestDTO> {
    return this.stageGateService.rejectGate(id, body, getAuth(req)!, getRequestId(req));
  }
}
