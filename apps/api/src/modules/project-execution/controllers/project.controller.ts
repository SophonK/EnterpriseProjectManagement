import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import {
  CreateProjectSchema,
  UpdateProjectSchema,
  type ProjectDTO,
  type ProjectFilter,
  type ProjectListDTO,
} from "@epm/shared";
import { RequirePermission } from "../../../foundation/auth/decorators.js";
import { getAuth, getRequestId } from "../../../foundation/logging/request-context.js";
import { ZodValidationPipe } from "../../../foundation/validation/zod-validation.pipe.js";
import { ProjectService } from "../services/project.service.js";

@Controller("api/v1/projects")
export class ProjectController {
  constructor(private readonly projectService: ProjectService) {}

  @Post()
  @RequirePermission("project:create")
  async createProject(
    @Body(new ZodValidationPipe(CreateProjectSchema)) body: unknown,
    @Req() req: Request,
  ): Promise<ProjectDTO> {
    const cmd = body as import("@epm/shared").CreateProjectCommand;
    const auth = getAuth(req)!;
    return this.projectService.createProject(cmd, auth, getRequestId(req));
  }

  @Get()
  @RequirePermission("project:read")
  async listProjects(
    @Query() query: Record<string, string>,
    @Req() req: Request,
  ): Promise<ProjectListDTO> {
    const filter: ProjectFilter = {
      portfolioId: query["portfolioId"],
      programId:   query["programId"],
      health:      query["health"] as ProjectFilter["health"],
      status:      query["status"] as ProjectFilter["status"],
      page:        query["page"]     ? Number(query["page"])     : undefined,
      pageSize:    query["pageSize"] ? Number(query["pageSize"]) : undefined,
    };
    return this.projectService.listProjects(filter, getAuth(req)!);
  }

  @Get(":id")
  @RequirePermission("project:read")
  async getProject(@Param("id") id: string): Promise<ProjectDTO> {
    return this.projectService.getProject(id);
  }

  @Patch(":id")
  @RequirePermission("project:update")
  async updateProject(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(UpdateProjectSchema)) body: unknown,
    @Req() req: Request,
  ): Promise<ProjectDTO> {
    const cmd = body as import("@epm/shared").UpdateProjectCommand;
    return this.projectService.updateProject(id, cmd, getAuth(req)!, getRequestId(req));
  }

  @Delete(":id")
  @HttpCode(204)
  @RequirePermission("project:delete")
  async archiveProject(@Param("id") id: string, @Req() req: Request): Promise<void> {
    return this.projectService.archiveProject(id, getAuth(req)!, getRequestId(req));
  }
}
