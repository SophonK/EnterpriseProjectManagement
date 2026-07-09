import { Injectable } from "@nestjs/common";
import { AppError } from "@epm/shared";
import type { StrategicGoalDTO, GoalStatus } from "@epm/shared";
import { BaseRepository } from "../../../foundation/db/base-repository.js";
import { PrismaService } from "../../../foundation/db/prisma.service.js";

@Injectable()
export class StrategicGoalRepository extends BaseRepository {
  readonly schema = "strategy" as const;

  constructor(prisma: PrismaService) {
    super(prisma);
  }

  async create(data: {
    title: string;
    description: string;
    measure: string;
    createdBy: string;
  }): Promise<StrategicGoalDTO> {
    const row = await this.prisma.strategicGoal.create({
      data: {
        title: data.title,
        description: data.description,
        measure: data.measure,
        createdBy: data.createdBy,
        updatedAt: new Date(),
      },
    });
    return toDTO(row);
  }

  async findById(id: string): Promise<StrategicGoalDTO | null> {
    const row = await this.prisma.strategicGoal.findUnique({ where: { id } });
    return row ? toDTO(row) : null;
  }

  async findByIdOrThrow(id: string): Promise<StrategicGoalDTO> {
    const dto = await this.findById(id);
    if (!dto) throw new AppError("STRATEGY_002", `Strategic goal ${id} not found`);
    return dto;
  }

  /** Active goals only, newest first. */
  async listActive(): Promise<StrategicGoalDTO[]> {
    const rows = await this.prisma.strategicGoal.findMany({
      where: { status: "Active" },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(toDTO);
  }

  /** Archive a goal by setting its status to `Archived`. */
  async archive(id: string): Promise<void> {
    try {
      await this.prisma.strategicGoal.update({
        where: { id },
        data: { status: "Archived", updatedAt: new Date() },
      });
    } catch (err) {
      if (isPrismaNotFound(err)) throw new AppError("STRATEGY_002", `Strategic goal ${id} not found`);
      throw err;
    }
  }

  async existsById(id: string): Promise<boolean> {
    const row = await this.prisma.strategicGoal.findUnique({ where: { id }, select: { id: true } });
    return row !== null;
  }

  /**
   * True only when the goal exists AND is `Active`. Used to gate NEW links/associations
   * so an Archived goal cannot be freshly linked (reads of pre-existing links are untouched).
   */
  async existsActiveById(id: string): Promise<boolean> {
    const row = await this.prisma.strategicGoal.findFirst({
      where: { id, status: "Active" },
      select: { id: true },
    });
    return row !== null;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type StrategicGoalRow = {
  id: string;
  title: string;
  description: string;
  measure: string;
  status: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

function toDTO(row: StrategicGoalRow): StrategicGoalDTO {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    measure: row.measure,
    status: row.status as GoalStatus,
    createdBy: row.createdBy,
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
