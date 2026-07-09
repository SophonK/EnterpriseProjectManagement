import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  AppError,
  RISK_RAID_EVENTS,
  computeRiskScore,
  isValidStatusTransition,
} from "@epm/shared";
import type {
  AuthContext,
  CreateRaidItemCommand,
  UpdateRaidItemCommand,
  RaidItemDTO,
  RaidListDTO,
  RaidFilter,
} from "@epm/shared";
import { EVENT_BUS, type EventBus } from "../../../foundation/events/event-bus.js";
import { AuditService } from "../../../foundation/audit/audit.service.js";
import { RaidItemRepository } from "../repositories/raid-item.repository.js";
import type { ProjectService } from "../../project-execution/services/project.service.js";

const DEFAULT_ESCALATION_THRESHOLD = 15;

@Injectable()
export class RaidItemService {
  private readonly escalationThreshold: number;

  constructor(
    private readonly raidItemRepo: RaidItemRepository,
    @Inject(EVENT_BUS) private readonly eventBus: EventBus,
    private readonly auditService: AuditService,
    @Inject("PROJECT_SERVICE") private readonly projectService: ProjectService,
  ) {
    const envThreshold = process.env["RAID_ESCALATION_THRESHOLD"];
    this.escalationThreshold = envThreshold ? Number(envThreshold) : DEFAULT_ESCALATION_THRESHOLD;
  }

  /**
   * C3: resolve the caller's accessible project ids from project-execution (the
   * source of truth). Director/unrestricted callers ⇒ `null` (no project filter);
   * everyone else is restricted to the projects listProjects returns under their scope.
   *
   * Pagination note: listProjects caps pageSize at 100, so we loop pages until we have
   * every accessible id. For callers whose scope spans an unusually large number of
   * projects this issues several queries, but it is correct and fail-closed (a missed
   * page can only narrow, never widen, access).
   */
  private async accessibleProjectIds(ctx: AuthContext): Promise<string[] | null> {
    if (ctx.roles.includes("EPMO_DIRECTOR")) return null;
    const pageSize = 100;
    const ids: string[] = [];
    for (let page = 1; ; page++) {
      const result = await this.projectService.listProjects({ page, pageSize }, ctx);
      for (const p of result.data) ids.push(p.id);
      if (page * pageSize >= result.total || result.data.length === 0) break;
    }
    return ids;
  }

  async createRaidItem(
    cmd: CreateRaidItemCommand,
    ctx: AuthContext,
    requestId: string,
  ): Promise<RaidItemDTO> {
    // Validate project reference
    await this.projectService.getProject(cmd.projectId, ctx).catch(() => {
      throw new AppError("RISK_002", `Project ${cmd.projectId} not found or not accessible`);
    });

    const riskScore = computeRiskScore(cmd.severity ?? null, cmd.probability ?? null);
    const initialStatus = cmd.ownerId ? "InProgress" : "Open";
    const escalated = riskScore != null && riskScore >= this.escalationThreshold;

    const item = await this.raidItemRepo.create({
      projectId: cmd.projectId,
      type: cmd.type,
      title: cmd.title,
      description: cmd.description,
      severity: cmd.severity,
      probability: cmd.probability,
      riskScore: riskScore ?? undefined,
      status: initialStatus,
      escalated,
      ownerUserId: cmd.ownerId,
      mitigation: cmd.mitigation,
      createdBy: ctx.userId,
    });

    await this.auditService.record({
      entityType: "RaidItem",
      entityId: item.id,
      action: "create",
      actorId: ctx.userId,
      requestId,
      after: item,
    });

    await this.eventBus.publish({
      eventId: randomUUID(),
      eventType: RISK_RAID_EVENTS.RAID_LOGGED,
      occurredAt: new Date().toISOString(),
      source: "risk-raid",
      data: {
        raidItemId: item.id,
        projectId: item.projectId,
        type: item.type,
        title: item.title,
        riskScore: item.riskScore,
        escalated: item.escalated,
      },
    });

    if (escalated) {
      await this.eventBus.publish({
        eventId: randomUUID(),
        eventType: RISK_RAID_EVENTS.RISK_ESCALATED,
        occurredAt: new Date().toISOString(),
        source: "risk-raid",
        data: {
          raidItemId: item.id,
          projectId: item.projectId,
          riskScore: item.riskScore!,
          threshold: this.escalationThreshold,
          ownerUserId: item.ownerUserId,
        },
      });
    }

    return item;
  }

  async updateRaidItem(
    id: string,
    cmd: UpdateRaidItemCommand,
    ctx: AuthContext,
    requestId: string,
  ): Promise<RaidItemDTO> {
    const accessibleProjectIds = await this.accessibleProjectIds(ctx);
    const existing = await this.raidItemRepo.findByIdOrThrow(id, accessibleProjectIds);

    // Status transition validation
    if (cmd.status && cmd.status !== existing.status) {
      if (!isValidStatusTransition(existing.status, cmd.status)) {
        throw new AppError(
          "RISK_005",
          `Cannot transition from ${existing.status} to ${cmd.status}`,
        );
      }
    }

    // Recompute score if severity/probability changed; use !== undefined so explicit null clears the field
    const newSeverity = cmd.severity !== undefined ? cmd.severity : existing.severity;
    const newProbability = cmd.probability !== undefined ? cmd.probability : existing.probability;
    const newRiskScore = computeRiskScore(newSeverity, newProbability);

    // Auto-transition Open → InProgress if owner is being assigned
    let newStatus = cmd.status ?? existing.status;
    if (cmd.ownerId && existing.status === "Open" && newStatus === "Open") {
      newStatus = "InProgress";
    }

    // Terminal status: set closedBy / closedAt
    const TERMINAL = ["Resolved", "Closed", "Accepted", "Rejected"] as const;
    const isTerminal = (TERMINAL as readonly string[]).includes(newStatus);
    const closedBy = isTerminal && !existing.closedBy ? ctx.userId : (existing.closedBy ?? null);
    const closedAt = isTerminal && !existing.closedAt ? new Date() : (existing.closedAt ? new Date(existing.closedAt) : null);

    // Re-evaluate escalation
    const newEscalated = newRiskScore != null && newRiskScore >= this.escalationThreshold;
    const escalationChanged = newEscalated !== existing.escalated;

    const updated = await this.raidItemRepo.update(id, {
      title: cmd.title,
      description: cmd.description !== undefined ? cmd.description : undefined,
      severity: cmd.severity !== undefined ? cmd.severity : undefined,
      probability: cmd.probability !== undefined ? cmd.probability : undefined,
      riskScore: newRiskScore,
      status: newStatus,
      escalated: newEscalated,
      ownerUserId: cmd.ownerId !== undefined ? cmd.ownerId : undefined,
      mitigation: cmd.mitigation !== undefined ? cmd.mitigation : undefined,
      closedBy,
      closedAt,
    });

    await this.auditService.record({
      entityType: "RaidItem",
      entityId: id,
      action: "update",
      actorId: ctx.userId,
      requestId,
      before: existing,
      after: updated,
    });

    if (escalationChanged && newEscalated) {
      await this.eventBus.publish({
        eventId: randomUUID(),
        eventType: RISK_RAID_EVENTS.RISK_ESCALATED,
        occurredAt: new Date().toISOString(),
        source: "risk-raid",
        data: {
          raidItemId: updated.id,
          projectId: updated.projectId,
          riskScore: updated.riskScore!,
          threshold: this.escalationThreshold,
          ownerUserId: updated.ownerUserId,
        },
      });
    }

    return updated;
  }

  async getRaidItem(id: string, ctx: AuthContext): Promise<RaidItemDTO> {
    const accessibleProjectIds = await this.accessibleProjectIds(ctx);
    return this.raidItemRepo.findByIdOrThrow(id, accessibleProjectIds);
  }

  async listRaidItems(filter: RaidFilter, ctx: AuthContext): Promise<RaidListDTO> {
    const accessibleProjectIds = await this.accessibleProjectIds(ctx);
    const [data, total] = await this.raidItemRepo.findMany(filter, accessibleProjectIds);
    return {
      data,
      total,
      page: filter.page ?? 1,
      pageSize: filter.pageSize ?? 25,
    };
  }

  async deleteRaidItem(id: string, ctx: AuthContext, requestId: string): Promise<void> {
    const accessibleProjectIds = await this.accessibleProjectIds(ctx);
    const existing = await this.raidItemRepo.findByIdOrThrow(id, accessibleProjectIds);
    await this.raidItemRepo.delete(id);
    await this.auditService.record({
      entityType: "RaidItem",
      entityId: id,
      action: "delete",
      actorId: ctx.userId,
      requestId,
      before: existing,
    });
  }
}
