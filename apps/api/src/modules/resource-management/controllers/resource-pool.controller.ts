import { Body, Controller, Get, HttpCode, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import {
  CreateResourcePoolSchema,
  type CreateResourcePoolCommand,
  type ResourcePoolDTO,
} from "@epm/shared";
import { RequirePermission } from "../../../foundation/auth/decorators.js";
import { getAuth, getRequestId } from "../../../foundation/logging/request-context.js";
import { ZodValidationPipe } from "../../../foundation/validation/zod-validation.pipe.js";
import { ResourceService } from "../services/resource.service.js";

@Controller("api/v1/resource-pools")
export class ResourcePoolController {
  constructor(private readonly resourceService: ResourceService) {}

  @Get()
  @RequirePermission("resource:read")
  async listPools(): Promise<{ data: ResourcePoolDTO[] }> {
    return { data: await this.resourceService.listPools() };
  }

  @Post()
  @HttpCode(201)
  @RequirePermission("resource:write")
  async createPool(
    @Body(new ZodValidationPipe(CreateResourcePoolSchema, "RESOURCE_001")) body: CreateResourcePoolCommand,
    @Req() req: Request,
  ): Promise<ResourcePoolDTO> {
    // resource:write gates the route; the service additionally enforces EPMO_DIRECTOR-only.
    return this.resourceService.createPool(body, getAuth(req)!, getRequestId(req));
  }
}
