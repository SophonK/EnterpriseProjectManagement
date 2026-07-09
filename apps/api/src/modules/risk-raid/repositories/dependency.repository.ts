import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { AppError } from "@epm/shared";
import type { DependencyDTO, DependencyFilter } from "@epm/shared";
import { BaseRepository } from "../../../foundation/db/base-repository.js";
import type { PrismaService } from "../../../foundation/db/prisma.service.js";

function toDTO(row: {
  id: string;
  fromProjectId: string;
  toProjectId: string;
  description: string;
  dependencyType: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}): DependencyDTO {
  return {
    id: row.id,
    fromProjectId: row.fromProjectId,
    toProjectId: row.toProjectId,
    description: row.description,
    dependencyType: row.dependencyType as DependencyDTO["dependencyType"],
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class DependencyRepository extends BaseRepository {
  readonly schema = "risk" as const;

  constructor(prisma: PrismaService) {
    super(prisma);
  }

  // Cosmetic drift (out of scope — schema not edited): the `uq_dependency_pair` unique
  // index is declared as a plain composite unique in packages/db/prisma/schema.prisma,
  // whereas the SQL migration creates it as a PARTIAL index. This is a Prisma/migration
  // representation mismatch only — the DB constraint (relied on by the P2002 path above)
  // is correct. Left as-is per scope; noted here for the schema owner.
  async findByPair(fromProjectId: string, toProjectId: string): Promise<DependencyDTO | null> {
    const row = await this.prisma.dependency.findUnique({
      where: { uq_dependency_pair: { fromProjectId, toProjectId } },
    });
    return row ? toDTO(row) : null;
  }

  async findByIdOrThrow(id: string): Promise<DependencyDTO> {
    const row = await this.prisma.dependency.findUnique({ where: { id } });
    if (!row) throw new AppError("RISK_004", `Dependency ${id} not found`);
    return toDTO(row);
  }

  async create(
    data: {
      fromProjectId: string;
      toProjectId: string;
      description: string;
      dependencyType: string;
      createdBy: string;
    },
    tx?: Prisma.TransactionClient,
  ): Promise<DependencyDTO> {
    const client = tx ?? this.prisma;
    const row = await client.dependency.create({
      data: {
        fromProjectId: data.fromProjectId,
        toProjectId: data.toProjectId,
        description: data.description,
        dependencyType: data.dependencyType,
        createdBy: data.createdBy,
        updatedAt: new Date(),
      },
    });
    return toDTO(row);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.dependency.delete({ where: { id } });
  }

  async findMany(filter: DependencyFilter): Promise<[DependencyDTO[], number]> {
    const where = filter.projectId
      ? {
          OR: [
            { fromProjectId: filter.projectId },
            { toProjectId: filter.projectId },
          ],
        }
      : {};
    const page = filter.page ?? 1;
    const pageSize = Math.min(filter.pageSize ?? 25, 100);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.dependency.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.dependency.count({ where }),
    ]);
    return [rows.map(toDTO), total];
  }
}
