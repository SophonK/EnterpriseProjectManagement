import { Controller, Get, Res } from "@nestjs/common";
import type { Response } from "express";
import { PrismaService } from "../db/prisma.service.js";
import { Public } from "../auth/decorators.js";

const VERSION = process.env.APP_VERSION ?? "0.1.0";

/**
 * Liveness + readiness. Readiness reflects DB connectivity; a failing readiness
 * blocks rolling-deploy promotion and can trigger rollback (REL-1 / AVL-1).
 */
@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  async health(@Res() res: Response): Promise<void> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      res.status(200).json({ status: "ok", db: "up", version: VERSION });
    } catch {
      res.status(503).json({ status: "degraded", db: "down", version: VERSION });
    }
  }
}
