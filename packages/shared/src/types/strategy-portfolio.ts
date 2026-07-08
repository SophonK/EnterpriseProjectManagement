// @epm/shared — strategy-portfolio domain types, DTOs, and command schemas.
import { z } from "zod";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const GOAL_STATUS = ["Active", "Archived"] as const;
export type GoalStatus = (typeof GOAL_STATUS)[number];

export const PORTFOLIO_STATUS = ["Active", "Archived"] as const;
export type PortfolioStatus = (typeof PORTFOLIO_STATUS)[number];

export const PROGRAM_STATUS = ["Active", "Archived"] as const;
export type ProgramStatus = (typeof PROGRAM_STATUS)[number];

export const INVESTMENT_MIX_GROUP_BY = ["goal", "portfolio"] as const;
export type InvestmentMixGroupBy = (typeof INVESTMENT_MIX_GROUP_BY)[number];

// ---------------------------------------------------------------------------
// DTOs (returned from service / API responses)
// ---------------------------------------------------------------------------

export interface StrategicGoalDTO {
  id: string;
  title: string;
  description: string;
  measure: string;
  status: GoalStatus;
  createdBy: string;
  createdAt: string; // ISO 8601 UTC
  updatedAt: string;
}

export interface PortfolioDTO {
  id: string;
  name: string;
  description: string | null;
  ownerId: string;
  status: PortfolioStatus;
  goalIds: string[]; // associated strategic goals (via PortfolioGoal)
  createdAt: string;
  updatedAt: string;
}

export interface ProgramDTO {
  id: string;
  portfolioId: string;
  name: string;
  description: string | null;
  status: ProgramStatus;
  createdAt: string;
  updatedAt: string;
}

export interface GoalLinkDTO {
  id: string;
  goalId: string;
  projectId: string; // soft ref to execution.project
  linkedBy: string;
  createdAt: string;
}

export interface InvestmentSummaryDTO {
  groupingType: InvestmentMixGroupBy;
  groupId: string;
  groupName: string;
  projectCount: number;
  totalPlannedBudget: number; // SUM of plannedBudget in the group; 0 when all null
}

/** Canonical value-object alias (see canonical model `InvestmentSummary`). */
export type InvestmentSummary = InvestmentSummaryDTO;

export interface UnalignedProjectDTO {
  projectId: string;
  name: string;
  ownerId: string;
  portfolioId: string | null;
  portfolioName: string | null;
}

export interface UnalignedReportDTO {
  items: UnalignedProjectDTO[];
  fullyAligned: boolean; // true iff items is empty
}

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

/** `GET /strategy/investment-mix` response body. */
export type InvestmentMixResponse = InvestmentSummaryDTO[];

// ---------------------------------------------------------------------------
// Command schemas (Zod — used as ZodValidationPipe input in controllers)
// ---------------------------------------------------------------------------

export const DefineStrategicGoalSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(2000),
  measure: z.string().min(1).max(2000),
});

export type DefineStrategicGoalCommand = z.infer<typeof DefineStrategicGoalSchema>;

export const CreatePortfolioSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullish(),
});

export type CreatePortfolioCommand = z.infer<typeof CreatePortfolioSchema>;

export const AssociateGoalsSchema = z.object({
  goalIds: z.array(z.string().uuid()).min(1),
});

export type AssociateGoalsCommand = z.infer<typeof AssociateGoalsSchema>;

export const CreateProgramSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullish(),
});

export type CreateProgramCommand = z.infer<typeof CreateProgramSchema>;

export const LinkProjectToGoalsSchema = z.object({
  projectId: z.string().uuid(),
  goalIds: z.array(z.string().uuid()).min(1),
});

export type LinkProjectToGoalsCommand = z.infer<typeof LinkProjectToGoalsSchema>;

export const ViewInvestmentMixSchema = z.object({
  groupBy: z.enum(INVESTMENT_MIX_GROUP_BY),
});

export type ViewInvestmentMixQuery = z.infer<typeof ViewInvestmentMixSchema>;
