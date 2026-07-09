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

    const { data: resources } = await this.resourceRepo.findMany(
      { poolId: filter.poolId },
      ctx,
    );

    const rows = await Promise.all(
      resources.map(async (resource) => {
        const periods = await Promise.all(
          months.map(async (month) => {
            const allocated = await this.allocationRepo.sumOverlapping(resource.id, month);

            // Effective capacity: check capacity_period override, else fteCapacity
            const override = await this.capacityPeriodRepo.findByResourceAndMonth(
              resource.id,
              month,
            );
            const capacity = override ? override.capacityPct : resource.fteCapacity;

            const utilPct = capacity > 0 ? (allocated / capacity) * 100 : 0;
            const monthStr = `${month.getUTCFullYear()}-${String(month.getUTCMonth() + 1).padStart(2, "0")}`;

            return {
              month: monthStr,
              allocatedPct: allocated,
              band: utilizationBand(utilPct),
            };
          }),
        );

        return {
          resourceId: resource.id,
          resourceName: resource.name,
          poolId: resource.poolId,
          periods,
        };
      }),
    );

    const fromStr = `${firstOfMonth(from).getUTCFullYear()}-${String(firstOfMonth(from).getUTCMonth() + 1).padStart(2, "0")}`;
    const toStr = `${firstOfMonth(to).getUTCFullYear()}-${String(firstOfMonth(to).getUTCMonth() + 1).padStart(2, "0")}`;

    return { from: fromStr, to: toStr, rows };
  }
}
