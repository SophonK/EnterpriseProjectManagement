import { Injectable } from "@nestjs/common";
import { AppError } from "@epm/shared";
import type { AuthContext, UtilizationDTO, UtilizationFilter } from "@epm/shared";
import { ResourceRepository } from "../repositories/resource.repository.js";
import { AllocationRepository } from "../repositories/allocation.repository.js";
import { CapacityPeriodRepository } from "../repositories/capacity-period.repository.js";
import { firstOfMonth, monthsInRange, utilizationBand } from "./allocation.service.js";

@Injectable()
export class UtilizationService {
  constructor(
    private readonly resourceRepo: ResourceRepository,
    private readonly allocationRepo: AllocationRepository,
    private readonly capacityPeriodRepo: CapacityPeriodRepository,
  ) {}

  async getUtilization(filter: UtilizationFilter, ctx: AuthContext): Promise<UtilizationDTO> {
    const from = new Date(filter.from);
    const to = new Date(filter.to);

    // Max 12-month validation
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
      { poolId: filter.poolId },
      ctx,
    );
    const resourceIds = resources.map((r) => r.id);

    // Two grouped queries over the whole range instead of O(resources × months × 2)
    // per-cell round-trips: all overlapping allocations + all capacity overrides.
    const [allocations, overrides] = await Promise.all([
      this.allocationRepo.findOverlappingForResources(resourceIds, rangeStart, rangeEnd),
      this.capacityPeriodRepo.findForResourcesInRange(resourceIds, rangeStart, rangeEnd),
    ]);

    // (resourceId|monthTime) → allocated%
    const allocatedByCell = new Map<string, number>();
    for (const a of allocations) {
      const aStart = firstOfMonth(a.periodStart);
      const aEnd = firstOfMonth(a.periodEnd);
      for (const month of monthsInRange(aStart, aEnd)) {
        if (month < rangeStart || month > rangeEnd) continue;
        const key = `${a.resourceId}|${month.getTime()}`;
        allocatedByCell.set(key, (allocatedByCell.get(key) ?? 0) + a.allocationPct);
      }
    }

    // (resourceId|monthTime) → capacity override%
    const overrideByCell = new Map<string, number>();
    for (const o of overrides) {
      overrideByCell.set(`${o.resourceId}|${firstOfMonth(o.periodStart).getTime()}`, o.capacityPct);
    }

    const rows = resources.map((resource) => {
      const periods = months.map((month) => {
        const cellKey = `${resource.id}|${month.getTime()}`;
        const allocated = allocatedByCell.get(cellKey) ?? 0;
        const override = overrideByCell.get(cellKey);
        const capacity = override ?? resource.fteCapacity;
        const utilPct = capacity > 0 ? (allocated / capacity) * 100 : 0;
        const monthStr = `${month.getUTCFullYear()}-${String(month.getUTCMonth() + 1).padStart(2, "0")}`;
        return {
          month: monthStr,
          allocatedPct: allocated,
          band: utilizationBand(utilPct),
        };
      });

      return {
        resourceId: resource.id,
        resourceName: resource.name,
        poolId: resource.poolId,
        periods,
      };
    });

    const fromStr = `${firstOfMonth(from).getUTCFullYear()}-${String(firstOfMonth(from).getUTCMonth() + 1).padStart(2, "0")}`;
    const toStr = `${firstOfMonth(to).getUTCFullYear()}-${String(firstOfMonth(to).getUTCMonth() + 1).padStart(2, "0")}`;

    return { from: fromStr, to: toStr, rows };
  }
}
