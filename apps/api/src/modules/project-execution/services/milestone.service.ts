import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  PROJECT_EXECUTION_EVENTS,
  type AuthContext,
  type AddMilestoneCommand,
  type UpdateMilestoneCommand,
  type MilestoneDTO,
} from "@epm/shared";
import { EVENT_BUS, type EventBus } from "../../../foundation/events/event-bus.js";
import { AuditService } from "../../../foundation/audit/audit.service.js";
import { MilestoneRepository } from "../repositories/milestone.repository.js";
import { ProjectRepository } from "../repositories/project.repository.js";

@Injectable()
export class MilestoneService {
  constructor(
    private readonly milestoneRepo: MilestoneRepository,
    private readonly projectRepo: ProjectRepository,
    @Inject(EVENT_BUS) private readonly eventBus: EventBus,
    private readonly auditService: AuditService,
  ) {}

  async addMilestone(
    projectId: string,
    cmd: AddMilestoneCommand,
    ctx: AuthContext,
    requestId: string,
  ): Promise<MilestoneDTO> {
    await this.projectRepo.findByIdScoped(projectId, ctx);

    const dto = await this.milestoneRepo.create({
      projectId,
      title: cmd.title,
      description: cmd.description ?? null,
      dueDate: new Date(cmd.dueDate),
      sortOrder: cmd.sortOrder ?? 0,
      createdBy: ctx.userId,
    });

    await this.auditService.record({
      actorId: ctx.userId,
      action: "create",
      entityType: "milestone",
      entityId: dto.id,
      after: dto,
      requestId,
    });

    if (dto.overdue) {
      await this.publishOverdue(dto);
    }

    return dto;
  }

  async updateMilestone(
    id: string,
    projectId: string,
    cmd: UpdateMilestoneCommand,
    ctx: AuthContext,
    requestId: string,
  ): Promise<MilestoneDTO> {
    await this.projectRepo.findByIdScoped(projectId, ctx);
    const before = await this.milestoneRepo.findByIdOrThrow(id, projectId);

    const dto = await this.milestoneRepo.update(id, {
      title:       cmd.title,
      description: cmd.description,
      dueDate:     cmd.dueDate     ? new Date(cmd.dueDate)     : undefined,
      completedAt: cmd.completedAt !== undefined
        ? (cmd.completedAt ? new Date(cmd.completedAt) : null)
        : undefined,
      sortOrder:   cmd.sortOrder,
    });

    await this.auditService.record({
      actorId: ctx.userId,
      action: "update",
      entityType: "milestone",
      entityId: id,
      before,
      after: dto,
      requestId,
    });

    if (!before.overdue && dto.overdue) {
      await this.publishOverdue(dto);
    }

    return dto;
  }

  async deleteMilestone(
    id: string,
    projectId: string,
    ctx: AuthContext,
    requestId: string,
  ): Promise<void> {
    await this.projectRepo.findByIdScoped(projectId, ctx);
    const before = await this.milestoneRepo.findByIdOrThrow(id, projectId);
    await this.milestoneRepo.delete(id, projectId);
    await this.auditService.record({
      actorId: ctx.userId,
      action: "delete",
      entityType: "milestone",
      entityId: id,
      before,
      requestId,
    });
  }

  // C-3 + m-4: scope check on parent project + publish events for newly-overdue milestones
  async listMilestones(projectId: string, ctx: AuthContext): Promise<MilestoneDTO[]> {
    await this.projectRepo.findByIdScoped(projectId, ctx);
    const { milestones, newlyOverdueIds } = await this.milestoneRepo.findByProject(projectId);

    // M-4: emit MILESTONE_OVERDUE for each milestone materialized during this read
    for (const overdueId of newlyOverdueIds) {
      const dto = milestones.find((m) => m.id === overdueId);
      if (dto) await this.publishOverdue(dto);
    }

    return milestones;
  }

  private async publishOverdue(dto: MilestoneDTO): Promise<void> {
    await this.eventBus.publish({
      eventId: randomUUID(),
      eventType: PROJECT_EXECUTION_EVENTS.MILESTONE_OVERDUE,
      occurredAt: new Date().toISOString(),
      source: "project-execution",
      data: {
        milestoneId: dto.id,
        projectId:   dto.projectId,
        dueDate:     dto.dueDate,
      },
    });
  }
}
