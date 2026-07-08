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
    await this.projectRepo.findByIdOrThrow(projectId); // existence + scope check

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

    // Publish overdue event immediately if past due date
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

    // Publish overdue event if transition from not-overdue → overdue
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

  async listMilestones(projectId: string): Promise<MilestoneDTO[]> {
    return this.milestoneRepo.findByProject(projectId);
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
