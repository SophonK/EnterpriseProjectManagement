import { Body, Controller, Get, Param, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import {
  UpdateStatusHealthSchema,
  type UpdateStatusHealthCommand,
  type StatusUpdateDTO,
} from "@epm/shared";
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
    @Body(new ZodValidationPipe(UpdateStatusHealthSchema)) body: UpdateStatusHealthCommand,
    @Req() req: Request,
  ): Promise<StatusUpdateDTO> {
    return this.projectService.updateStatusHealth(projectId, body, getAuth(req)!, getRequestId(req));
  }

  // C-1: pass auth so history is scoped to the caller's accessible projects
  @Get()
  @RequirePermission("project:read")
  async getStatusHistory(
    @Param("projectId") projectId: string,
    @Req() req: Request,
  ): Promise<StatusUpdateDTO[]> {
    return this.projectService.getStatusHistory(projectId, getAuth(req)!);
  }
}
