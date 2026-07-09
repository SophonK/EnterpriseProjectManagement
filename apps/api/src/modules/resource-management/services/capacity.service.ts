import { Injectable } from "@nestjs/common";
import { AppError } from "@epm/shared";
import type { AuthContext, CapacityDemandDTO, CapacityDemandFilter } from "@epm/shared";
import { ResourceRepository } from "../repositories/resource.repository.js";
import { AllocationRepository } from "../repositories/allocation.repository.js";
import { CapacityPeriodRepository } from "../repositories/capacity-period.repository.js";
import { firstOfMonth, monthsInRange } from "./allocation.service.js";

@Injectable()
export class CapacityService {
  constructor(
    private readonly resourceRepo: ResourceRepository,
    private readonly allocationRepo: AllocationRepository,
    private readonly capacityPeriodRepo: CapacityPeriodRepository,
  ) {}

  async getCapacityDemand(
    filter: CapacityDemandFilter,
    ctx: AuthContext,
  ): Promise<CapacityDemandDTO> {
    const from = new Date(filter.from);
    const to = new Date(filter.to);

    const diffMonths =
      (to.getUTCFullYear() - from.getUTCFullYear()) * 12 +
      (to.getUTCMonth() - from.getUTCMonth());
    if (diffMonths > 12 || to < from) {
      throw new AppError("RESOURCE_001", "Date range must be between 1 and 12 months");
    }

    const months = monthsInRange(firstOfMonth(from), firstOfMonth(to));

    const { data: resources } = await this.resourceRepo.findMany(
      { poolId: filter.poolId, skill: filter.skill },
      ctx,
    );

    // Group resources by pool
    const poolMap = new Map<string, { name: string; resourceIds: string[] }>();
    for (const r of resources) {
      if (!poolMap.has(r.poolId)) poolMap.set(r.poolId, { name: r.poolName, resourceIds: [] });
      poolMap.get(r.poolId)!.resourceIds.push(r.id);
    }

    const summary = await Promise.all(
      months.flatMap((month) =>
        Array.from(poolMap.entries()).map(async ([poolId, pool]) => {
          let totalCapacity = 0;
          let totalDemand = 0;

          for (const rid of pool.resourceIds) {
            const override = await this.capacityPeriodRepo.findByResourceAndMonth(rid, month);
            const resource = resources.find((r) => r.id === rid)!;
            totalCapacity += override ? override.capacityPct : resource.fteCapacity;
            totalDemand += await this.allocationRepo.sumOverlapping(rid, month);
          }

          const gapPct = totalCapacity - totalDemand;
          const monthStr = `${month.getUTCFullYear()}-${String(month.getUTCMonth() + 1).padStart(2, "0")}`;

          return {
            month: monthStr,
            poolId,
            poolName: pool.name,
            totalCapacityPct: totalCapacity,
            totalAllocatedPct: totalDemand,
            gapPct,
            shortfall: gapPct < 0,
          };
        }),
      ),
    );

    const fromStr = `${firstOfMonth(from).getUTCFullYear()}-${String(firstOfMonth(from).getUTCMonth() + 1).padStart(2, "0")}`;
    const toStr = `${firstOfMonth(to).getUTCFullYear()}-${String(firstOfMonth(to).getUTCMonth() + 1).padStart(2, "0")}`;

    return { from: fromStr, to: toStr, summary };
  }
}
