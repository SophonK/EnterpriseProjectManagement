import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { AppError } from "@epm/shared";
import type { AllocationDTO } from "@epm/shared";
import { BaseRepository } from "../../../foundation/db/base-repository.js";
import type { PrismaService } from "../../../foundation/db/prisma.service.js";

@Injectable()
export class AllocationRepository extends BaseRepository {
  readonly schema = "resource" as const;

  constructor(prisma: PrismaService) {
    super(prisma);
  }

  async create(data: {
    resourceId: string;
    projectId: string;
    periodStart: Date;
    periodEnd: Date;
    allocationPct: number;
    overAllocatedConfirmed: boolean;
    createdBy: string;
  }): Promise<AllocationDTO> {
    const now = new Date();
    const row = await this.prisma.allocation.create({
      data: {
        resourceId: data.resourceId,
        projectId: data.projectId,
        periodStart: data.periodStart,
        periodEnd: data.periodEnd,
        allocationPct: new Prisma.Decimal(data.allocationPct),
        overAllocatedConfirmed: data.overAllocatedConfirmed,
        createdBy: data.createdBy,
        updatedAt: now,
      },
    });
    return toDTO(row);
  }

  async findById(id: string, resourceId: string): Promise<AllocationDTO | null> {
    const row = await this.prisma.allocation.findFirst({ where: { id, resourceId } });
    return row ? toDTO(row) : null;
  }

  async findByIdOrThrow(id: string, resourceId: string): Promise<AllocationDTO> {
    const row = await this.prisma.allocation.findFirst({ where: { id, resourceId } });
    if (!row) throw new AppError("RESOURCE_005", `Allocation ${id} not found`);
    return toDTO(row);
  }

  async findByResource(
    resourceId: string,
    opts?: { periodStart?: Date; periodEnd?: Date },
  ): Promise<AllocationDTO[]> {
    const where: Prisma.AllocationWhereInput = { resourceId };
    if (opts?.periodStart) where.periodEnd = { gte: opts.periodStart };
    if (opts?.periodEnd) where.periodStart = { lte: opts.periodEnd };
    const rows = await this.prisma.allocation.findMany({
      where,
      orderBy: { periodStart: "asc" },
    });
    return rows.map(toDTO);
  }

  async findByProject(projectId: string): Promise<AllocationDTO[]> {
    const rows = await this.prisma.allocation.findMany({
      where: { projectId },
      orderBy: { periodStart: "asc" },
    });
    return rows.map(toDTO);
  }

  /**
   * Sum allocationPct for a resource across all allocations that overlap a given month.
   * month = first day of the calendar month.
   */
  async sumOverlapping(resourceId: string, month: Date, excludeId?: string): Promise<number> {
    const where: Prisma.AllocationWhereInput = {
      resourceId,
      periodStart: { lte: month },
      periodEnd: { gte: month },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    };
    const result = await this.prisma.allocation.aggregate({
      where,
      _sum: { allocationPct: true },
    });
    return Number(result._sum.allocationPct ?? 0);
  }

  async update(
    id: string,
    data: {
      periodStart?: Date;
      periodEnd?: Date;
      allocationPct?: number;
      overAllocatedConfirmed?: boolean;
    },
  ): Promise<AllocationDTO> {
    const row = await this.prisma.allocation.update({
      where: { id },
      data: {
        ...(data.periodStart !== undefined ? { periodStart: data.periodStart } : {}),
        ...(data.periodEnd !== undefined ? { periodEnd: data.periodEnd } : {}),
        ...(data.allocationPct !== undefined
          ? { allocationPct: new Prisma.Decimal(data.allocationPct) }
          : {}),
        ...(data.overAllocatedConfirmed !== undefined
          ? { overAllocatedConfirmed: data.overAllocatedConfirmed }
          : {}),
        updatedAt: new Date(),
      },
    });
    return toDTO(row);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.allocation.delete({ where: { id } });
  }

  /** Returns all current+future allocations for a resource (used to recompute overAllocated flag). */
  async findActiveForResource(resourceId: string, fromDate: Date): Promise<AllocationDTO[]> {
    const rows = await this.prisma.allocation.findMany({
      where: { resourceId, periodEnd: { gte: fromDate } },
    });
    return rows.map(toDTO);
  }
}

// ---------------------------------------------------------------------------
// Row type & toDTO
// ---------------------------------------------------------------------------

type AllocationRow = {
  id: string;
  resourceId: string;
  projectId: string;
  periodStart: Date;
  periodEnd: Date;
  allocationPct: Prisma.Decimal;
  overAllocatedConfirmed: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

function toDTO(row: AllocationRow): AllocationDTO {
  return {
    id: row.id,
    resourceId: row.resourceId,
    projectId: row.projectId,
    periodStart: row.periodStart.toISOString().slice(0, 10),
    periodEnd: row.periodEnd.toISOString().slice(0, 10),
    allocationPct: Number(row.allocationPct),
    overAllocatedConfirmed: row.overAllocatedConfirmed,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
