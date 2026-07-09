// @epm/shared — reporting-dashboards domain types and DTOs.
import type { RollupSummaryDTO } from "./project-execution.js";
import type { RaidItemDTO } from "./risk-raid.js";
import type { ProjectDTO } from "./project-execution.js";

export interface AlignmentCoverageDTO {
  alignedCount: number;
  activeCount: number;
  coveragePct: number;
}

export interface PortfolioHealthDashboardDTO {
  portfolioId: string;
  rollup: RollupSummaryDTO;
  alignment: AlignmentCoverageDTO;
  topEscalatedRisks: RaidItemDTO[];
  atRiskProjects: ProjectDTO[];
}

export interface PortfolioHealthFilter {
  portfolioId: string;
}

export interface ExportFilter {
  reportType: "portfolio-health" | "capacity" | "risk-summary";
  portfolioId?: string;
  from?: string;
  to?: string;
  projectId?: string;
}

export const EXPORT_ROW_LIMIT = 1000;
