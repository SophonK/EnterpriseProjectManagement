import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import {
  CreateRaidItemSchema,
  UpdateRaidItemSchema,
  type CreateRaidItemCommand,
  type UpdateRaidItemCommand,
  type RaidItemDTO,
  type RaidListDTO,
  type RaidType,
  type RaidStatus,
} from "@epm/shared";
import { RequirePermission } from "../../../foundation/auth/decorators.js";
import { getAuth, getRequestId } from "../../../foundation/logging/request-context.js";
import { ZodValidationPipe } from "../../../foundation/validation/zod-validation.pipe.js";
import { RaidItemService } from "../services/raid-item.service.js";

@Controller("api/v1/raid")
export class RaidController {
  constructor(private readonly raidItemService: RaidItemService) {}

  @Post()
  @RequirePermission("raid:write")
  async createRaidItem(
    @Body(new ZodValidationPipe(CreateRaidItemSchema, "RISK_001")) body: CreateRaidItemCommand,
    @Req() req: Request,
  ): Promise<RaidItemDTO> {
    return this.raidItemService.createRaidItem(body, getAuth(req)!, getRequestId(req));
  }

  @Get()
  @RequirePermission("raid:read")
  async listRaidItems(
    @Query("projectId") projectId?: string,
    @Query("type") type?: string,
    @Query("status") status?: string,
    @Query("escalated") escalated?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Req() req?: Request,
  ): Promise<RaidListDTO> {
    return this.raidItemService.listRaidItems(
      {
        projectId,
        type: type as RaidType | undefined,
        status: status as RaidStatus | undefined,
        escalated: escalated != null ? escalated === "true" : undefined,
        page: page ? Number(page) : undefined,
        pageSize: pageSize ? Number(pageSize) : undefined,
      },
      getAuth(req!)!,
    );
  }

  @Get(":id")
  @RequirePermission("raid:read")
  async getRaidItem(@Param("id") id: string, @Req() req: Request): Promise<RaidItemDTO> {
    return this.raidItemService.getRaidItem(id, getAuth(req)!);
  }

  @Patch(":id")
  @RequirePermission("raid:write")
  async updateRaidItem(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(UpdateRaidItemSchema, "RISK_001")) body: UpdateRaidItemCommand,
    @Req() req: Request,
  ): Promise<RaidItemDTO> {
    return this.raidItemService.updateRaidItem(id, body, getAuth(req)!, getRequestId(req));
  }

  @Delete(":id")
  @HttpCode(204)
  @RequirePermission("raid:write")
  async deleteRaidItem(@Param("id") id: string, @Req() req: Request): Promise<void> {
    return this.raidItemService.deleteRaidItem(id, getAuth(req)!, getRequestId(req));
  }
}
