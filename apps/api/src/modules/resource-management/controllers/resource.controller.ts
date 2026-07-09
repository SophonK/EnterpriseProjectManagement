import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import {
  CreateResourceSchema,
  UpdateResourceSchema,
  type CreateResourceCommand,
  type UpdateResourceCommand,
  type ResourceDTO,
  type ResourceListDTO,
} from "@epm/shared";
import { RequirePermission } from "../../../foundation/auth/decorators.js";
import { getAuth, getRequestId } from "../../../foundation/logging/request-context.js";
import { ZodValidationPipe } from "../../../foundation/validation/zod-validation.pipe.js";
import { ResourceService } from "../services/resource.service.js";

@Controller("api/v1/resources")
export class ResourceController {
  constructor(private readonly resourceService: ResourceService) {}

  @Post()
  @RequirePermission("resource:write")
  async createResource(
    @Body(new ZodValidationPipe(CreateResourceSchema, "RESOURCE_001")) body: CreateResourceCommand,
    @Req() req: Request,
  ): Promise<ResourceDTO> {
    return this.resourceService.createResource(body, getAuth(req)!, getRequestId(req));
  }

  @Get()
  @RequirePermission("resource:read")
  async listResources(
    @Query("poolId") poolId?: string,
    @Query("skill") skill?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Req() req?: Request,
  ): Promise<ResourceListDTO> {
    return this.resourceService.listResources(
      {
        poolId,
        skill,
        page: page ? Number(page) : undefined,
        pageSize: pageSize ? Number(pageSize) : undefined,
      },
      getAuth(req!)!,
    );
  }

  @Get(":id")
  @RequirePermission("resource:read")
  async getResource(@Param("id") id: string, @Req() req: Request): Promise<ResourceDTO> {
    return this.resourceService.getResource(id, getAuth(req)!);
  }

  @Patch(":id")
  @RequirePermission("resource:write")
  async updateResource(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(UpdateResourceSchema, "RESOURCE_001")) body: UpdateResourceCommand,
    @Req() req: Request,
  ): Promise<ResourceDTO> {
    return this.resourceService.updateResource(id, body, getAuth(req)!, getRequestId(req));
  }

  @Delete(":id")
  @HttpCode(204)
  @RequirePermission("resource:write")
  async deleteResource(@Param("id") id: string, @Req() req: Request): Promise<void> {
    return this.resourceService.deleteResource(id, getAuth(req)!, getRequestId(req));
  }
}
