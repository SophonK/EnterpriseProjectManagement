import { Body, Controller, Get, Param, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import {
  SubmitIntakeSchema,
  type DemandRequestDTO,
  type SubmitIntakeCommand,
} from "@epm/shared";
import { RequirePermission } from "../../../foundation/auth/decorators.js";
import { getAuth, getRequestId } from "../../../foundation/logging/request-context.js";
import { ZodValidationPipe } from "../../../foundation/validation/zod-validation.pipe.js";
import { DemandRequestService } from "../services/demand-request.service.js";

@Controller("api/v1/intake/requests")
export class DemandRequestController {
  constructor(private readonly demandRequestService: DemandRequestService) {}

  // US-029 — submit a demand intake request (Portfolio Manager, also EPMO Director) → 201.
  @Post()
  @RequirePermission("intake:request:submit")
  async submit(
    @Body(new ZodValidationPipe(SubmitIntakeSchema, "DEMAND_001"))
    body: SubmitIntakeCommand,
    @Req() req: Request,
  ): Promise<DemandRequestDTO> {
    return this.demandRequestService.submitIntake(body, getAuth(req)!, getRequestId(req));
  }

  // Record-scoped: Portfolio Manager sees only own submissions; EPMO Director sees all.
  @Get()
  @RequirePermission("intake:request:read")
  async list(@Req() req: Request): Promise<DemandRequestDTO[]> {
    return this.demandRequestService.listRequests(getAuth(req)!);
  }

  // DEMAND_002 (404) if missing or record-scope denied (info hiding).
  @Get(":id")
  @RequirePermission("intake:request:read")
  async get(@Param("id") id: string, @Req() req: Request): Promise<DemandRequestDTO> {
    return this.demandRequestService.getRequest(id, getAuth(req)!);
  }
}
