// @epm/shared — resource-management domain types, DTOs, and command schemas.
import { z } from "zod";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const SKILL_LEVEL = ["Beginner", "Intermediate", "Expert"] as const;
export type SkillLevel = (typeof SKILL_LEVEL)[number];

export const UTILIZATION_BAND = ["Under", "Optimal", "Over"] as const;
export type UtilizationBand = (typeof UTILIZATION_BAND)[number];

// ---------------------------------------------------------------------------
// DTOs (returned from service / API responses)
// ---------------------------------------------------------------------------

export interface ResourcePoolDTO {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface SkillDTO {
  id: string;
  resourceId: string;
  name: string;
  level: SkillLevel;
  createdAt: string;
}

export interface CapacityPeriodDTO {
  id: string;
  resourceId: string;
  periodStart: string; // ISO date YYYY-MM-DD (always first of month)
  capacityPct: number;
  createdAt: string;
  updatedAt: string;
}

export interface ResourceDTO {
  id: string;
  name: string;
  email: string;
  poolId: string;
  poolName: string;
  fteCapacity: number;
  overAllocated: boolean;
  skills: SkillDTO[];
  capacityPeriods: CapacityPeriodDTO[];
  createdAt: string;
  updatedAt: string;
}

export interface AllocationDTO {
  id: string;
  resourceId: string;
  projectId: string;
  periodStart: string; // ISO date YYYY-MM-DD (always first of month)
  periodEnd: string;
  allocationPct: number;
  overAllocatedConfirmed: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface UtilizationPeriodDTO {
  month: string; // "YYYY-MM"
  allocatedPct: number;
  band: UtilizationBand;
}

export interface UtilizationRowDTO {
  resourceId: string;
  resourceName: string;
  poolId: string;
  periods: UtilizationPeriodDTO[];
}

export interface UtilizationDTO {
  from: string; // "YYYY-MM"
  to: string;
  rows: UtilizationRowDTO[];
}

export interface CapacityDemandMonthDTO {
  month: string; // "YYYY-MM"
  poolId: string;
  poolName: string;
  totalCapacityPct: number;
  totalAllocatedPct: number;
  gapPct: number;
  shortfall: boolean;
}

export interface CapacityDemandDTO {
  from: string;
  to: string;
  summary: CapacityDemandMonthDTO[];
}

export interface ResourceListDTO {
  data: ResourceDTO[];
  total: number;
  page: number;
  pageSize: number;
}

export interface OverAllocationWarning {
  periods: Array<{ month: string; totalPct: number }>;
  requiresConfirmation: boolean;
}

export interface AllocateResultDTO {
  allocation: AllocationDTO;
  overAllocationWarning?: OverAllocationWarning;
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

export interface ResourceFilter {
  poolId?: string;
  skill?: string;
  page?: number;
  pageSize?: number;
}

export interface UtilizationFilter {
  poolId?: string;
  from: string; // YYYY-MM-DD
  to: string;
}

export interface CapacityDemandFilter {
  poolId?: string;
  skill?: string;
  from: string;
  to: string;
}

// ---------------------------------------------------------------------------
// Command schemas (Zod) — used as validation pipe input
// ---------------------------------------------------------------------------

const SkillInputSchema = z.object({
  name: z.string().min(1).max(100),
  level: z.enum(SKILL_LEVEL),
});

export const CreateResourceSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().max(320),
  poolId: z.string().uuid(),
  fteCapacity: z.number().positive().max(100),
  skills: z.array(SkillInputSchema).optional(),
});
export type CreateResourceCommand = z.infer<typeof CreateResourceSchema>;

export const UpdateResourceSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  email: z.string().email().max(320).optional(),
  poolId: z.string().uuid().optional(),
  fteCapacity: z.number().positive().max(100).optional(),
  skills: z.array(SkillInputSchema).optional(),
});
export type UpdateResourceCommand = z.infer<typeof UpdateResourceSchema>;

export const AllocateResourceSchema = z
  .object({
    projectId: z.string().min(1),
    periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    allocationPct: z.number().positive().max(200),
    confirmOverAllocation: z.boolean().default(false),
  })
  .refine((v) => new Date(v.periodEnd) >= new Date(v.periodStart), {
    message: "periodEnd must be on or after periodStart",
    path: ["periodEnd"],
  });
export type AllocateResourceCommand = z.infer<typeof AllocateResourceSchema>;

export const UpdateAllocationSchema = z
  .object({
    periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    allocationPct: z.number().positive().max(200).optional(),
    confirmOverAllocation: z.boolean().optional(),
  })
  .refine(
    (v) => {
      if (v.periodStart && v.periodEnd)
        return new Date(v.periodEnd) >= new Date(v.periodStart);
      return true;
    },
    { message: "periodEnd must be on or after periodStart", path: ["periodEnd"] },
  );
export type UpdateAllocationCommand = z.infer<typeof UpdateAllocationSchema>;

/**
 * Count of whole calendar months spanned by [from, to] inclusive of both endpoints'
 * months. MUST match the service-side range check (calendar-month arithmetic) so the
 * Zod gate and the service never diverge — a 30-day approximation would reject/accept
 * ranges the service treats differently (finding: 30-day-month vs calendar-month).
 */
export function calendarMonthSpan(from: Date, to: Date): number {
  return (
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 +
    (to.getUTCMonth() - from.getUTCMonth())
  );
}

export const UtilizationQuerySchema = z
  .object({
    poolId: z.string().uuid().optional(),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .refine(
    (v) => {
      const fromDate = new Date(v.from);
      const toDate = new Date(v.to);
      if (toDate < fromDate) return false;
      return calendarMonthSpan(fromDate, toDate) <= 12;
    },
    { message: "Range must be between 1 and 12 months", path: ["to"] },
  );
export type UtilizationQuery = z.infer<typeof UtilizationQuerySchema>;

export const CapacityDemandQuerySchema = UtilizationQuerySchema.and(
  z.object({ skill: z.string().min(1).optional() }),
);
export type CapacityDemandQuery = z.infer<typeof CapacityDemandQuerySchema>;

// ---------------------------------------------------------------------------
// Resource pool + capacity-period command schemas
// ---------------------------------------------------------------------------

export const CreateResourcePoolSchema = z.object({
  name: z.string().min(1).max(200),
});
export type CreateResourcePoolCommand = z.infer<typeof CreateResourcePoolSchema>;

export const SetCapacityPeriodSchema = z.object({
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  capacityPct: z.number().positive().max(100),
});
export type SetCapacityPeriodCommand = z.infer<typeof SetCapacityPeriodSchema>;
