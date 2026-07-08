import { Injectable } from "@nestjs/common";
import { AppError } from "@epm/shared";
import type { MilestoneDTO } from "@epm/shared";
import { BaseRepository } from "../../../foundation/db/base-repository.js";
import type { PrismaService } from "../../../foundation/db/prisma.service.js";

@Injectable()
export class MilestoneRepository extends BaseRepository {
  readonly schema = "execution" as const;

  constructor(prisma: PrismaService) {
    super(prisma);
  }

  async create(data: {
    projectId: string;
    title: string;
    description?: string | null;
    dueDate: Date;
    sortOrder?: number;
    createdBy: string;
  }): Promise<MilestoneDTO> {
    const now = new Date();
    const overdue = data.dueDate < now;
    const row = await this.prisma.milestone.create({
      data: {
        projectId: data.projectId,
        title: data.title,
        description: data.description ?? null,
        dueDate: data.dueDate,
        overdue,
        sortOrder: data.sortOrder ?? 0,
        createdBy: data.createdBy,
        updatedAt: now,
      },
    });
    return toDTO(row);
  }

  async findByProject(projectId: string): Promise<MilestoneDTO[]> {
    const now = new Date();
    const rows = await this.prisma.milestone.findMany({
      where: { projectId },
      orderBy: { sortOrder: "asc" },
    });

    // Materialize overdue flag: update stale rows and publish event via caller
    const stale = rows.filter(
      (r) => r.completedAt === null && r.dueDate < now && !r.overdue,
    );
    if (stale.length > 0) {
      await this.prisma.milestone.updateMany({
        where: { id: { in: stale.map((r) => r.id) } },
        data: { overdue: true, updatedAt: now },
      });
      for (const r of stale) r.overdue = true;
    }

    return rows.map(toDTO);
  }

  async findById(id: string): Promise<MilestoneDTO | null> {
    const row = await this.prisma.milestone.findUnique({ where: { id } });
    return row ? toDTO(refreshOverdue(row)) : null;
  }

  async findByIdOrThrow(id: string, projectId: string): Promise<MilestoneDTO> {
    const row = await this.prisma.milestone.findFirst({ where: { id, projectId } });
    if (!row) throw new AppError("NOT_FOUND", `Milestone ${id} not found`);
    return toDTO(refreshOverdue(row));
  }

  async update(
    id: string,
    data: {
      title?: string;
      description?: string | null;
      dueDate?: Date;
      completedAt?: Date | null;
      sortOrder?: number;
    },
  ): Promise<MilestoneDTO> {
    const now = new Date();
    // Compute overdue from new or existing due date
    const existing = await this.prisma.milestone.findUnique({ where: { id } });
    if (!existing) throw new AppError("NOT_FOUND", `Milestone ${id} not found`);

    const effectiveDueDate = data.dueDate ?? existing.dueDate;
    const effectiveCompletedAt =
      data.completedAt !== undefined ? data.completedAt : existing.completedAt;
    const overdue =
      effectiveCompletedAt === null && effectiveDueDate < now;

    const row = await this.prisma.milestone.update({
      where: { id },
      data: {
        ...data,
        overdue,
        updatedAt: now,
      },
    });
    return toDTO(row);
  }

  async delete(id: string, projectId: string): Promise<void> {
    const existing = await this.prisma.milestone.findFirst({ where: { id, projectId } });
    if (!existing) throw new AppError("NOT_FOUND", `Milestone ${id} not found`);
    await this.prisma.milestone.delete({ where: { id } });
  }

  /** Returns IDs of milestones that just became overdue (for event publishing). */
  async getNewlyOverdueIds(projectId: string): Promise<string[]> {
    const now = new Date();
    const rows = await this.prisma.milestone.findMany({
      where: { projectId, completedAt: null, overdue: false },
      select: { id: true, dueDate: true },
    });
    return rows.filter((r) => r.dueDate < now).map((r) => r.id);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type MilestoneRow = {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  dueDate: Date;
  completedAt: Date | null;
  overdue: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

function refreshOverdue(row: MilestoneRow): MilestoneRow {
  if (row.completedAt !== null) return { ...row, overdue: false };
  return { ...row, overdue: row.dueDate < new Date() };
}

function toDTO(row: MilestoneRow): MilestoneDTO {
  return {
    id: row.id,
    projectId: row.projectId,
    title: row.title,
    description: row.description,
    dueDate: row.dueDate.toISOString().slice(0, 10),
    completedAt: row.completedAt?.toISOString() ?? null,
    overdue: row.overdue,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
