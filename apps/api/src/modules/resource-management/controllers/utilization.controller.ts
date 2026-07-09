import { Controller, Get, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import type { UtilizationDTO } from "@epm/shared";
import { RequirePermission } from "../../../foundation/auth/decorators.js";
import { getAuth } from "../../../foundation/logging/request-context.js";
import { UtilizationService } from "../services/utilization.service.js";

@Controller("api/v1/resources/utilization")
export class UtilizationController {
  constructor(private readonly utilizationService: UtilizationService) {}

  @Get()
  @RequirePermission("utilization:read")
  async getUtilization(
    @Query("from") from: string,
    @Query("to") to: string,
    @Query("poolId") poolId?: string,
    @Req() req?: Request,
  ): Promise<UtilizationDTO> {
    return this.utilizationService.getUtilization({ from, to, poolId }, getAuth(req!)!);
  }
}
