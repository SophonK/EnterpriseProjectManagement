// @epm/shared — project-execution domain types, DTOs, and command schemas.
import { z } from "zod";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const PROJECT_STATUS = ["Open", "Active", "Completed", "Cancelled"] as const;
export type ProjectStatus = (typeof PROJECT_STATUS)[number];

export const PROJECT_HEALTH = ["OnTrack", "AtRisk", "OffTrack"] as const;
export type ProjectHealth = (typeof PROJECT_HEALTH)[number];

// ---------------------------------------------------------------------------
// DTOs (returned from service / API responses)
// ---------------------------------------------------------------------------

export interface ProjectDTO {
  id: string;
  name: string;
  description: string | null;
  ownerUserId: string;
  portfolioId: string;
  programId: string | null;
  status: ProjectStatus;
  health: ProjectHealth;
  plannedStart: string; // ISO date "YYYY-MM-DD"
  plannedEnd: string;
  plannedBudget: number | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MilestoneDTO {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  dueDate: string; // ISO date
  completedAt: string | null;
  overdue: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface StatusUpdateDTO {
  id: string;
  projectId: string;
  status: ProjectStatus;
  health: ProjectHealth;
  note: string | null;
  recordedBy: string;
  recordedAt: string;
}

export interface RollupSummaryDTO {
  portfolioId: string;
  programId: string | null;
  onTrackCount: number;
  atRiskCount: number;
  offTrackCount: number;
  totalCount: number;
  computedAt: string;
}

export interface ProjectListDTO {
  data: ProjectDTO[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ProjectFilter {
  portfolioId?: string;
  programId?: string;
  health?: ProjectHealth;
  status?: ProjectStatus;
  page?: number;
  pageSize?: number;
}

// ---------------------------------------------------------------------------
// Command schemas (Zod — used as ZodValidationPipe input in controllers)
// ---------------------------------------------------------------------------

const isoDateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected ISO date string YYYY-MM-DD");

export const CreateProjectSchema = z
  .object({
    name: z.string().min(1).max(200),
    description: z.string().max(2000).nullish(),
    portfolioId: z.string().uuid(),
    programId: z.string().uuid().nullish(),
    plannedStart: isoDateString,
    plannedEnd: isoDateString,
    plannedBudget: z.number().positive().nullish(),
  })
  .refine((d) => d.plannedEnd >= d.plannedStart, {
    message: "plannedEnd must be on or after plannedStart",
    path: ["plannedEnd"],
  });

export type CreateProjectCommand = z.infer<typeof CreateProjectSchema>;

export const UpdateProjectSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).nullish(),
    programId: z.string().uuid().nullish(),
    plannedStart: isoDateString.optional(),
    plannedEnd: isoDateString.optional(),
    plannedBudget: z.number().positive().nullish(),
  })
  .refine(
    (d) => {
      if (d.plannedStart !== undefined && d.plannedEnd !== undefined) {
        return d.plannedEnd >= d.plannedStart;
      }
      return true;
    },
    {
      message: "plannedEnd must be on or after plannedStart",
      path: ["plannedEnd"],
    },
  );

export type UpdateProjectCommand = z.infer<typeof UpdateProjectSchema>;

export const AddMilestoneSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(2000).nullish(),
  dueDate: isoDateString,
  sortOrder: z.number().int().min(0).default(0),
});

export type AddMilestoneCommand = z.infer<typeof AddMilestoneSchema>;

export const UpdateMilestoneSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  description: z.string().max(2000).nullish(),
  dueDate: isoDateString.optional(),
  completedAt: z.string().datetime().nullish(),
  sortOrder: z.number().int().min(0).optional(),
});

export type UpdateMilestoneCommand = z.infer<typeof UpdateMilestoneSchema>;

export const UpdateStatusHealthSchema = z.object({
  status: z.enum(PROJECT_STATUS),
  health: z.enum(PROJECT_HEALTH),
  note: z.string().max(1000).nullish(),
});

export type UpdateStatusHealthCommand = z.infer<typeof UpdateStatusHealthSchema>;
