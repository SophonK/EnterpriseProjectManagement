import { Injectable } from "@nestjs/common";
import { AppError } from "@epm/shared";
import type { GoalLinkDTO } from "@epm/shared";
import { BaseRepository } from "../../../foundation/db/base-repository.js";
import { PrismaService } from "../../../foundation/db/prisma.service.js";

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
   *
   * `upsert` is not atomic against the unique constraint: two concurrent inserts of the
   * same pair can both miss the existing row and race to `create`, so one loses with a
   * P2002 unique violation. That is still the idempotent outcome (the row exists), so we
   * catch P2002 and read the winning row back rather than surfacing a 500.
   */
  async upsertLink(goalId: string, projectId: string, linkedBy: string): Promise<GoalLinkDTO> {
    try {
      const row = await this.prisma.goalLink.upsert({
        where: { uq_goal_link: { goalId, projectId } },
        create: { goalId, projectId, linkedBy },
        update: {},
      });
      return toDTO(row);
    } catch (err) {
      if (!isPrismaUniqueViolation(err)) throw err;
      // Lost a concurrent create race — the pair already exists, so re-read and return it.
      const existing = await this.prisma.goalLink.findUnique({
        where: { uq_goal_link: { goalId, projectId } },
      });
      if (!existing) throw err; // shouldn't happen: P2002 implies the row is present
      return toDTO(existing);
    }
  }

  /**
   * Delete a link and return the `projectId` it belonged to, so the caller can recompute
   * that project's alignment (BR-103/BR-104). Throws STRATEGY_006 when the link is missing.
   */
  async delete(id: string): Promise<string> {
    try {
      const deleted = await this.prisma.goalLink.delete({
        where: { id },
        select: { projectId: true },
      });
      return deleted.projectId;
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
  return hasPrismaCode(err, "P2025");
}

function isPrismaUniqueViolation(err: unknown): boolean {
  return hasPrismaCode(err, "P2002");
}

function hasPrismaCode(err: unknown, code: string): boolean {
  return (
    err != null &&
    typeof err === "object" &&
    "code" in err &&
    (err as { code: string }).code === code
  );
}
