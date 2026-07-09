import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
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
import { PrismaService } from "../../../foundation/db/prisma.service.js";
import { DependencyRepository } from "../repositories/dependency.repository.js";
import type { ProjectService } from "../../project-execution/services/project.service.js";

const UQ_DEPENDENCY_PAIR = "uq_dependency_pair";

@Injectable()
export class DependencyService {
  constructor(
    private readonly dependencyRepo: DependencyRepository,
    @Inject(EVENT_BUS) private readonly eventBus: EventBus,
    private readonly auditService: AuditService,
    @Inject("PROJECT_SERVICE") private readonly projectService: ProjectService,
    private readonly prisma: PrismaService,
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

    // Circular dependency check: does the reverse pair already exist? Per BR-6 / P4 only
    // the DIRECT reverse pair (B→A when creating A→B) is rejected; multi-hop transitive
    // cycles (A→B, B→C, C→A) are out of scope by spec and intentionally not detected here.
    const reverse = await this.dependencyRepo.findByPair(cmd.toProjectId, cmd.fromProjectId);
    if (reverse) {
      throw new AppError(
        "RISK_003",
        `Circular dependency: ${cmd.toProjectId} → ${cmd.fromProjectId} already exists`,
      );
    }

    // Persist + audit atomically; publish only after the tx commits.
    let dependency: DependencyDTO;
    try {
      dependency = await this.prisma.$transaction(async (tx) => {
        const created = await this.dependencyRepo.create(
          {
            fromProjectId: cmd.fromProjectId,
            toProjectId: cmd.toProjectId,
            description: cmd.description,
            dependencyType: cmd.dependencyType ?? "DependsOn",
            createdBy: ctx.userId,
          },
          tx,
        );

        await this.auditService.record(
          {
            entityType: "Dependency",
            entityId: created.id,
            action: "create",
            actorId: ctx.userId,
            requestId,
            after: created,
          },
          tx,
        );

        return created;
      });
    } catch (err: unknown) {
      // Duplicate-pair unique-constraint violation. Branch on the structured Prisma
      // error code (P2002) rather than the raw message; when meta.target is populated,
      // confirm it names the dependency-pair index before mapping to RISK_003.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002" &&
        targetsDependencyPair(err.meta?.["target"])
      ) {
        throw new AppError("RISK_003", "Dependency between these projects already exists");
      }
      throw err;
    }

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
    // Low finding (intended limitation): dependency reads are deliberately NOT
    // record-scoped. Cross-project dependencies are structural links a PM must see even
    // when the far project is outside their scope (mirrors the unscoped getProjectById
    // used for the target-project soft-FK check in linkDependency). Left unchanged.
    const [data, total] = await this.dependencyRepo.findMany(filter);
    return {
      data,
      total,
      page: filter.page ?? 1,
      pageSize: filter.pageSize ?? 25,
    };
  }
}

/**
 * True when a P2002 unique-constraint violation targets the dependency-pair index.
 * `meta.target` may be the constraint name, an array of column names, or absent
 * depending on the connector; when absent we treat it as the pair (a single-row
 * `dependency.create` has no other user-facing unique constraint to violate).
 */
function targetsDependencyPair(target: unknown): boolean {
  if (target == null) return true;
  const values = Array.isArray(target) ? target : [target];
  return values.some(
    (v) =>
      typeof v === "string" &&
      (v.includes(UQ_DEPENDENCY_PAIR) || v === "fromProjectId" || v === "toProjectId"),
  );
}
