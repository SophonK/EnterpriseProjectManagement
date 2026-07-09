import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { AppError, RESOURCE_MANAGEMENT_EVENTS } from "@epm/shared";
import type {
  AuthContext,
  AllocateResourceCommand,
  UpdateAllocationCommand,
  AllocationDTO,
  AllocateResultDTO,
  OverAllocationWarning,
} from "@epm/shared";
import { EVENT_BUS, type EventBus } from "../../../foundation/events/event-bus.js";
import { AuditService } from "../../../foundation/audit/audit.service.js";
import { PrismaService } from "../../../foundation/db/prisma.service.js";
import { AllocationRepository } from "../repositories/allocation.repository.js";
import { ResourceRepository } from "../repositories/resource.repository.js";
import type { ProjectService } from "../../project-execution/services/project.service.js";

/** First day of the calendar month for a given date. */
export function firstOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

/** All calendar month start dates between periodStart and periodEnd (inclusive). */
export function monthsInRange(start: Date, end: Date): Date[] {
  const months: Date[] = [];
  let cur = firstOfMonth(start);
  const last = firstOfMonth(end);
  while (cur <= last) {
    months.push(new Date(cur));
    cur = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 1));
  }
  return months;
}

/** Derive utilization band. */
export function utilizationBand(pct: number): "Under" | "Optimal" | "Over" {
  if (pct < 80) return "Under";
  if (pct <= 100) return "Optimal";
  return "Over";
}

@Injectable()
export class AllocationService {
  constructor(
    private readonly allocationRepo: AllocationRepository,
    private readonly resourceRepo: ResourceRepository,
    @Inject(EVENT_BUS) private readonly eventBus: EventBus,
    private readonly auditService: AuditService,
    private readonly prisma: PrismaService,
    @Inject("PROJECT_SERVICE") private readonly projectService: ProjectService,
  ) {}

  async allocate(
    resourceId: string,
    cmd: AllocateResourceCommand,
    ctx: AuthContext,
    requestId: string,
  ): Promise<AllocateResultDTO> {
    // Scope check
    const resource = await this.resourceRepo.findByIdOrThrow(resourceId, ctx);

    // Validate projectId via ProjectService
    await this.projectService.getProject(cmd.projectId, ctx).catch(() => {
      throw new AppError("RESOURCE_002", `Project ${cmd.projectId} not found or not accessible`);
    });

    // Normalise period to first-of-month
    const periodStart = firstOfMonth(new Date(cmd.periodStart));
    const periodEnd = firstOfMonth(new Date(cmd.periodEnd));

    // Over-allocation check across every month in the range
    const months = monthsInRange(periodStart, periodEnd);
    const overAllocMonths: Array<{ month: string; totalPct: number }> = [];

    for (const month of months) {
      const existing = await this.allocationRepo.sumOverlapping(resourceId, month);
      const total = existing + cmd.allocationPct;
      if (total > 100) {
        overAllocMonths.push({
          month: `${month.getUTCFullYear()}-${String(month.getUTCMonth() + 1).padStart(2, "0")}`,
          totalPct: total,
        });
      }
    }

    if (overAllocMonths.length > 0 && !cmd.confirmOverAllocation) {
      throw new AppError(
        "RESOURCE_004",
        "Allocation would cause over-allocation. Set confirmOverAllocation=true to proceed.",
      );
    }

    const isOverAlloc = overAllocMonths.length > 0;

    // Atomic: create allocation + update resource.overAllocated flag
    const [allocation] = await this.prisma.$transaction([
      this.prisma.allocation.create({
        data: {
          resourceId,
          projectId: cmd.projectId,
          periodStart,
          periodEnd,
          allocationPct: cmd.allocationPct,
          overAllocatedConfirmed: isOverAlloc,
          createdBy: ctx.userId,
          updatedAt: new Date(),
        },
      }),
      ...(isOverAlloc
        ? [
            this.prisma.resource.update({
              where: { id: resourceId },
              data: { overAllocated: true, updatedAt: new Date() },
            }),
          ]
        : []),
    ]);

    const allocationDTO: AllocationDTO = {
      id: allocation.id,
      resourceId: allocation.resourceId,
      projectId: allocation.projectId,
      periodStart: allocation.periodStart.toISOString().slice(0, 10),
      periodEnd: allocation.periodEnd.toISOString().slice(0, 10),
      allocationPct: Number(allocation.allocationPct),
      overAllocatedConfirmed: allocation.overAllocatedConfirmed,
      createdBy: allocation.createdBy,
      createdAt: allocation.createdAt.toISOString(),
      updatedAt: allocation.updatedAt.toISOString(),
    };

    await this.auditService.record({
      actorId: ctx.userId,
      action: "create",
      entityType: "allocation",
      entityId: allocationDTO.id,
      after: allocationDTO,
      requestId,
    });

    await this.eventBus.publish({
      eventId: randomUUID(),
      eventType: RESOURCE_MANAGEMENT_EVENTS.RESOURCE_ALLOCATED,
      occurredAt: new Date().toISOString(),
      source: "resource-management",
      data: {
        allocationId: allocationDTO.id,
        resourceId,
        projectId: cmd.projectId,
        periodStart: allocationDTO.periodStart,
        periodEnd: allocationDTO.periodEnd,
        allocationPct: cmd.allocationPct,
      },
    });

    if (isOverAlloc) {
      await this.eventBus.publish({
        eventId: randomUUID(),
        eventType: RESOURCE_MANAGEMENT_EVENTS.RESOURCE_OVER_ALLOCATED,
        occurredAt: new Date().toISOString(),
        source: "resource-management",
        data: {
          resourceId,
          poolId: resource.poolId,
          periods: overAllocMonths,
        },
      });
    }

    const result: AllocateResultDTO = { allocation: allocationDTO };
    if (isOverAlloc) {
      result.overAllocationWarning = {
        periods: overAllocMonths,
        requiresConfirmation: false, // already confirmed at this point
      } satisfies OverAllocationWarning;
    }
    return result;
  }

  async updateAllocation(
    id: string,
    resourceId: string,
    cmd: UpdateAllocationCommand,
    ctx: AuthContext,
    requestId: string,
  ): Promise<AllocateResultDTO> {
    await this.resourceRepo.findByIdOrThrow(resourceId, ctx);
    const before = await this.allocationRepo.findByIdOrThrow(id, resourceId);

    const periodStart = cmd.periodStart
      ? firstOfMonth(new Date(cmd.periodStart))
      : new Date(before.periodStart);
    const periodEnd = cmd.periodEnd
      ? firstOfMonth(new Date(cmd.periodEnd))
      : new Date(before.periodEnd);
    const allocationPct = cmd.allocationPct ?? before.allocationPct;

    // Check over-alloc excluding current allocation
    const months = monthsInRange(periodStart, periodEnd);
    const overAllocMonths: Array<{ month: string; totalPct: number }> = [];
    for (const month of months) {
      const existing = await this.allocationRepo.sumOverlapping(resourceId, month, id);
      const total = existing + allocationPct;
      if (total > 100) {
        overAllocMonths.push({
          month: `${month.getUTCFullYear()}-${String(month.getUTCMonth() + 1).padStart(2, "0")}`,
          totalPct: total,
        });
      }
    }

    if (overAllocMonths.length > 0 && !cmd.confirmOverAllocation) {
      throw new AppError("RESOURCE_004", "Allocation would cause over-allocation. Set confirmOverAllocation=true to proceed.");
    }

    const isOverAlloc = overAllocMonths.length > 0;

    const [updated] = await this.prisma.$transaction([
      this.prisma.allocation.update({
        where: { id },
        data: {
          periodStart,
          periodEnd,
          allocationPct,
          overAllocatedConfirmed: isOverAlloc,
          updatedAt: new Date(),
        },
      }),
      ...(isOverAlloc
        ? [this.prisma.resource.update({ where: { id: resourceId }, data: { overAllocated: true, updatedAt: new Date() } })]
        : []),
    ]);

    const allocationDTO: AllocationDTO = {
      id: updated.id,
      resourceId: updated.resourceId,
      projectId: updated.projectId,
      periodStart: updated.periodStart.toISOString().slice(0, 10),
      periodEnd: updated.periodEnd.toISOString().slice(0, 10),
      allocationPct: Number(updated.allocationPct),
      overAllocatedConfirmed: updated.overAllocatedConfirmed,
      createdBy: updated.createdBy,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };

    await this.auditService.record({
      actorId: ctx.userId,
      action: "update",
      entityType: "allocation",
      entityId: id,
      before,
      after: allocationDTO,
      requestId,
    });

    const result: AllocateResultDTO = { allocation: allocationDTO };
    if (isOverAlloc) result.overAllocationWarning = { periods: overAllocMonths, requiresConfirmation: false };
    return result;
  }

  async deleteAllocation(
    id: string,
    resourceId: string,
    ctx: AuthContext,
    requestId: string,
  ): Promise<void> {
    await this.resourceRepo.findByIdOrThrow(resourceId, ctx);
    const before = await this.allocationRepo.findByIdOrThrow(id, resourceId);

    await this.allocationRepo.delete(id);

    // Recompute overAllocated flag: check if any current/future month still over 100%
    const today = firstOfMonth(new Date());
    const remaining = await this.allocationRepo.findActiveForResource(resourceId, today);
    const stillOverAlloc = remaining.some((a) => a.overAllocatedConfirmed);
    await this.prisma.resource.update({
      where: { id: resourceId },
      data: { overAllocated: stillOverAlloc, updatedAt: new Date() },
    });

    await this.auditService.record({
      actorId: ctx.userId,
      action: "delete",
      entityType: "allocation",
      entityId: id,
      before,
      requestId,
    });
  }

  async getAllocationsForResource(
    resourceId: string,
    ctx: AuthContext,
    periodStart?: Date,
    periodEnd?: Date,
  ): Promise<AllocationDTO[]> {
    await this.resourceRepo.findByIdOrThrow(resourceId, ctx);
    return this.allocationRepo.findByResource(resourceId, { periodStart, periodEnd });
  }

  async getAllocationsForProject(projectId: string): Promise<AllocationDTO[]> {
    return this.allocationRepo.findByProject(projectId);
  }
}
