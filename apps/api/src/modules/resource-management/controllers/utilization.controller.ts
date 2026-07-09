import { Controller, Get, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import { UtilizationQuerySchema, type UtilizationDTO, type UtilizationFilter } from "@epm/shared";
import { RequirePermission } from "../../../foundation/auth/decorators.js";
import { getAuth } from "../../../foundation/logging/request-context.js";
import { ZodValidationPipe } from "../../../foundation/validation/zod-validation.pipe.js";
import { UtilizationService } from "../services/utilization.service.js";

@Controller("api/v1/resources/utilization")
export class UtilizationController {
  constructor(private readonly utilizationService: UtilizationService) {}

  @Get()
  @RequirePermission("utilization:read")
  async getUtilization(
    @Query(new ZodValidationPipe(UtilizationQuerySchema, "RESOURCE_001")) query: UtilizationFilter,
    @Req() req?: Request,
  ): Promise<UtilizationDTO> {
    return this.utilizationService.getUtilization(query, getAuth(req!)!);
  }
}
