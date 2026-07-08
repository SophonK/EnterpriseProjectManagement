import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { AppError } from "@epm/shared";
import type { ProjectDTO, ProjectFilter, ProjectStatus, ProjectHealth } from "@epm/shared";
import type { AuthContext } from "@epm/shared";
import { BaseRepository } from "../../../foundation/db/base-repository.js";
import type { PrismaService } from "../../../foundation/db/prisma.service.js";

@Injectable()
export class ProjectRepository extends BaseRepository {
  readonly schema = "execution" as const;

  constructor(prisma: PrismaService) {
    super(prisma);
  }

  async create(data: {
    name: string;
    description?: string | null;
    ownerUserId: string;
    portfolioId: string;
    programId?: string | null;
    plannedStart: Date;
    plannedEnd: Date;
    plannedBudget?: number | null;
    sourceDemandId?: string | null;
    createdBy: string;
  }): Promise<ProjectDTO> {
    const row = await this.prisma.project.create({
      data: {
        name: data.name,
        description: data.description ?? null,
        ownerUserId: data.ownerUserId,
        portfolioId: data.portfolioId,
        programId: data.programId ?? null,
        plannedStart: data.plannedStart,
        plannedEnd: data.plannedEnd,
        plannedBudget: data.plannedBudget != null
          ? new Prisma.Decimal(data.plannedBudget)
          : null,
        sourceDemandId: data.sourceDemandId ?? null,
        createdBy: data.createdBy,
        updatedAt: new Date(),
      },
    });
    return toDTO(row);
  }

  async findById(id: string): Promise<ProjectDTO | null> {
    const row = await this.prisma.project.findFirst({
      where: { id, archivedAt: null },
    });
    return row ? toDTO(row) : null;
  }

  async findByIdOrThrow(id: string): Promise<ProjectDTO> {
    const dto = await this.findById(id);
    if (!dto) throw new AppError("NOT_FOUND", `Project ${id} not found`);
    return dto;
  }

  async findBySourceDemandId(demandId: string): Promise<ProjectDTO | null> {
    const row = await this.prisma.project.findFirst({
      where: { sourceDemandId: demandId },
    });
    return row ? toDTO(row) : null;
  }

  async findMany(
    filter: ProjectFilter,
    ctx: AuthContext,
  ): Promise<{ data: ProjectDTO[]; total: number }> {
    const page = filter.page ?? 1;
    const pageSize = Math.min(filter.pageSize ?? 20, 100);
    const skip = (page - 1) * pageSize;

    const scopeWhere = buildScopeWhere(ctx, filter);

    const [rows, total] = await Promise.all([
      this.prisma.project.findMany({
        where: scopeWhere,
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
      }),
      this.prisma.project.count({ where: scopeWhere }),
    ]);

    return { data: rows.map(toDTO), total };
  }

  async update(
    id: string,
    data: {
      name?: string;
      description?: string | null;
      programId?: string | null;
      plannedStart?: Date;
      plannedEnd?: Date;
      plannedBudget?: number | null;
    },
  ): Promise<ProjectDTO> {
    try {
      const row = await this.prisma.project.update({
        where: { id },
        data: {
          ...data,
          plannedBudget: data.plannedBudget != null
            ? new Prisma.Decimal(data.plannedBudget)
            : data.plannedBudget,
          updatedAt: new Date(),
        },
      });
      return toDTO(row);
    } catch (err) {
      if (isPrismaNotFound(err)) throw new AppError("NOT_FOUND", `Project ${id} not found`);
      throw err;
    }
  }

  async updateStatusHealth(
    id: string,
    status: ProjectStatus,
    health: ProjectHealth,
  ): Promise<void> {
    await this.prisma.project.update({
      where: { id },
      data: { status, health, updatedAt: new Date() },
    });
  }

  async archive(id: string): Promise<void> {
    try {
      await this.prisma.project.update({
        where: { id },
        data: { archivedAt: new Date(), updatedAt: new Date() },
      });
    } catch (err) {
      if (isPrismaNotFound(err)) throw new AppError("NOT_FOUND", `Project ${id} not found`);
      throw err;
    }
  }

  async existsByNameInPortfolio(name: string, portfolioId: string, excludeId?: string): Promise<boolean> {
    const row = await this.prisma.project.findFirst({
      where: {
        name: { equals: name, mode: "insensitive" },
        portfolioId,
        archivedAt: null,
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
    });
    return row !== null;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildScopeWhere(ctx: AuthContext, filter: ProjectFilter): Prisma.ProjectWhereInput {
  const base: Prisma.ProjectWhereInput = {
    archivedAt: null,
    ...(filter.portfolioId ? { portfolioId: filter.portfolioId } : {}),
    ...(filter.programId   ? { programId:   filter.programId   } : {}),
    ...(filter.health      ? { health:       filter.health      } : {}),
    ...(filter.status      ? { status:       filter.status      } : {}),
  };

  const isDirector = ctx.roles.includes("EPMO_DIRECTOR");
  if (isDirector) return base;

  const isPortfolioManager = ctx.roles.includes("PORTFOLIO_MANAGER");
  if (isPortfolioManager) {
    const portfolioScope = ctx.recordScopes
      .filter((s) => s.type === "portfolio")
      .flatMap((s) => s.ids ?? []);
    return { ...base, portfolioId: { in: portfolioScope } };
  }

  // Project Manager and others: own projects only
  return { ...base, ownerUserId: ctx.userId };
}

type PrismaProjectRow = Awaited<ReturnType<typeof dummyFindFirst>>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function dummyFindFirst(_p?: any) { return null as any; }

function toDTO(row: {
  id: string;
  name: string;
  description: string | null;
  ownerUserId: string;
  portfolioId: string;
  programId: string | null;
  status: string;
  health: string;
  plannedStart: Date;
  plannedEnd: Date;
  plannedBudget: Prisma.Decimal | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): ProjectDTO {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    ownerUserId: row.ownerUserId,
    portfolioId: row.portfolioId,
    programId: row.programId,
    status: row.status as ProjectDTO["status"],
    health: row.health as ProjectDTO["health"],
    plannedStart: row.plannedStart.toISOString().slice(0, 10),
    plannedEnd: row.plannedEnd.toISOString().slice(0, 10),
    plannedBudget: row.plannedBudget != null ? Number(row.plannedBudget) : null,
    archivedAt: row.archivedAt?.toISOString() ?? null,
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
