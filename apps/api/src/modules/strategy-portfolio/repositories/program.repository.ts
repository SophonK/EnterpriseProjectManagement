import { Injectable } from "@nestjs/common";
import { AppError } from "@epm/shared";
import type { ProgramDTO, ProgramStatus } from "@epm/shared";
import { BaseRepository } from "../../../foundation/db/base-repository.js";
import type { PrismaService } from "../../../foundation/db/prisma.service.js";

@Injectable()
export class ProgramRepository extends BaseRepository {
  readonly schema = "strategy" as const;

  constructor(prisma: PrismaService) {
    super(prisma);
  }

  async create(data: {
    portfolioId: string;
    name: string;
    description?: string | null;
  }): Promise<ProgramDTO> {
    const row = await this.prisma.program.create({
      data: {
        portfolioId: data.portfolioId,
        name: data.name,
        description: data.description ?? null,
        updatedAt: new Date(),
      },
    });
    return toDTO(row);
  }

  async findById(id: string): Promise<ProgramDTO | null> {
    const row = await this.prisma.program.findUnique({ where: { id } });
    return row ? toDTO(row) : null;
  }

  async findByIdOrThrow(id: string): Promise<ProgramDTO> {
    const dto = await this.findById(id);
    if (!dto) throw new AppError("STRATEGY_004", `Program ${id} not found`);
    return dto;
  }

  /** In-process soft-ref validation for execution's `programId` (D3-6). */
  async existsById(id: string): Promise<boolean> {
    const row = await this.prisma.program.findUnique({ where: { id }, select: { id: true } });
    return row !== null;
  }

  async listByPortfolio(portfolioId: string): Promise<ProgramDTO[]> {
    const rows = await this.prisma.program.findMany({
      where: { portfolioId },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(toDTO);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ProgramRow = {
  id: string;
  portfolioId: string;
  name: string;
  description: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

function toDTO(row: ProgramRow): ProgramDTO {
  return {
    id: row.id,
    portfolioId: row.portfolioId,
    name: row.name,
    description: row.description,
    status: row.status as ProgramStatus,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
