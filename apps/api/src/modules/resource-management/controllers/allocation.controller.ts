import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import {
  AllocateResourceSchema,
  UpdateAllocationSchema,
  type AllocateResourceCommand,
  type UpdateAllocationCommand,
  type AllocationDTO,
  type AllocateResultDTO,
} from "@epm/shared";
import { RequirePermission } from "../../../foundation/auth/decorators.js";
import { getAuth, getRequestId } from "../../../foundation/logging/request-context.js";
import { ZodValidationPipe } from "../../../foundation/validation/zod-validation.pipe.js";
import { AllocationService } from "../services/allocation.service.js";

@Controller("api/v1/resources/:resourceId/allocations")
export class AllocationController {
  constructor(private readonly allocationService: AllocationService) {}

  @Post()
  @RequirePermission("allocation:write")
  async allocate(
    @Param("resourceId") resourceId: string,
    @Body(new ZodValidationPipe(AllocateResourceSchema, "RESOURCE_001")) body: AllocateResourceCommand,
    @Req() req: Request,
  ): Promise<AllocateResultDTO> {
    return this.allocationService.allocate(resourceId, body, getAuth(req)!, getRequestId(req));
  }

  @Get()
  @RequirePermission("allocation:read")
  async listAllocations(
    @Param("resourceId") resourceId: string,
    @Query("periodStart") periodStart?: string,
    @Query("periodEnd") periodEnd?: string,
    @Req() req?: Request,
  ): Promise<{ data: AllocationDTO[] }> {
    const allocations = await this.allocationService.getAllocationsForResource(
      resourceId,
      getAuth(req!)!,
      periodStart ? new Date(periodStart) : undefined,
      periodEnd ? new Date(periodEnd) : undefined,
    );
    return { data: allocations };
  }

  @Patch(":id")
  @RequirePermission("allocation:write")
  async updateAllocation(
    @Param("resourceId") resourceId: string,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(UpdateAllocationSchema, "RESOURCE_001")) body: UpdateAllocationCommand,
    @Req() req: Request,
  ): Promise<AllocateResultDTO> {
    return this.allocationService.updateAllocation(id, resourceId, body, getAuth(req)!, getRequestId(req));
  }

  @Delete(":id")
  @HttpCode(204)
  @RequirePermission("allocation:write")
  async deleteAllocation(
    @Param("resourceId") resourceId: string,
    @Param("id") id: string,
    @Req() req: Request,
  ): Promise<void> {
    return this.allocationService.deleteAllocation(id, resourceId, getAuth(req)!, getRequestId(req));
  }
}
