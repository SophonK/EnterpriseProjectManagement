// @epm/shared — strategy-portfolio domain event types and type constants.

export const STRATEGY_PORTFOLIO_EVENTS = {
  PORTFOLIO_CREATED:       "strategy-portfolio.portfolio.created",
  PROGRAM_CREATED:         "strategy-portfolio.program.created",
  PROJECT_LINKED_TO_GOAL:  "strategy-portfolio.project.linked-to-goal",
  PROJECT_FLAGGED_UNALIGNED: "strategy-portfolio.project.flagged-unaligned",
} as const;

export type StrategyPortfolioEventType =
  (typeof STRATEGY_PORTFOLIO_EVENTS)[keyof typeof STRATEGY_PORTFOLIO_EVENTS];

export interface PortfolioCreatedPayload {
  portfolioId: string;
  name: string;
  ownerId: string;
}

export interface ProgramCreatedPayload {
  programId: string;
  portfolioId: string;
  name: string;
}

export interface ProjectLinkedToGoalPayload {
  projectId: string;
  goalIds: string[];
  linkedBy: string;
}

export interface ProjectFlaggedUnalignedPayload {
  projectId: string;
  name: string;
  portfolioId: string | null;
}
