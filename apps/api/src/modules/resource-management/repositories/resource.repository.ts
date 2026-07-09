import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { AppError } from "@epm/shared";
import type { ResourceDTO, ResourceFilter, SkillDTO, CapacityPeriodDTO } from "@epm/shared";
import type { AuthContext } from "@epm/shared";
import { BaseRepository } from "../../../foundation/db/base-repository.js";
import type { PrismaService } from "../../../foundation/db/prisma.service.js";

@Injectable()
export class ResourceRepository extends BaseRepository {
  readonly schema = "resource" as const;

  constructor(prisma: PrismaService) {
    super(prisma);
  }

  async create(data: {
    name: string;
    email: string;
    poolId: string;
    fteCapacity: number;
    createdBy: string;
    skills?: Array<{ name: string; level: string }>;
  }): Promise<ResourceDTO> {
    const now = new Date();
    const row = await this.prisma.resource.create({
      data: {
        name: data.name,
        email: data.email,
        poolId: data.poolId,
        fteCapacity: new Prisma.Decimal(data.fteCapacity),
        createdBy: data.createdBy,
        updatedAt: now,
        skills: data.skills?.length
          ? { create: data.skills.map((s) => ({ name: s.name, level: s.level })) }
          : undefined,
      },
      include: { pool: true, skills: true, capacityPeriods: true },
    });
    return toDTO(row);
  }

  async findById(id: string): Promise<ResourceDTO | null> {
    const row = await this.prisma.resource.findFirst({
      where: { id, deletedAt: null },
      include: { pool: true, skills: true, capacityPeriods: true },
    });
    return row ? toDTO(row) : null;
  }

  async findByIdOrThrow(id: string, ctx: AuthContext): Promise<ResourceDTO> {
    const scopeWhere = buildResourceScopeWhere(ctx);
    const row = await this.prisma.resource.findFirst({
      where: { ...scopeWhere, id, deletedAt: null },
      include: { pool: true, skills: true, capacityPeriods: true },
    });
    if (!row) throw new AppError("RESOURCE_005", `Resource ${id} not found`);
    return toDTO(row);
  }

  async findByEmail(email: string): Promise<ResourceDTO | null> {
    const row = await this.prisma.resource.findFirst({
      where: { email, deletedAt: null },
      include: { pool: true, skills: true, capacityPeriods: true },
    });
    return row ? toDTO(row) : null;
  }

  async findMany(
    filter: ResourceFilter,
    ctx: AuthContext,
  ): Promise<{ data: ResourceDTO[]; total: number }> {
    const scopeWhere = buildResourceScopeWhere(ctx);
    const where: Prisma.ResourceWhereInput = {
      ...scopeWhere,
      deletedAt: null,
      ...(filter.poolId ? { poolId: filter.poolId } : {}),
      ...(filter.skill
        ? { skills: { some: { name: { contains: filter.skill, mode: "insensitive" } } } }
        : {}),
    };
    const page = filter.page ?? 1;
    const pageSize = Math.min(filter.pageSize ?? 20, 100);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.resource.findMany({
        where,
        include: { pool: true, skills: true, capacityPeriods: true },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { name: "asc" },
      }),
      this.prisma.resource.count({ where }),
    ]);
    return { data: rows.map(toDTO), total };
  }

  async update(
    id: string,
    data: {
      name?: string;
      email?: string;
      poolId?: string;
      fteCapacity?: number;
      overAllocated?: boolean;
      skills?: Array<{ name: string; level: string }>;
    },
  ): Promise<ResourceDTO> {
    const now = new Date();
    const updateData: Prisma.ResourceUpdateInput = {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.email !== undefined ? { email: data.email } : {}),
      ...(data.poolId !== undefined ? { pool: { connect: { id: data.poolId } } } : {}),
      ...(data.fteCapacity !== undefined
        ? { fteCapacity: new Prisma.Decimal(data.fteCapacity) }
        : {}),
      ...(data.overAllocated !== undefined ? { overAllocated: data.overAllocated } : {}),
      updatedAt: now,
    };

    if (data.skills !== undefined) {
      // Replace skills wholesale
      await this.prisma.skill.deleteMany({ where: { resourceId: id } });
      updateData.skills = {
        create: data.skills.map((s) => ({ name: s.name, level: s.level })),
      };
    }

    const row = await this.prisma.resource.update({
      where: { id },
      data: updateData,
      include: { pool: true, skills: true, capacityPeriods: true },
    });
    return toDTO(row);
  }

  async softDelete(id: string): Promise<void> {
    await this.prisma.resource.update({
      where: { id },
      data: { deletedAt: new Date(), updatedAt: new Date() },
    });
  }

  async hardDelete(id: string): Promise<void> {
    await this.prisma.resource.delete({ where: { id } });
  }

  async poolExists(poolId: string): Promise<boolean> {
    const count = await this.prisma.resourcePool.count({ where: { id: poolId } });
    return count > 0;
  }
}

// ---------------------------------------------------------------------------
// Scope helper
// ---------------------------------------------------------------------------

export function buildResourceScopeWhere(ctx: AuthContext): Prisma.ResourceWhereInput {
  if (ctx.roles.includes("EPMO_DIRECTOR")) return {};
  const poolIds = ctx.recordScopes
    .filter((s) => (s as { type: string; id: string }).type === "pool")
    .map((s) => (s as { type: string; id: string }).id);
  if (poolIds.length === 0) return {};
  return { poolId: { in: poolIds } };
}

// ---------------------------------------------------------------------------
// Row types & toDTO
// ---------------------------------------------------------------------------

type ResourceRow = {
  id: string;
  name: string;
  email: string;
  poolId: string;
  fteCapacity: Prisma.Decimal;
  overAllocated: boolean;
  createdAt: Date;
  updatedAt: Date;
  pool: { id: string; name: string; createdAt: Date; updatedAt: Date };
  skills: Array<{ id: string; resourceId: string; name: string; level: string; createdAt: Date }>;
  capacityPeriods: Array<{
    id: string;
    resourceId: string;
    periodStart: Date;
    capacityPct: Prisma.Decimal;
    createdAt: Date;
    updatedAt: Date;
  }>;
};

function toDTO(row: ResourceRow): ResourceDTO {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    poolId: row.poolId,
    poolName: row.pool.name,
    fteCapacity: Number(row.fteCapacity),
    overAllocated: row.overAllocated,
    skills: row.skills.map(
      (s): SkillDTO => ({
        id: s.id,
        resourceId: s.resourceId,
        name: s.name,
        level: s.level as SkillDTO["level"],
        createdAt: s.createdAt.toISOString(),
      }),
    ),
    capacityPeriods: row.capacityPeriods.map(
      (cp): CapacityPeriodDTO => ({
        id: cp.id,
        resourceId: cp.resourceId,
        periodStart: cp.periodStart.toISOString().slice(0, 10),
        capacityPct: Number(cp.capacityPct),
        createdAt: cp.createdAt.toISOString(),
        updatedAt: cp.updatedAt.toISOString(),
      }),
    ),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
