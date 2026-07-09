import { Injectable } from "@nestjs/common";
import { AppError } from "@epm/shared";
import type { AuthContext, RaidItemDTO, RaidFilter } from "@epm/shared";
import { BaseRepository } from "../../../foundation/db/base-repository.js";
import type { PrismaService } from "../../../foundation/db/prisma.service.js";

function toDTO(row: {
  id: string;
  projectId: string;
  type: string;
  title: string;
  description: string | null;
  severity: number | null;
  probability: number | null;
  riskScore: number | null;
  status: string;
  escalated: boolean;
  ownerUserId: string | null;
  mitigation: string | null;
  closedBy: string | null;
  closedAt: Date | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}): RaidItemDTO {
  return {
    id: row.id,
    projectId: row.projectId,
    type: row.type as RaidItemDTO["type"],
    title: row.title,
    description: row.description,
    severity: row.severity,
    probability: row.probability,
    riskScore: row.riskScore,
    status: row.status as RaidItemDTO["status"],
    escalated: row.escalated,
    ownerUserId: row.ownerUserId,
    mitigation: row.mitigation,
    closedBy: row.closedBy,
    closedAt: row.closedAt?.toISOString().slice(0, 10) ?? null,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class RaidItemRepository extends BaseRepository {
  readonly schema = "risk" as const;

  constructor(prisma: PrismaService) {
    super(prisma);
  }

  buildScopeWhere(ctx: AuthContext): object {
    if (ctx.roles.includes("EPMO_DIRECTOR")) return {};
    const projectIds = ctx.recordScopes
      .filter((s) => s.entity === "project")
      .map((s) => s.id);
    return { projectId: { in: projectIds } };
  }

  async findByIdOrThrow(id: string, ctx: AuthContext): Promise<RaidItemDTO> {
    const scopeWhere = this.buildScopeWhere(ctx);
    const row = await this.prisma.raidItem.findFirst({
      where: { id, ...scopeWhere },
    });
    if (!row) throw new AppError("RISK_004", `RAID item ${id} not found`);
    return toDTO(row);
  }

  async create(data: {
    projectId: string;
    type: string;
    title: string;
    description?: string;
    severity?: number;
    probability?: number;
    riskScore?: number;
    status: string;
    escalated: boolean;
    ownerUserId?: string;
    mitigation?: string;
    createdBy: string;
  }): Promise<RaidItemDTO> {
    const row = await this.prisma.raidItem.create({
      data: {
        projectId: data.projectId,
        type: data.type,
        title: data.title,
        description: data.description ?? null,
        severity: data.severity ?? null,
        probability: data.probability ?? null,
        riskScore: data.riskScore ?? null,
        status: data.status,
        escalated: data.escalated,
        ownerUserId: data.ownerUserId ?? null,
        mitigation: data.mitigation ?? null,
        createdBy: data.createdBy,
        updatedAt: new Date(),
      },
    });
    return toDTO(row);
  }

  async update(
    id: string,
    data: Partial<{
      title: string;
      description: string | null;
      severity: number | null;
      probability: number | null;
      riskScore: number | null;
      status: string;
      escalated: boolean;
      ownerUserId: string | null;
      mitigation: string | null;
      closedBy: string | null;
      closedAt: Date | null;
    }>,
  ): Promise<RaidItemDTO> {
    const row = await this.prisma.raidItem.update({
      where: { id },
      data: { ...data, updatedAt: new Date() },
    });
    return toDTO(row);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.raidItem.delete({ where: { id } });
  }

  async findMany(
    filter: RaidFilter,
    ctx: AuthContext,
  ): Promise<[RaidItemDTO[], number]> {
    const scopeWhere = this.buildScopeWhere(ctx);
    const where = {
      ...scopeWhere,
      ...(filter.projectId ? { projectId: filter.projectId } : {}),
      ...(filter.type ? { type: filter.type } : {}),
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.escalated != null ? { escalated: filter.escalated } : {}),
    };
    const page = filter.page ?? 1;
    const pageSize = Math.min(filter.pageSize ?? 25, 100);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.raidItem.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: [{ escalated: "desc" }, { riskScore: "desc" }, { createdAt: "desc" }],
      }),
      this.prisma.raidItem.count({ where }),
    ]);
    return [rows.map(toDTO), total];
  }

  async closeAllForProject(projectId: string, closedAt: Date): Promise<number> {
    const result = await this.prisma.raidItem.updateMany({
      where: { projectId, status: { in: ["Open", "InProgress"] } },
      data: { status: "Closed", closedBy: "system", closedAt, updatedAt: new Date() },
    });
    return result.count;
  }
}
