import { Controller, Get, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import {
  CapacityDemandQuerySchema,
  type CapacityDemandDTO,
  type CapacityDemandFilter,
} from "@epm/shared";
import { RequirePermission } from "../../../foundation/auth/decorators.js";
import { getAuth } from "../../../foundation/logging/request-context.js";
import { ZodValidationPipe } from "../../../foundation/validation/zod-validation.pipe.js";
import { CapacityService } from "../services/capacity.service.js";

@Controller("api/v1/resources/capacity-demand")
export class CapacityController {
  constructor(private readonly capacityService: CapacityService) {}

  @Get()
  @RequirePermission("capacity:read")
  async getCapacityDemand(
    @Query(new ZodValidationPipe(CapacityDemandQuerySchema, "RESOURCE_001")) query: CapacityDemandFilter,
    @Req() req?: Request,
  ): Promise<CapacityDemandDTO> {
    return this.capacityService.getCapacityDemand(query, getAuth(req!)!);
  }
}
