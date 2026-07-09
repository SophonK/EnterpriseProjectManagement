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
import { PrismaService } from "../../../foundation/db/prisma.service.js";
import { RaidItemRepository } from "../repositories/raid-item.repository.js";
import type { ProjectService } from "../../project-execution/services/project.service.js";
import { resolveAccessibleProjectIds } from "./project-scope.js";

const DEFAULT_ESCALATION_THRESHOLD = 15;

@Injectable()
export class RaidItemService {
  private readonly escalationThreshold: number;

  constructor(
    private readonly raidItemRepo: RaidItemRepository,
    @Inject(EVENT_BUS) private readonly eventBus: EventBus,
    private readonly auditService: AuditService,
    @Inject("PROJECT_SERVICE") private readonly projectService: ProjectService,
    private readonly prisma: PrismaService,
  ) {
    // Low finding: validate/clamp the env threshold. Number("") === 0 and
    // Number("garbage") === NaN would otherwise silently disable escalation (>25) or
    // over-trigger it (0). Require a finite, positive number; otherwise use the
    // documented default (15).
    const raw = process.env["RAID_ESCALATION_THRESHOLD"];
    const parsed = raw != null && raw.trim() !== "" ? Number(raw) : NaN;
    this.escalationThreshold =
      Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_ESCALATION_THRESHOLD;
  }

  /** C3: resolve accessible project ids via the unit's shared scope resolver. */
  private accessibleProjectIds(ctx: AuthContext): Promise<string[] | null> {
    return resolveAccessibleProjectIds(this.projectService, ctx);
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

    // BR-2/BR-3: score + escalation apply only to Risk-type items. For
    // Issue/Assumption/Dependency, force severity/probability/riskScore = null and
    // escalated = false, and never publish risk.escalated.
    const isRisk = cmd.type === "Risk";
    const riskScore = isRisk
      ? computeRiskScore(cmd.severity ?? null, cmd.probability ?? null)
      : null;
    const initialStatus = cmd.ownerId ? "InProgress" : "Open";
    const escalated = isRisk && riskScore != null && riskScore >= this.escalationThreshold;

    // Persist + audit atomically; publish only after the tx commits.
    const item = await this.prisma.$transaction(async (tx) => {
      const created = await this.raidItemRepo.create(
        {
          projectId: cmd.projectId,
          type: cmd.type,
          title: cmd.title,
          description: cmd.description,
          severity: isRisk ? cmd.severity : undefined,
          probability: isRisk ? cmd.probability : undefined,
          riskScore: riskScore ?? undefined,
          status: initialStatus,
          escalated,
          ownerUserId: cmd.ownerId,
          mitigation: cmd.mitigation,
          createdBy: ctx.userId,
        },
        tx,
      );

      await this.auditService.record(
        {
          entityType: "RaidItem",
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

    // Status transition validation.
    // Low finding (intended, not changed): isValidStatusTransition (in @epm/shared,
    // off-limits) permits a direct Open → terminal jump so the system archive-cascade can
    // close Open items. A user PATCH can therefore also jump Open → Closed/Rejected
    // without passing through InProgress; accepted per BR-4 (terminal statuses are the gate).
    if (cmd.status && cmd.status !== existing.status) {
      if (!isValidStatusTransition(existing.status, cmd.status)) {
        throw new AppError(
          "RISK_005",
          `Cannot transition from ${existing.status} to ${cmd.status}`,
        );
      }
    }

    // BR-2/BR-3: score + escalation apply only to Risk-type items. Type is immutable
    // (no `type` on UpdateRaidItemCommand), so we key off the existing type: for
    // non-Risk items force severity/probability/riskScore = null and escalated = false.
    const isRisk = existing.type === "Risk";
    // Recompute score if severity/probability changed; use !== undefined so explicit null clears the field
    const newSeverity = isRisk
      ? cmd.severity !== undefined ? cmd.severity : existing.severity
      : null;
    const newProbability = isRisk
      ? cmd.probability !== undefined ? cmd.probability : existing.probability
      : null;
    const newRiskScore = isRisk ? computeRiskScore(newSeverity, newProbability) : null;

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

    // Re-evaluate escalation (never for non-Risk types)
    const newEscalated = isRisk && newRiskScore != null && newRiskScore >= this.escalationThreshold;
    const escalationChanged = newEscalated !== existing.escalated;

    // Persist + audit atomically; publish only after the tx commits.
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await this.raidItemRepo.update(
        id,
        {
          title: cmd.title,
          description: cmd.description !== undefined ? cmd.description : undefined,
          severity: isRisk ? (cmd.severity !== undefined ? cmd.severity : undefined) : null,
          probability: isRisk ? (cmd.probability !== undefined ? cmd.probability : undefined) : null,
          riskScore: newRiskScore,
          status: newStatus,
          escalated: newEscalated,
          ownerUserId: cmd.ownerId !== undefined ? cmd.ownerId : undefined,
          mitigation: cmd.mitigation !== undefined ? cmd.mitigation : undefined,
          closedBy,
          closedAt,
        },
        tx,
      );

      await this.auditService.record(
        {
          entityType: "RaidItem",
          entityId: id,
          action: "update",
          actorId: ctx.userId,
          requestId,
          before: existing,
          after: row,
        },
        tx,
      );

      return row;
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
