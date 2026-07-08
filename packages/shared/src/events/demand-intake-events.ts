// @epm/shared — demand-intake domain event types and type constants.

export const DEMAND_INTAKE_EVENTS = {
  DEMAND_SUBMITTED: "demand-intake.demand.submitted",
  DEMAND_APPROVED:  "demand-intake.demand.approved",
  DEMAND_REJECTED:  "demand-intake.demand.rejected",
  DEMAND_PROMOTED:  "demand-intake.demand.promoted",
} as const;

export type DemandIntakeEventType =
  (typeof DEMAND_INTAKE_EVENTS)[keyof typeof DEMAND_INTAKE_EVENTS];

export interface DemandSubmittedPayload {
  demandId: string;
  title: string;
  submittedBy: string;
}

export interface DemandApprovedPayload {
  demandId: string;
}

export interface DemandRejectedPayload {
  demandId: string;
  reason: string;
}

/**
 * Exact project-execution `DemandPromotedPayload` contract — byte-identical to
 * `apps/api/src/modules/project-execution/events/project-execution-event.sub.ts`.
 */
export interface DemandPromotedPayload {
  demandId: string;
  name: string;
  portfolioId: string;
  programId?: string | null;
  plannedStart: string;
  plannedEnd: string;
  plannedBudget?: number | null;
}
