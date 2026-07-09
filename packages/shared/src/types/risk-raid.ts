// @epm/shared — risk-raid domain types, DTOs, and command schemas.
import { z } from "zod";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const RAID_TYPE = ["Risk", "Assumption", "Issue", "Dependency"] as const;
export type RaidType = (typeof RAID_TYPE)[number];

export const RAID_STATUS = ["Open", "InProgress", "Resolved", "Closed", "Accepted", "Rejected"] as const;
export type RaidStatus = (typeof RAID_STATUS)[number];

export const DEPENDENCY_TYPE = ["DependsOn", "Blocks", "FinishToStart"] as const;
export type DependencyType = (typeof DEPENDENCY_TYPE)[number];

export const RISK_BAND = ["Low", "Medium", "High", "Critical"] as const;
export type RiskBand = (typeof RISK_BAND)[number];

// ---------------------------------------------------------------------------
// Pure functions (tested via PBT)
// ---------------------------------------------------------------------------

/** Compute risk score for Risk-type items. Returns null for non-Risk types. */
export function computeRiskScore(severity: number | null | undefined, probability: number | null | undefined): number | null {
  if (severity == null || probability == null) return null;
  return severity * probability;
}

/** Map a risk score to a display band. */
export function riskBand(score: number): RiskBand {
  if (score <= 4) return "Low";
  if (score <= 9) return "Medium";
  if (score <= 14) return "High";
  return "Critical";
}

/** Validate that a status transition is allowed. */
export function isValidStatusTransition(from: RaidStatus, to: RaidStatus): boolean {
  const TERMINAL: RaidStatus[] = ["Resolved", "Closed", "Accepted", "Rejected"];
  if (TERMINAL.includes(from)) return false;
  if (from === to) return true;
  if (from === "Open" && to === "InProgress") return true;
  if (from === "InProgress" && TERMINAL.includes(to)) return true;
  if (from === "Open" && TERMINAL.includes(to)) return true; // direct close allowed (e.g. system close)
  return false;
}

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------

export interface RaidItemDTO {
  id: string;
  projectId: string;
  type: RaidType;
  title: string;
  description: string | null;
  severity: number | null;
  probability: number | null;
  riskScore: number | null;
  status: RaidStatus;
  escalated: boolean;
  ownerUserId: string | null;
  mitigation: string | null;
  closedBy: string | null;
  closedAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface DependencyDTO {
  id: string;
  fromProjectId: string;
  toProjectId: string;
  description: string;
  dependencyType: DependencyType;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface RaidListDTO {
  data: RaidItemDTO[];
  total: number;
  page: number;
  pageSize: number;
}

export interface DependencyListDTO {
  data: DependencyDTO[];
  total: number;
  page: number;
  pageSize: number;
}

export interface RaidSummaryDTO {
  totalOpen: number;
  totalEscalated: number;
  byCriticality: Record<RiskBand, number>;
  topEscalated: RaidItemDTO[];
}

// ---------------------------------------------------------------------------
// Command types
// ---------------------------------------------------------------------------

export interface CreateRaidItemCommand {
  projectId: string;
  type: RaidType;
  title: string;
  description?: string;
  severity?: number;
  probability?: number;
  ownerId?: string;
  mitigation?: string;
}

export interface UpdateRaidItemCommand {
  title?: string;
  description?: string;
  severity?: number;
  probability?: number;
  status?: RaidStatus;
  ownerId?: string;
  mitigation?: string;
}

export interface CreateDependencyCommand {
  fromProjectId: string;
  toProjectId: string;
  description: string;
  dependencyType?: DependencyType;
}

export interface RaidFilter {
  projectId?: string;
  type?: RaidType;
  status?: RaidStatus;
  escalated?: boolean;
  page?: number;
  pageSize?: number;
}

export interface DependencyFilter {
  projectId?: string;
  page?: number;
  pageSize?: number;
}

// ---------------------------------------------------------------------------
// Zod schemas (used as validation pipe input)
// ---------------------------------------------------------------------------

export const CreateRaidItemSchema = z
  .object({
    projectId: z.string().min(1),
    type: z.enum(RAID_TYPE),
    title: z.string().min(1).max(300),
    description: z.string().max(2000).optional(),
    severity: z.number().int().min(1).max(5).optional(),
    probability: z.number().int().min(1).max(5).optional(),
    ownerId: z.string().optional(),
    mitigation: z.string().max(2000).optional(),
  })
  .refine(
    (d) => d.type !== "Risk" || (d.severity != null && d.probability != null),
    { message: "severity and probability are required for Risk type" },
  );

export const UpdateRaidItemSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  description: z.string().max(2000).optional(),
  severity: z.number().int().min(1).max(5).optional(),
  probability: z.number().int().min(1).max(5).optional(),
  status: z.enum(RAID_STATUS).optional(),
  ownerId: z.string().optional(),
  mitigation: z.string().max(2000).optional(),
});

export const CreateDependencySchema = z
  .object({
    fromProjectId: z.string().min(1),
    toProjectId: z.string().min(1),
    description: z.string().min(1).max(500),
    dependencyType: z.enum(DEPENDENCY_TYPE).optional(),
  })
  .refine((d) => d.fromProjectId !== d.toProjectId, {
    message: "fromProjectId and toProjectId must be different",
  });
