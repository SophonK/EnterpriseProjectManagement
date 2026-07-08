import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../db/prisma.service.js";

export type AuditAction = "create" | "update" | "delete" | "access_denied";

export interface AuditInput {
  actorId?: string;
  action: AuditAction;
  entityType: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
  requestId: string;
}

/**
 * Appends immutable audit entries (SEC-3). Pass a transaction client to capture the
 * audit row atomically with a state change (unit services do this within their tx).
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: AuditInput, tx?: Prisma.TransactionClient): Promise<void> {
    const client = tx ?? this.prisma;
    await client.auditLog.create({
      data: {
        actorId: input.actorId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        requestId: input.requestId,
        ...(input.before !== undefined
          ? { before: input.before as Prisma.InputJsonValue }
          : {}),
        ...(input.after !== undefined ? { after: input.after as Prisma.InputJsonValue } : {}),
      },
    });
  }
}
