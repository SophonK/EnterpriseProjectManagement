import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { AppError, RISK_RAID_EVENTS } from "@epm/shared";
import type {
  AuthContext,
  CreateDependencyCommand,
  DependencyDTO,
  DependencyListDTO,
  DependencyFilter,
} from "@epm/shared";
import { EVENT_BUS, type EventBus } from "../../../foundation/events/event-bus.js";
import { AuditService } from "../../../foundation/audit/audit.service.js";
import { DependencyRepository } from "../repositories/dependency.repository.js";
import type { ProjectService } from "../../project-execution/services/project.service.js";

@Injectable()
export class DependencyService {
  constructor(
    private readonly dependencyRepo: DependencyRepository,
    @Inject(EVENT_BUS) private readonly eventBus: EventBus,
    private readonly auditService: AuditService,
    @Inject("PROJECT_SERVICE") private readonly projectService: ProjectService,
  ) {}

  async linkDependency(
    cmd: CreateDependencyCommand,
    ctx: AuthContext,
    requestId: string,
  ): Promise<DependencyDTO> {
    if (cmd.fromProjectId === cmd.toProjectId) {
      throw new AppError("RISK_001", "fromProjectId and toProjectId must be different");
    }

    // Validate both project references
    await this.projectService.getProject(cmd.fromProjectId, ctx).catch(() => {
      throw new AppError("RISK_002", `Project ${cmd.fromProjectId} not found or not accessible`);
    });
    // Target project validated without record-scope enforcement: a PM may declare a
    // dependency on a project outside their own scope (cross-project by design).
    await this.projectService.getProjectById(cmd.toProjectId).catch(() => {
      throw new AppError("RISK_002", `Project ${cmd.toProjectId} not found`);
    });

    // Circular dependency check: does the reverse pair already exist?
    const reverse = await this.dependencyRepo.findByPair(cmd.toProjectId, cmd.fromProjectId);
    if (reverse) {
      throw new AppError(
        "RISK_003",
        `Circular dependency: ${cmd.toProjectId} → ${cmd.fromProjectId} already exists`,
      );
    }

    let dependency: DependencyDTO;
    try {
      dependency = await this.dependencyRepo.create({
        fromProjectId: cmd.fromProjectId,
        toProjectId: cmd.toProjectId,
        description: cmd.description,
        dependencyType: cmd.dependencyType ?? "DependsOn",
        createdBy: ctx.userId,
      });
    } catch (err: unknown) {
      // Unique constraint violation — duplicate pair
      if (err instanceof Error && err.message.includes("uq_dependency_pair")) {
        throw new AppError("RISK_003", "Dependency between these projects already exists");
      }
      throw err;
    }

    await this.auditService.record({
      entityType: "Dependency",
      entityId: dependency.id,
      action: "create",
      actorId: ctx.userId,
      requestId,
      after: dependency,
    });

    await this.eventBus.publish({
      eventId: randomUUID(),
      eventType: RISK_RAID_EVENTS.DEPENDENCY_LINKED,
      occurredAt: new Date().toISOString(),
      source: "risk-raid",
      data: {
        dependencyId: dependency.id,
        fromProjectId: dependency.fromProjectId,
        toProjectId: dependency.toProjectId,
        dependencyType: dependency.dependencyType,
      },
    });

    return dependency;
  }

  async unlinkDependency(id: string, ctx: AuthContext, requestId: string): Promise<void> {
    const existing = await this.dependencyRepo.findByIdOrThrow(id);
    await this.dependencyRepo.delete(id);
    await this.auditService.record({
      entityType: "Dependency",
      entityId: id,
      action: "delete",
      actorId: ctx.userId,
      requestId,
      before: existing,
    });
  }

  async getDependency(id: string): Promise<DependencyDTO> {
    return this.dependencyRepo.findByIdOrThrow(id);
  }

  async listDependencies(filter: DependencyFilter, _ctx: AuthContext): Promise<DependencyListDTO> {
    const [data, total] = await this.dependencyRepo.findMany(filter);
    return {
      data,
      total,
      page: filter.page ?? 1,
      pageSize: filter.pageSize ?? 25,
    };
  }
}
