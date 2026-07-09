// @epm/shared — resource-management domain event types and constants.

export const RESOURCE_MANAGEMENT_EVENTS = {
  RESOURCE_ALLOCATED:    "resource-management.resource.allocated",
  RESOURCE_OVER_ALLOCATED: "resource-management.resource.over-allocated",
} as const;

export type ResourceManagementEventType =
  (typeof RESOURCE_MANAGEMENT_EVENTS)[keyof typeof RESOURCE_MANAGEMENT_EVENTS];

export interface ResourceAllocatedPayload {
  allocationId: string;
  resourceId: string;
  projectId: string;
  periodStart: string; // ISO date
  periodEnd: string;
  allocationPct: number;
}

export interface ResourceOverAllocatedPayload {
  resourceId: string;
  poolId: string;
  periods: Array<{ month: string; totalPct: number }>;
}
