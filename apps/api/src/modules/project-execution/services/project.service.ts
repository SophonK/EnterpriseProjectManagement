import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  AppError,
  PROJECT_EXECUTION_EVENTS,
  type AuthContext,
  type CreateProjectCommand,
  type UpdateProjectCommand,
  type UpdateStatusHealthCommand,
  type ProjectDTO,
  type ProjectFilter,
  type ProjectListDTO,
  type ProjectStatus,
  type ProjectHealth,
  type StatusUpdateDTO,
} from "@epm/shared";
import { EVENT_BUS, type EventBus } from "../../../foundation/events/event-bus.js";
import { AuditService } from "../../../foundation/audit/audit.service.js";
import { ProjectRepository } from "../repositories/project.repository.js";
import { StatusUpdateRepository } from "../repositories/status-update.repository.js";

/** Status transition table: [from] → allowed [to] values */
const VALID_TRANSITIONS: Record<ProjectStatus, ProjectStatus[]> = {
  Open:      ["Active"],
  Active:    ["Completed", "Cancelled"],
  Completed: [],
  Cancelled: [],
};

@Injectable()
export class ProjectService {
  constructor(
    private readonly projectRepo: ProjectRepository,
    private readonly statusUpdateRepo: StatusUpdateRepository,
    @Inject(EVENT_BUS) private readonly eventBus: EventBus,
    private readonly auditService: AuditService,
  ) {}

  async createProject(
    cmd: CreateProjectCommand & { sourceDemandId?: string | null },
    ctx: AuthContext,
    requestId: string,
  ): Promise<ProjectDTO> {
    // Idempotency: if created from demand, check for existing project
    if (cmd.sourceDemandId) {
      const existing = await this.projectRepo.findBySourceDemandId(cmd.sourceDemandId);
      if (existing) return existing;
    }

    // Duplicate name guard within portfolio
    const duplicate = await this.projectRepo.existsByNameInPortfolio(cmd.name, cmd.portfolioId);
    if (duplicate) throw new AppError("EXECUTION_004", `Project "${cmd.name}" already exists in this portfolio`);

    const dto = await this.projectRepo.create({
      name: cmd.name,
      description: cmd.description ?? null,
      ownerUserId: ctx.userId,
      portfolioId: cmd.portfolioId,
      programId: cmd.programId ?? null,
      plannedStart: new Date(cmd.plannedStart),
      plannedEnd: new Date(cmd.plannedEnd),
      plannedBudget: cmd.plannedBudget ?? null,
      sourceDemandId: cmd.sourceDemandId ?? null,
      createdBy: ctx.userId,
    });

    await this.auditService.record({
      actorId: ctx.userId,
      action: "create",
      entityType: "project",
      entityId: dto.id,
      after: dto,
      requestId,
    });

    await this.eventBus.publish({
      eventId: randomUUID(),
      eventType: PROJECT_EXECUTION_EVENTS.PROJECT_CREATED,
      occurredAt: new Date().toISOString(),
      source: "project-execution",
      data: {
        projectId: dto.id,
        portfolioId: dto.portfolioId,
        programId: dto.programId,
        name: dto.name,
        ownerUserId: dto.ownerUserId,
      },
    });

    return dto;
  }

  async updateProject(
    id: string,
    cmd: UpdateProjectCommand,
    ctx: AuthContext,
    requestId: string,
  ): Promise<ProjectDTO> {
    const before = await this.projectRepo.findByIdOrThrow(id);

    // Date range cross-validation against stored counterpart
    const effectiveStart = cmd.plannedStart ? new Date(cmd.plannedStart) : new Date(before.plannedStart);
    const effectiveEnd   = cmd.plannedEnd   ? new Date(cmd.plannedEnd)   : new Date(before.plannedEnd);
    if (effectiveEnd < effectiveStart) {
      throw new AppError("EXECUTION_001", "plannedEnd must be on or after plannedStart");
    }

    const dto = await this.projectRepo.update(id, {
      name:          cmd.name,
      description:   cmd.description,
      programId:     cmd.programId,
      plannedStart:  cmd.plannedStart  ? new Date(cmd.plannedStart)  : undefined,
      plannedEnd:    cmd.plannedEnd    ? new Date(cmd.plannedEnd)    : undefined,
      plannedBudget: cmd.plannedBudget,
    });

    await this.auditService.record({
      actorId: ctx.userId,
      action: "update",
      entityType: "project",
      entityId: id,
      before,
      after: dto,
      requestId,
    });

    return dto;
  }

  async archiveProject(id: string, ctx: AuthContext, requestId: string): Promise<void> {
    const before = await this.projectRepo.findByIdOrThrow(id);
    await this.projectRepo.archive(id);
    await this.auditService.record({
      actorId: ctx.userId,
      action: "delete",
      entityType: "project",
      entityId: id,
      before,
      requestId,
    });
  }

  async getProject(id: string): Promise<ProjectDTO> {
    return this.projectRepo.findByIdOrThrow(id);
  }

  async listProjects(filter: ProjectFilter, ctx: AuthContext): Promise<ProjectListDTO> {
    const { data, total } = await this.projectRepo.findMany(filter, ctx);
    return {
      data,
      total,
      page: filter.page ?? 1,
      pageSize: Math.min(filter.pageSize ?? 20, 100),
    };
  }

  async updateStatusHealth(
    id: string,
    cmd: UpdateStatusHealthCommand,
    ctx: AuthContext,
    requestId: string,
  ): Promise<StatusUpdateDTO> {
    const project = await this.projectRepo.findByIdOrThrow(id);

    // Enforce state machine
    const allowed = VALID_TRANSITIONS[project.status as ProjectStatus] ?? [];
    if (!allowed.includes(cmd.status)) {
      throw new AppError(
        "EXECUTION_003",
        `Cannot transition project from "${project.status}" to "${cmd.status}"`,
      );
    }

    // Persist status update (append-only) and update project columns atomically
    const statusUpdate = await this.statusUpdateRepo.append({
      projectId: id,
      status: cmd.status,
      health: cmd.health,
      note: cmd.note ?? null,
      recordedBy: ctx.userId,
    });
    await this.projectRepo.updateStatusHealth(id, cmd.status, cmd.health);

    await this.auditService.record({
      actorId: ctx.userId,
      action: "update",
      entityType: "project.status",
      entityId: id,
      before: { status: project.status, health: project.health },
      after:  { status: cmd.status,     health: cmd.health },
      requestId,
    });

    await this.eventBus.publish({
      eventId: randomUUID(),
      eventType: PROJECT_EXECUTION_EVENTS.STATUS_CHANGED,
      occurredAt: new Date().toISOString(),
      source: "project-execution",
      data: {
        projectId: id,
        portfolioId: project.portfolioId,
        programId: project.programId,
        status: cmd.status,
        health: cmd.health,
        previousHealth: project.health as ProjectHealth,
      },
    });

    return statusUpdate;
  }

  async getStatusHistory(id: string): Promise<StatusUpdateDTO[]> {
    await this.projectRepo.findByIdOrThrow(id); // existence check
    return this.statusUpdateRepo.findByProject(id);
  }
}
