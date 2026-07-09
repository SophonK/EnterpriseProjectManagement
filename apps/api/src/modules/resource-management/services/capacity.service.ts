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
    const rangeStart = months[0]!;
    const rangeEnd = months[months.length - 1]!;

    const { data: resources } = await this.resourceRepo.findMany(
      { poolId: filter.poolId, skill: filter.skill },
      ctx,
    );
    const resourceIds = resources.map((r) => r.id);
    const poolIdByResource = new Map(resources.map((r) => [r.id, r.poolId]));
    const fteByResource = new Map(resources.map((r) => [r.id, r.fteCapacity]));

    // Group resources by pool
    const poolMap = new Map<string, { name: string; resourceIds: string[] }>();
    for (const r of resources) {
      if (!poolMap.has(r.poolId)) poolMap.set(r.poolId, { name: r.poolName, resourceIds: [] });
      poolMap.get(r.poolId)!.resourceIds.push(r.id);
    }

    // Two grouped queries over the whole range instead of the O(resources × months)
    // per-cell fan-out (which also re-scanned `resources.find` inside the innermost loop).
    const [allocations, overrides] = await Promise.all([
      this.allocationRepo.findOverlappingForResources(resourceIds, rangeStart, rangeEnd),
      this.capacityPeriodRepo.findForResourcesInRange(resourceIds, rangeStart, rangeEnd),
    ]);

    // (poolId|monthTime) → total demand%
    const demandByPoolMonth = new Map<string, number>();
    for (const a of allocations) {
      const poolId = poolIdByResource.get(a.resourceId);
      if (!poolId) continue;
      const aStart = firstOfMonth(a.periodStart);
      const aEnd = firstOfMonth(a.periodEnd);
      for (const month of monthsInRange(aStart, aEnd)) {
        if (month < rangeStart || month > rangeEnd) continue;
        const key = `${poolId}|${month.getTime()}`;
        demandByPoolMonth.set(key, (demandByPoolMonth.get(key) ?? 0) + a.allocationPct);
      }
    }

    // (resourceId|monthTime) → capacity override%
    const overrideByCell = new Map<string, number>();
    for (const o of overrides) {
      overrideByCell.set(`${o.resourceId}|${firstOfMonth(o.periodStart).getTime()}`, o.capacityPct);
    }

    const summary = months.flatMap((month) =>
      Array.from(poolMap.entries()).map(([poolId, pool]) => {
        let totalCapacity = 0;
        for (const rid of pool.resourceIds) {
          const override = overrideByCell.get(`${rid}|${month.getTime()}`);
          totalCapacity += override ?? fteByResource.get(rid) ?? 0;
        }
        const totalDemand = demandByPoolMonth.get(`${poolId}|${month.getTime()}`) ?? 0;
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
    );

    const fromStr = `${firstOfMonth(from).getUTCFullYear()}-${String(firstOfMonth(from).getUTCMonth() + 1).padStart(2, "0")}`;
    const toStr = `${firstOfMonth(to).getUTCFullYear()}-${String(firstOfMonth(to).getUTCMonth() + 1).padStart(2, "0")}`;

    return { from: fromStr, to: toStr, summary };
  }
}
