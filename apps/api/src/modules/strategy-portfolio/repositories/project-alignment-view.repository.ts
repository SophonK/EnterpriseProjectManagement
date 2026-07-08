import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { BaseRepository } from "../../../foundation/db/base-repository.js";
import type { PrismaService } from "../../../foundation/db/prisma.service.js";

/** A plain projection of a `ProjectAlignmentView` row (Decimal→number, dates→ISO). */
export interface AlignmentViewRecord {
  projectId: string;
  name: string;
  status: string;
  plannedBudget: number | null;
  portfolioId: string | null;
  programId: string | null;
  aligned: boolean;
  lastEventAt: string;
  updatedAt: string;
}

/** An unaligned active project enriched with its owning portfolio (US-010). */
export interface UnalignedRow {
  projectId: string;
  name: string;
  portfolioId: string | null;
  portfolioName: string | null;
  ownerId: string | null;
}

/** One investment-mix grouping bucket (US-009): count + summed planned budget. */
export interface MixGroup {
  groupId: string;
  projectCount: number;
  totalPlannedBudget: number;
}

@Injectable()
export class ProjectAlignmentViewRepository extends BaseRepository {
  readonly schema = "strategy" as const;

  constructor(prisma: PrismaService) {
    super(prisma);
  }

  /**
   * Upsert the projection by `projectId`, guarded by `lastEventAt` for out-of-order /
   * duplicate tolerance (REL-SP-02): the write is applied only when the incoming event
   * timestamp is `>=` the stored `lastEventAt`; a strictly older (stale/reordered) event
   * is a no-op. The `aligned` flag is owned by `setAligned` and never touched here.
   * Returns `true` when the projection was written, `false` when the event was stale.
   */
  async upsertByProjectId(
    data: {
      projectId: string;
      name: string;
      status: string;
      plannedBudget?: number | null;
      portfolioId?: string | null;
      programId?: string | null;
    },
    lastEventAt: Date,
  ): Promise<boolean> {
    const plannedBudget =
      data.plannedBudget != null ? new Prisma.Decimal(data.plannedBudget) : null;

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.projectAlignmentView.findUnique({
        where: { projectId: data.projectId },
        select: { lastEventAt: true },
      });
      // Apply only if incoming ts >= stored ts; a strictly older event is stale.
      if (existing && lastEventAt < existing.lastEventAt) return false;

      await tx.projectAlignmentView.upsert({
        where: { projectId: data.projectId },
        create: {
          projectId: data.projectId,
          name: data.name,
          status: data.status,
          plannedBudget,
          portfolioId: data.portfolioId ?? null,
          programId: data.programId ?? null,
          lastEventAt,
          updatedAt: new Date(),
        },
        update: {
          name: data.name,
          status: data.status,
          plannedBudget,
          portfolioId: data.portfolioId ?? null,
          programId: data.programId ?? null,
          lastEventAt,
        },
      });
      return true;
    });
  }

  /** Materialize the derived `aligned` flag (computed by the projector on write). */
  async setAligned(projectId: string, aligned: boolean): Promise<void> {
    await this.prisma.projectAlignmentView.updateMany({
      where: { projectId },
      data: { aligned },
    });
  }

  async findByProject(projectId: string): Promise<AlignmentViewRecord | null> {
    const row = await this.prisma.projectAlignmentView.findUnique({ where: { projectId } });
    return row ? toRecord(row) : null;
  }

  /**
   * Active + unaligned projects (US-010), each enriched with its owning portfolio's
   * name and ownerId via a manual join (no cross-schema FK; `portfolioId` is a soft ref).
   */
  async listUnaligned(): Promise<UnalignedRow[]> {
    const views = await this.prisma.projectAlignmentView.findMany({
      where: { status: "Active", aligned: false },
      orderBy: { updatedAt: "desc" },
    });

    const portfolioIds = [
      ...new Set(views.map((v) => v.portfolioId).filter((id): id is string => id !== null)),
    ];
    const portfolios = portfolioIds.length
      ? await this.prisma.portfolio.findMany({
          where: { id: { in: portfolioIds } },
          select: { id: true, name: true, ownerId: true },
        })
      : [];
    const byId = new Map(portfolios.map((p) => [p.id, p]));

    return views.map((v) => {
      const portfolio = v.portfolioId != null ? byId.get(v.portfolioId) : undefined;
      return {
        projectId: v.projectId,
        name: v.name,
        portfolioId: v.portfolioId,
        portfolioName: portfolio?.name ?? null,
        ownerId: portfolio?.ownerId ?? null,
      };
    });
  }

  /**
   * Investment mix grouped by portfolio (US-009): per-portfolio project count and
   * `SUM(plannedBudget)` (null budgets treated as 0). Rows with no portfolio are excluded.
   */
  async aggregateByPortfolio(): Promise<MixGroup[]> {
    const groups = await this.prisma.projectAlignmentView.groupBy({
      by: ["portfolioId"],
      where: { portfolioId: { not: null } },
      _count: { projectId: true },
      _sum: { plannedBudget: true },
    });
    return groups.map((g) => ({
      groupId: g.portfolioId as string,
      projectCount: g._count.projectId,
      totalPlannedBudget: g._sum.plannedBudget != null ? Number(g._sum.plannedBudget) : 0,
    }));
  }

  /**
   * Investment mix grouped by goal (US-009). Joins `GoalLink` to the projection by the
   * soft `projectId` (no cross-schema FK, so aggregated in-process). A project linked to
   * N goals contributes to N goal-groups by design (per-link expansion, P1). Null budgets
   * are treated as 0; links whose project is not in the projection are skipped.
   */
  async aggregateByGoal(): Promise<MixGroup[]> {
    const links = await this.prisma.goalLink.findMany({
      select: { goalId: true, projectId: true },
    });
    if (links.length === 0) return [];

    const projectIds = [...new Set(links.map((l) => l.projectId))];
    const views = await this.prisma.projectAlignmentView.findMany({
      where: { projectId: { in: projectIds } },
      select: { projectId: true, plannedBudget: true },
    });
    const budgetByProject = new Map<string, number>(
      views.map((v) => [v.projectId, v.plannedBudget != null ? Number(v.plannedBudget) : 0]),
    );

    const acc = new Map<string, { projectCount: number; totalPlannedBudget: number }>();
    for (const link of links) {
      // Only in-scope rows (present in the projection) participate.
      if (!budgetByProject.has(link.projectId)) continue;
      const budget = budgetByProject.get(link.projectId) ?? 0;
      const cur = acc.get(link.goalId) ?? { projectCount: 0, totalPlannedBudget: 0 };
      cur.projectCount += 1;
      cur.totalPlannedBudget += budget;
      acc.set(link.goalId, cur);
    }

    return [...acc.entries()].map(([groupId, v]) => ({
      groupId,
      projectCount: v.projectCount,
      totalPlannedBudget: v.totalPlannedBudget,
    }));
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type AlignmentViewRow = {
  projectId: string;
  name: string;
  status: string;
  plannedBudget: Prisma.Decimal | null;
  portfolioId: string | null;
  programId: string | null;
  aligned: boolean;
  lastEventAt: Date;
  updatedAt: Date;
};

function toRecord(row: AlignmentViewRow): AlignmentViewRecord {
  return {
    projectId: row.projectId,
    name: row.name,
    status: row.status,
    plannedBudget: row.plannedBudget != null ? Number(row.plannedBudget) : null,
    portfolioId: row.portfolioId,
    programId: row.programId,
    aligned: row.aligned,
    lastEventAt: row.lastEventAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
