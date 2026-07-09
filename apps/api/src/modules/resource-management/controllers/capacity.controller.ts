import { Controller, Get, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import type { CapacityDemandDTO } from "@epm/shared";
import { RequirePermission } from "../../../foundation/auth/decorators.js";
import { getAuth } from "../../../foundation/logging/request-context.js";
import { CapacityService } from "../services/capacity.service.js";

@Controller("api/v1/resources/capacity-demand")
export class CapacityController {
  constructor(private readonly capacityService: CapacityService) {}

  @Get()
  @RequirePermission("capacity:read")
  async getCapacityDemand(
    @Query("from") from: string,
    @Query("to") to: string,
    @Query("poolId") poolId?: string,
    @Query("skill") skill?: string,
    @Req() req?: Request,
  ): Promise<CapacityDemandDTO> {
    return this.capacityService.getCapacityDemand({ from, to, poolId, skill }, getAuth(req!)!);
  }
}
