import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import {
  CreateDependencySchema,
  type CreateDependencyCommand,
  type DependencyDTO,
  type DependencyListDTO,
} from "@epm/shared";
import { RequirePermission } from "../../../foundation/auth/decorators.js";
import { getAuth, getRequestId } from "../../../foundation/logging/request-context.js";
import { ZodValidationPipe } from "../../../foundation/validation/zod-validation.pipe.js";
import { DependencyService } from "../services/dependency.service.js";

@Controller("api/v1/dependencies")
export class DependencyController {
  constructor(private readonly dependencyService: DependencyService) {}

  @Post()
  @RequirePermission("dependency:write")
  async linkDependency(
    @Body(new ZodValidationPipe(CreateDependencySchema, "RISK_001")) body: CreateDependencyCommand,
    @Req() req: Request,
  ): Promise<DependencyDTO> {
    return this.dependencyService.linkDependency(body, getAuth(req)!, getRequestId(req));
  }

  @Get()
  @RequirePermission("dependency:read")
  async listDependencies(
    @Query("projectId") projectId?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Req() req?: Request,
  ): Promise<DependencyListDTO> {
    return this.dependencyService.listDependencies(
      {
        projectId,
        page: page ? Number(page) : undefined,
        pageSize: pageSize ? Number(pageSize) : undefined,
      },
      getAuth(req!)!,
    );
  }

  @Get(":id")
  @RequirePermission("dependency:read")
  async getDependency(@Param("id") id: string): Promise<DependencyDTO> {
    return this.dependencyService.getDependency(id);
  }

  @Delete(":id")
  @HttpCode(204)
  @RequirePermission("dependency:write")
  async unlinkDependency(@Param("id") id: string, @Req() req: Request): Promise<void> {
    return this.dependencyService.unlinkDependency(id, getAuth(req)!, getRequestId(req));
  }
}
