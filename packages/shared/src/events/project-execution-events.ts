// @epm/shared — project-execution domain event types and type constants.
import type { ProjectHealth, ProjectStatus } from "../types/project-execution.js";

export const PROJECT_EXECUTION_EVENTS = {
  PROJECT_CREATED:   "project-execution.project.created",
  PROJECT_ARCHIVED:  "project-execution.project.archived",
  STATUS_CHANGED:    "project-execution.project.status-changed",
  MILESTONE_OVERDUE: "project-execution.milestone.overdue",
  ROLLUP_RECOMPUTED: "project-execution.rollup.recomputed",
} as const;

export type ProjectExecutionEventType =
  (typeof PROJECT_EXECUTION_EVENTS)[keyof typeof PROJECT_EXECUTION_EVENTS];

export interface ProjectCreatedPayload {
  projectId: string;
  portfolioId: string;
  programId: string | null;
  name: string;
  ownerUserId: string;
  plannedBudget: number | null;
}

export interface ProjectArchivedPayload {
  projectId: string;
  portfolioId: string;
  programId: string | null;
}

export interface StatusChangedPayload {
  projectId: string;
  portfolioId: string;
  programId: string | null;
  status: ProjectStatus;
  health: ProjectHealth;
  previousStatus: ProjectStatus;
  previousHealth: ProjectHealth;
}

export interface MilestoneOverduePayload {
  milestoneId: string;
  projectId: string;
  dueDate: string; // ISO date
}

export interface RollupRecomputedPayload {
  portfolioId: string;
  programId: string | null;
  onTrackCount: number;
  atRiskCount: number;
  offTrackCount: number;
  totalCount: number;
}
