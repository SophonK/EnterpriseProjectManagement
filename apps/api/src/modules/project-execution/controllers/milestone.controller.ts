import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import {
  AddMilestoneSchema,
  UpdateMilestoneSchema,
  type MilestoneDTO,
} from "@epm/shared";
import { RequirePermission } from "../../../foundation/auth/decorators.js";
import { getAuth, getRequestId } from "../../../foundation/logging/request-context.js";
import { ZodValidationPipe } from "../../../foundation/validation/zod-validation.pipe.js";
import { MilestoneService } from "../services/milestone.service.js";

@Controller("api/v1/projects/:projectId/milestones")
export class MilestoneController {
  constructor(private readonly milestoneService: MilestoneService) {}

  @Post()
  @RequirePermission("milestone:create")
  async addMilestone(
    @Param("projectId") projectId: string,
    @Body(new ZodValidationPipe(AddMilestoneSchema)) body: unknown,
    @Req() req: Request,
  ): Promise<MilestoneDTO> {
    const cmd = body as import("@epm/shared").AddMilestoneCommand;
    return this.milestoneService.addMilestone(projectId, cmd, getAuth(req)!, getRequestId(req));
  }

  @Get()
  @RequirePermission("milestone:read")
  async listMilestones(@Param("projectId") projectId: string): Promise<MilestoneDTO[]> {
    return this.milestoneService.listMilestones(projectId);
  }

  @Patch(":id")
  @RequirePermission("milestone:update")
  async updateMilestone(
    @Param("projectId") projectId: string,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(UpdateMilestoneSchema)) body: unknown,
    @Req() req: Request,
  ): Promise<MilestoneDTO> {
    const cmd = body as import("@epm/shared").UpdateMilestoneCommand;
    return this.milestoneService.updateMilestone(id, projectId, cmd, getAuth(req)!, getRequestId(req));
  }

  @Delete(":id")
  @HttpCode(204)
  @RequirePermission("milestone:delete")
  async deleteMilestone(
    @Param("projectId") projectId: string,
    @Param("id") id: string,
    @Req() req: Request,
  ): Promise<void> {
    return this.milestoneService.deleteMilestone(id, projectId, getAuth(req)!, getRequestId(req));
  }
}
