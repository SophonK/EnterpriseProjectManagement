import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { AppError, SYSTEM_ACTOR_ID } from "@epm/shared";
import type { RaidItemDTO, RaidFilter } from "@epm/shared";
import { BaseRepository } from "../../../foundation/db/base-repository.js";
import { PrismaService } from "../../../foundation/db/prisma.service.js";

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

  async findByIdOrThrow(
    id: string,
    accessibleProjectIds: readonly string[] | null,
  ): Promise<RaidItemDTO> {
    const scopeWhere = scopeWhereForProjects(accessibleProjectIds);
    const row = await this.prisma.raidItem.findFirst({
      where: { AND: [scopeWhere, { id }] },
    });
    if (!row) throw new AppError("RISK_004", `RAID item ${id} not found`);
    return toDTO(row);
  }

  async create(
    data: {
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
    },
    tx?: Prisma.TransactionClient,
  ): Promise<RaidItemDTO> {
    const client = tx ?? this.prisma;
    const row = await client.raidItem.create({
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
    tx?: Prisma.TransactionClient,
  ): Promise<RaidItemDTO> {
    const client = tx ?? this.prisma;
    const row = await client.raidItem.update({
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
    accessibleProjectIds: readonly string[] | null,
  ): Promise<[RaidItemDTO[], number]> {
    const scopeWhere = scopeWhereForProjects(accessibleProjectIds);
    // C2: the caller-supplied projectId filter must be ANDed with the scope, never
    // spread onto the same `projectId` key (which would overwrite the scope and allow
    // an IDOR bypass via ?projectId=). Every filter clause is its own AND term.
    const where = {
      AND: [
        scopeWhere,
        ...(filter.projectId ? [{ projectId: filter.projectId }] : []),
        ...(filter.type ? [{ type: filter.type }] : []),
        ...(filter.status ? [{ status: filter.status }] : []),
        ...(filter.escalated != null ? [{ escalated: filter.escalated }] : []),
      ],
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

  /**
   * BR-8 archive cascade: close every Open/InProgress RAID item for a project and
   * return before/after pairs so the caller can emit one audit row per closed item
   * (action "update", actor = SYSTEM_ACTOR_ID). Reads the affected rows first (in the
   * same tx) because `updateMany` cannot return them. Runs in its own transaction when
   * none is supplied, so the reads, the bulk close, and (via the passed tx) the audit
   * rows all commit atomically.
   */
  async closeAllForProject(
    projectId: string,
    closedAt: Date,
    tx?: Prisma.TransactionClient,
  ): Promise<Array<{ before: RaidItemDTO; after: RaidItemDTO }>> {
    const run = async (
      client: Prisma.TransactionClient,
    ): Promise<Array<{ before: RaidItemDTO; after: RaidItemDTO }>> => {
      const rows = await client.raidItem.findMany({
        where: { projectId, status: { in: ["Open", "InProgress"] } },
      });
      if (rows.length === 0) return [];
      const updatedAt = new Date();
      await client.raidItem.updateMany({
        where: { projectId, status: { in: ["Open", "InProgress"] } },
        data: { status: "Closed", closedBy: SYSTEM_ACTOR_ID, closedAt, updatedAt },
      });
      return rows.map((row) => ({
        before: toDTO(row),
        after: toDTO({ ...row, status: "Closed", closedBy: SYSTEM_ACTOR_ID, closedAt, updatedAt }),
      }));
    };
    return tx ? run(tx) : this.prisma.$transaction(run);
  }

  /**
   * H7 (RaidQueryService): currently-escalated risks the caller may see, ordered by
   * riskScore. `accessibleProjectIds === null` ⇒ Director/unrestricted (no filter);
   * an empty array fails closed.
   */
  async findEscalated(
    accessibleProjectIds: readonly string[] | null,
    limit?: number,
  ): Promise<RaidItemDTO[]> {
    const scopeWhere = scopeWhereForProjects(accessibleProjectIds);
    const rows = await this.prisma.raidItem.findMany({
      where: { AND: [scopeWhere, { escalated: true }] },
      orderBy: [{ riskScore: "desc" }, { createdAt: "desc" }],
      ...(limit != null ? { take: limit } : {}),
    });
    return rows.map(toDTO);
  }

  /**
   * H7 (RaidQueryService): summary aggregates restricted to an explicit project-id set
   * (the caller intersects the requested ids with the accessible set before calling, so
   * an empty list correctly yields zeros). Returns raw pieces; banding is applied by the
   * service via the shared `riskBand`.
   */
  async getSummaryData(
    projectIds: readonly string[],
    topLimit: number,
  ): Promise<{
    totalOpen: number;
    totalEscalated: number;
    riskScores: number[];
    topEscalated: RaidItemDTO[];
  }> {
    const inProjects = { projectId: { in: [...projectIds] } };
    const [totalOpen, totalEscalated, scoredRows, topRows] = await this.prisma.$transaction([
      this.prisma.raidItem.count({
        where: { AND: [inProjects, { status: { in: ["Open", "InProgress"] } }] },
      }),
      this.prisma.raidItem.count({
        where: { AND: [inProjects, { escalated: true }] },
      }),
      this.prisma.raidItem.findMany({
        where: { AND: [inProjects, { riskScore: { not: null } }] },
        select: { riskScore: true },
      }),
      this.prisma.raidItem.findMany({
        where: { AND: [inProjects, { escalated: true }] },
        orderBy: [{ riskScore: "desc" }, { createdAt: "desc" }],
        take: topLimit,
      }),
    ]);
    return {
      totalOpen,
      totalEscalated,
      riskScores: scoredRows
        .map((r) => r.riskScore)
        .filter((s): s is number => s != null),
      topEscalated: topRows.map(toDTO),
    };
  }
}

// ---------------------------------------------------------------------------
// Scope helper
// ---------------------------------------------------------------------------

/**
 * C3: RAID items are scoped by the caller's accessible project ids, resolved from
 * project-execution (the source of truth). The platform never issues project-type
 * record scopes, so we cannot derive scope from ctx.recordScopes here.
 *
 * `null` ⇒ Director / unrestricted (match everything). An empty array fails closed
 * (`{ projectId: { in: [] } }` matches nothing).
 */
export function scopeWhereForProjects(
  accessibleProjectIds: readonly string[] | null,
): object {
  if (accessibleProjectIds === null) return {};
  return { projectId: { in: [...accessibleProjectIds] } };
}
