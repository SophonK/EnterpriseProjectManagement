import { Injectable } from "@nestjs/common";
import type { StatusUpdateDTO, ProjectStatus, ProjectHealth } from "@epm/shared";
import { BaseRepository } from "../../../foundation/db/base-repository.js";
import { PrismaService } from "../../../foundation/db/prisma.service.js";

@Injectable()
export class StatusUpdateRepository extends BaseRepository {
  readonly schema = "execution" as const;

  constructor(prisma: PrismaService) {
    super(prisma);
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
