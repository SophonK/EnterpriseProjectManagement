import { Body, Controller, Get, Param, Post, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import {
  ListRequestsQuerySchema,
  SubmitIntakeSchema,
  type DemandRequestDTO,
  type ListRequestsQuery,
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
  // Optional `?status=` filters by DemandStatus (enum-validated → DEMAND_001 on a bad value).
  @Get()
  @RequirePermission("intake:request:read")
  async list(
    @Query(new ZodValidationPipe(ListRequestsQuerySchema, "DEMAND_001"))
    query: ListRequestsQuery,
    @Req() req: Request,
  ): Promise<DemandRequestDTO[]> {
    return this.demandRequestService.listRequests(getAuth(req)!, query.status);
  }

  // DEMAND_002 (404) if missing or record-scope denied (info hiding).
  @Get(":id")
  @RequirePermission("intake:request:read")
  async get(@Param("id") id: string, @Req() req: Request): Promise<DemandRequestDTO> {
    return this.demandRequestService.getRequest(id, getAuth(req)!);
  }
}
