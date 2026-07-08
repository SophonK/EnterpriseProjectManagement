import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { AppError } from "@epm/shared";
import type { PortfolioDTO, PortfolioStatus, AuthContext } from "@epm/shared";
import { BaseRepository } from "../../../foundation/db/base-repository.js";
import type { PrismaService } from "../../../foundation/db/prisma.service.js";

@Injectable()
export class PortfolioRepository extends BaseRepository {
  readonly schema = "strategy" as const;

  constructor(prisma: PrismaService) {
    super(prisma);
  }

  async create(data: {
    name: string;
    description?: string | null;
    ownerId: string;
  }): Promise<PortfolioDTO> {
    const row = await this.prisma.portfolio.create({
      data: {
        name: data.name,
        description: data.description ?? null,
        ownerId: data.ownerId,
        updatedAt: new Date(),
      },
    });
    return toDTO(row, []);
  }

  /** Scoped read — throws STRATEGY_003 if not found OR caller lacks access (info hiding). */
  async findByIdScoped(id: string, ctx: AuthContext): Promise<PortfolioDTO> {
    const scopeWhere = buildScopeWhere(ctx);
    const row = await this.prisma.portfolio.findFirst({
      where: { ...scopeWhere, id },
      include: { portfolioGoals: { select: { goalId: true } } },
    });
    if (!row) throw new AppError("STRATEGY_003", `Portfolio ${id} not found`);
    return toDTO(row, row.portfolioGoals.map((pg) => pg.goalId));
  }

  /** Record-scoped list: EPMO Director sees all, everyone else only their own (ownerId). */
  async findMany(ctx: AuthContext): Promise<PortfolioDTO[]> {
    const scopeWhere = buildScopeWhere(ctx);
    const rows = await this.prisma.portfolio.findMany({
      where: { ...scopeWhere, status: "Active" },
      orderBy: { createdAt: "desc" },
      include: { portfolioGoals: { select: { goalId: true } } },
    });
    return rows.map((row) => toDTO(row, row.portfolioGoals.map((pg) => pg.goalId)));
  }

  async existsById(id: string): Promise<boolean> {
    const row = await this.prisma.portfolio.findUnique({ where: { id }, select: { id: true } });
    return row !== null;
  }

  /**
   * Idempotent association of goals to a portfolio (set semantics via
   * `@@unique([portfolioId, goalId])`). Re-associating an existing pair is a no-op
   * (`skipDuplicates`) — applying twice equals applying once (P3).
   */
  async associateGoals(portfolioId: string, goalIds: string[]): Promise<void> {
    if (goalIds.length === 0) return;
    await this.prisma.portfolioGoal.createMany({
      data: goalIds.map((goalId) => ({ portfolioId, goalId })),
      skipDuplicates: true,
    });
  }

  async listGoalIds(portfolioId: string): Promise<string[]> {
    const rows = await this.prisma.portfolioGoal.findMany({
      where: { portfolioId },
      select: { goalId: true },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((r) => r.goalId);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildScopeWhere(ctx: AuthContext): Prisma.PortfolioWhereInput {
  if (ctx.roles.includes("EPMO_DIRECTOR")) return {}; // Director: all portfolios
  return { ownerId: ctx.userId }; // Portfolio Manager (and others): own portfolios only
}

type PortfolioRow = {
  id: string;
  name: string;
  description: string | null;
  ownerId: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

function toDTO(row: PortfolioRow, goalIds: string[]): PortfolioDTO {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    ownerId: row.ownerId,
    status: row.status as PortfolioStatus,
    goalIds,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
