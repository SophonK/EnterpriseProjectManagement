// @epm/shared — demand-intake domain types, DTOs, and command schemas.
import { z } from "zod";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const DEMAND_STATUS = [
  "Submitted",
  "Screening",
  "Evaluation",
  "Approved",
  "Promoted",
  "Rejected",
] as const;
export type DemandStatus = (typeof DEMAND_STATUS)[number];

export const INTAKE_GATE = ["Submitted", "Screening", "Evaluation", "Approved"] as const;
export type IntakeGate = (typeof INTAKE_GATE)[number];

export const GATE_OUTCOME = ["Advanced", "Rejected"] as const;
export type GateOutcome = (typeof GATE_OUTCOME)[number];

// ---------------------------------------------------------------------------
// DTOs (returned from service / API responses)
// ---------------------------------------------------------------------------

export interface DemandRequestDTO {
  id: string;
  title: string;
  sponsor: string;
  description: string;
  expectedValue: number | null;
  status: DemandStatus;
  currentGate: IntakeGate;
  rejectionReason: string | null;
  submittedBy: string;
  submittedAt: string; // ISO 8601 UTC
  promotedProjectId: string | null; // soft ref to execution.project (best-effort)
  createdAt: string;
  updatedAt: string;
}

export interface ScoringCriterionDTO {
  id: string;
  scoringModelId: string;
  name: string;
  weight: number;
  maxScore: number;
  goalId: string | null; // soft ref to strategy.strategic_goal (traceability only)
  sortOrder: number;
}

export interface ScoringModelDTO {
  id: string;
  name: string;
  version: number;
  isActive: boolean;
  createdBy: string;
  criteria: ScoringCriterionDTO[];
  createdAt: string;
  updatedAt: string;
}

export interface CriterionScoreDTO {
  criterionId: string;
  rawScore: number;
}

export interface ScoreCardDTO {
  id: string;
  demandRequestId: string;
  scoringModelId: string; // soft ref to the scored model version
  weightedTotal: number; // 0..100
  scores: CriterionScoreDTO[];
  scoredBy: string;
  scoredAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface GateDecisionDTO {
  id: string;
  demandRequestId: string;
  fromGate: IntakeGate;
  toGate: IntakeGate | null; // null on reject
  decision: GateOutcome;
  reason: string | null;
  decidedBy: string;
  decidedAt: string;
}

export interface RankedDemandDTO {
  demandRequestId: string;
  title: string;
  status: DemandStatus;
  weightedTotal: number;
  rank: number; // 1-based; descending weightedTotal, stable tie-break by submittedAt asc
  submittedAt: string;
}

// ---------------------------------------------------------------------------
// Command schemas (Zod — used as ZodValidationPipe input in controllers)
// ---------------------------------------------------------------------------

const isoDateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected ISO date string YYYY-MM-DD");

export const SubmitIntakeSchema = z.object({
  title: z.string().min(1).max(200),
  sponsor: z.string().min(1).max(200),
  description: z.string().min(1).max(2000),
  expectedValue: z.number().min(0).nullish(),
});

export type SubmitIntakeCommand = z.infer<typeof SubmitIntakeSchema>;

export const ConfigureScoringSchema = z.object({
  name: z.string().min(1).max(200),
  criteria: z
    .array(
      z.object({
        name: z.string().min(1).max(200),
        weight: z.number().positive(),
        maxScore: z.number().int().min(1).max(1000).default(100),
        goalId: z.string().uuid().nullish(),
      }),
    )
    .min(1),
});

export type ConfigureScoringCommand = z.infer<typeof ConfigureScoringSchema>;

export const ScoreRequestSchema = z.object({
  scores: z
    .array(
      z.object({
        criterionId: z.string().uuid(),
        rawScore: z.number().int().min(0),
      }),
    )
    .min(1),
});

export type ScoreRequestCommand = z.infer<typeof ScoreRequestSchema>;

export const AdvanceGateSchema = z.object({});

export type AdvanceGateCommand = z.infer<typeof AdvanceGateSchema>;

export const RejectGateSchema = z.object({
  reason: z.string().min(1).max(2000),
});

export type RejectGateCommand = z.infer<typeof RejectGateSchema>;

export const PromoteToProjectSchema = z
  .object({
    portfolioId: z.string().uuid(),
    programId: z.string().uuid().nullish(),
    plannedStart: isoDateString,
    plannedEnd: isoDateString,
    plannedBudget: z.number().min(0).nullish(),
  })
  .refine((d) => d.plannedEnd >= d.plannedStart, {
    message: "plannedEnd must be on or after plannedStart",
    path: ["plannedEnd"],
  });

export type PromoteToProjectCommand = z.infer<typeof PromoteToProjectSchema>;
