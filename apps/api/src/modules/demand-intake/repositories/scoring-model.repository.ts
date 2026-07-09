import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { AppError } from "@epm/shared";
import type { ScoringModelDTO, ScoringCriterionDTO } from "@epm/shared";
import { BaseRepository } from "../../../foundation/db/base-repository.js";
import type { PrismaService } from "../../../foundation/db/prisma.service.js";

export interface CriterionInput {
  name: string;
  weight: number;
  maxScore: number;
  goalId?: string | null;
  sortOrder: number;
}

@Injectable()
export class ScoringModelRepository extends BaseRepository {
  readonly schema = "intake" as const;

  constructor(prisma: PrismaService) {
    super(prisma);
  }

  /**
   * Create a new (inactive) version of the scoring model together with its criteria
   * rows, atomically in a single transaction. The version number is derived inside the
   * transaction as `max(version) + 1` so successive configures produce a monotonic
   * version sequence. Activation is a separate step (`activate`) so exactly one model
   * is active at a time (D3-3).
   */
  async createWithCriteria(
    model: { name: string; createdBy: string },
    criteria: CriterionInput[],
    tx?: Prisma.TransactionClient,
  ): Promise<ScoringModelDTO> {
    const run = async (tx: Prisma.TransactionClient): Promise<ScoringModelDTO> => {
      const latest = await tx.scoringModel.findFirst({
        orderBy: { version: "desc" },
        select: { version: true },
      });
      const version = (latest?.version ?? 0) + 1;

      const created = await tx.scoringModel.create({
        data: {
          name: model.name,
          version,
          createdBy: model.createdBy,
          updatedAt: new Date(),
        },
      });

      if (criteria.length > 0) {
        await tx.scoringCriterion.createMany({
          data: criteria.map((c) => ({
            scoringModelId: created.id,
            name: c.name,
            weight: new Prisma.Decimal(c.weight),
            maxScore: c.maxScore,
            goalId: c.goalId ?? null,
            sortOrder: c.sortOrder,
          })),
        });
      }

      const rows = await tx.scoringCriterion.findMany({
        where: { scoringModelId: created.id },
        orderBy: { sortOrder: "asc" },
      });
      return modelToDTO(created, rows);
    };

    return tx ? run(tx) : this.prisma.$transaction(run);
  }

  /**
   * Activate a model version, atomically deactivating every other model so that
   * exactly one is active (single-active invariant, D3-3). Throws DEMAND_003 if the
   * target model does not exist.
   */
  async activate(modelId: string, tx?: Prisma.TransactionClient): Promise<ScoringModelDTO> {
    const run = async (tx: Prisma.TransactionClient): Promise<ScoringModelDTO> => {
      await tx.scoringModel.updateMany({
        where: { id: { not: modelId }, isActive: true },
        data: { isActive: false },
      });
      const updated = await tx.scoringModel.update({
        where: { id: modelId },
        data: { isActive: true, updatedAt: new Date() },
      });
      const criteria = await tx.scoringCriterion.findMany({
        where: { scoringModelId: modelId },
        orderBy: { sortOrder: "asc" },
      });
      return modelToDTO(updated, criteria);
    };

    try {
      return tx ? await run(tx) : await this.prisma.$transaction(run);
    } catch (err) {
      if (isPrismaNotFound(err)) throw new AppError("DEMAND_003", `Scoring model ${modelId} not found`);
      throw err;
    }
  }

  /** The single active scoring model (with criteria), or DEMAND_003 when none is active. */
  async getActiveOrThrow(): Promise<ScoringModelDTO> {
    const model = await this.prisma.scoringModel.findFirst({
      where: { isActive: true },
      include: { criteria: { orderBy: { sortOrder: "asc" } } },
    });
    if (!model) throw new AppError("DEMAND_003", "No active scoring model");
    return modelToDTO(model, model.criteria);
  }

  async listCriteria(scoringModelId: string): Promise<ScoringCriterionDTO[]> {
    const rows = await this.prisma.scoringCriterion.findMany({
      where: { scoringModelId },
      orderBy: { sortOrder: "asc" },
    });
    return rows.map(criterionToDTO);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ScoringModelRow = {
  id: string;
  name: string;
  version: number;
  isActive: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

type ScoringCriterionRow = {
  id: string;
  scoringModelId: string;
  name: string;
  weight: Prisma.Decimal;
  maxScore: number;
  goalId: string | null;
  sortOrder: number;
};

function criterionToDTO(row: ScoringCriterionRow): ScoringCriterionDTO {
  return {
    id: row.id,
    scoringModelId: row.scoringModelId,
    name: row.name,
    weight: Number(row.weight),
    maxScore: row.maxScore,
    goalId: row.goalId,
    sortOrder: row.sortOrder,
  };
}

function modelToDTO(row: ScoringModelRow, criteria: ScoringCriterionRow[]): ScoringModelDTO {
  return {
    id: row.id,
    name: row.name,
    version: row.version,
    isActive: row.isActive,
    createdBy: row.createdBy,
    criteria: criteria.map(criterionToDTO),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
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
