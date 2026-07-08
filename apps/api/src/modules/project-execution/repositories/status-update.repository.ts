import { Injectable } from "@nestjs/common";
import type { StatusUpdateDTO, ProjectStatus, ProjectHealth } from "@epm/shared";
import { BaseRepository } from "../../../foundation/db/base-repository.js";
import type { PrismaService } from "../../../foundation/db/prisma.service.js";

@Injectable()
export class StatusUpdateRepository extends BaseRepository {
  readonly schema = "execution" as const;

  constructor(prisma: PrismaService) {
    super(prisma);
  }

  /** Append-only insert — never update or delete. */
  async append(data: {
    projectId: string;
    status: ProjectStatus;
    health: ProjectHealth;
    note?: string | null;
    recordedBy: string;
  }): Promise<StatusUpdateDTO> {
    const row = await this.prisma.statusUpdate.create({
      data: {
        projectId: data.projectId,
        status: data.status,
        health: data.health,
        note: data.note ?? null,
        recordedBy: data.recordedBy,
      },
    });
    return toDTO(row);
  }

  async findByProject(projectId: string): Promise<StatusUpdateDTO[]> {
    const rows = await this.prisma.statusUpdate.findMany({
      where: { projectId },
      orderBy: { recordedAt: "desc" },
    });
    return rows.map(toDTO);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toDTO(row: {
  id: string;
  projectId: string;
  status: string;
  health: string;
  note: string | null;
  recordedBy: string;
  recordedAt: Date;
}): StatusUpdateDTO {
  return {
    id: row.id,
    projectId: row.projectId,
    status: row.status as ProjectStatus,
    health: row.health as ProjectHealth,
    note: row.note,
    recordedBy: row.recordedBy,
    recordedAt: row.recordedAt.toISOString(),
  };
}
