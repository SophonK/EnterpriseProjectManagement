import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { CapacityPeriodDTO } from "@epm/shared";
import { BaseRepository } from "../../../foundation/db/base-repository.js";
import type { PrismaService } from "../../../foundation/db/prisma.service.js";

@Injectable()
export class CapacityPeriodRepository extends BaseRepository {
  readonly schema = "resource" as const;

  constructor(prisma: PrismaService) {
    super(prisma);
  }

  /** Upsert a capacity override for the given resource+month. */
  async upsert(data: {
    resourceId: string;
    periodStart: Date;
    capacityPct: number;
  }): Promise<CapacityPeriodDTO> {
    const now = new Date();
    const existing = await this.prisma.capacityPeriod.findFirst({
      where: { resourceId: data.resourceId, periodStart: data.periodStart },
      select: { id: true },
    });
    const row = existing
      ? await this.prisma.capacityPeriod.update({
          where: { id: existing.id },
          data: { capacityPct: new Prisma.Decimal(data.capacityPct), updatedAt: now },
        })
      : await this.prisma.capacityPeriod.create({
          data: {
            resourceId: data.resourceId,
            periodStart: data.periodStart,
            capacityPct: new Prisma.Decimal(data.capacityPct),
            updatedAt: now,
          },
        });
    return toDTO(row);
  }

  async findByResourceAndMonth(resourceId: string, month: Date): Promise<CapacityPeriodDTO | null> {
    const row = await this.prisma.capacityPeriod.findFirst({
      where: { resourceId, periodStart: month },
    });
    return row ? toDTO(row) : null;
  }

  async findByResource(resourceId: string): Promise<CapacityPeriodDTO[]> {
    const rows = await this.prisma.capacityPeriod.findMany({
      where: { resourceId },
      orderBy: { periodStart: "asc" },
    });
    return rows.map(toDTO);
  }

  /**
   * All capacity overrides for a set of resources within the inclusive month range.
   * One query — used by the utilization/capacity views to avoid per-(resource,month) lookups.
   */
  async findForResourcesInRange(
    resourceIds: string[],
    rangeStart: Date,
    rangeEnd: Date,
  ): Promise<Array<{ resourceId: string; periodStart: Date; capacityPct: number }>> {
    if (resourceIds.length === 0) return [];
    const rows = await this.prisma.capacityPeriod.findMany({
      where: {
        resourceId: { in: resourceIds },
        periodStart: { gte: rangeStart, lte: rangeEnd },
      },
      select: { resourceId: true, periodStart: true, capacityPct: true },
    });
    return rows.map((r) => ({
      resourceId: r.resourceId,
      periodStart: r.periodStart,
      capacityPct: Number(r.capacityPct),
    }));
  }

  async delete(id: string): Promise<void> {
    await this.prisma.capacityPeriod.delete({ where: { id } });
  }
}

// ---------------------------------------------------------------------------
// Row type & toDTO
// ---------------------------------------------------------------------------

type CapacityPeriodRow = {
  id: string;
  resourceId: string;
  periodStart: Date;
  capacityPct: Prisma.Decimal;
  createdAt: Date;
  updatedAt: Date;
};

function toDTO(row: CapacityPeriodRow): CapacityPeriodDTO {
  return {
    id: row.id,
    resourceId: row.resourceId,
    periodStart: row.periodStart.toISOString().slice(0, 10),
    capacityPct: Number(row.capacityPct),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
