import { Injectable } from "@nestjs/common";
import { AppError } from "@epm/shared";
import type { GoalLinkDTO } from "@epm/shared";
import { BaseRepository } from "../../../foundation/db/base-repository.js";
import type { PrismaService } from "../../../foundation/db/prisma.service.js";

@Injectable()
export class GoalLinkRepository extends BaseRepository {
  readonly schema = "strategy" as const;

  constructor(prisma: PrismaService) {
    super(prisma);
  }

  /**
   * Idempotent link upsert (set semantics via `@@unique([goalId, projectId])`).
   * A repeated link of the same pair is a no-op update returning the existing row —
   * no duplicate row, no error (P3).
   */
  async upsertLink(goalId: string, projectId: string, linkedBy: string): Promise<GoalLinkDTO> {
    const row = await this.prisma.goalLink.upsert({
      where: { uq_goal_link: { goalId, projectId } },
      create: { goalId, projectId, linkedBy },
      update: {},
    });
    return toDTO(row);
  }

  async delete(id: string): Promise<void> {
    try {
      await this.prisma.goalLink.delete({ where: { id } });
    } catch (err) {
      if (isPrismaNotFound(err)) throw new AppError("STRATEGY_006", `Goal link ${id} not found`);
      throw err;
    }
  }

  /** Number of goals linked to a project — drives alignment (`aligned` iff `>= 1`). */
  async countByProject(projectId: string): Promise<number> {
    return this.prisma.goalLink.count({ where: { projectId } });
  }

  async findByProject(projectId: string): Promise<GoalLinkDTO[]> {
    const rows = await this.prisma.goalLink.findMany({
      where: { projectId },
      orderBy: { createdAt: "asc" },
    });
    return rows.map(toDTO);
  }

  async findGoalIdsByProject(projectId: string): Promise<string[]> {
    const rows = await this.prisma.goalLink.findMany({
      where: { projectId },
      select: { goalId: true },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((r) => r.goalId);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type GoalLinkRow = {
  id: string;
  goalId: string;
  projectId: string;
  linkedBy: string;
  createdAt: Date;
};

function toDTO(row: GoalLinkRow): GoalLinkDTO {
  return {
    id: row.id,
    goalId: row.goalId,
    projectId: row.projectId,
    linkedBy: row.linkedBy,
    createdAt: row.createdAt.toISOString(),
  };
}

function isPrismaNotFound(err: unknown): boolean {
  return (
    err != null &&
    typeof err === "object" &&
    "code" in err &&
    (err as { code: string }).code === "P2025"
  );
}
