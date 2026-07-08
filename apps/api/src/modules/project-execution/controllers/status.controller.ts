import { Body, Controller, Get, Param, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { UpdateStatusHealthSchema, type StatusUpdateDTO } from "@epm/shared";
import { RequirePermission } from "../../../foundation/auth/decorators.js";
import { getAuth, getRequestId } from "../../../foundation/logging/request-context.js";
import { ZodValidationPipe } from "../../../foundation/validation/zod-validation.pipe.js";
import { ProjectService } from "../services/project.service.js";

@Controller("api/v1/projects/:projectId/status")
export class StatusController {
  constructor(private readonly projectService: ProjectService) {}

  @Post()
  @RequirePermission("project:update-status")
  async updateStatusHealth(
    @Param("projectId") projectId: string,
    @Body(new ZodValidationPipe(UpdateStatusHealthSchema)) body: unknown,
    @Req() req: Request,
  ): Promise<StatusUpdateDTO> {
    const cmd = body as import("@epm/shared").UpdateStatusHealthCommand;
    return this.projectService.updateStatusHealth(projectId, cmd, getAuth(req)!, getRequestId(req));
  }

  @Get()
  @RequirePermission("project:read")
  async getStatusHistory(@Param("projectId") projectId: string): Promise<StatusUpdateDTO[]> {
    return this.projectService.getStatusHistory(projectId);
  }
}
