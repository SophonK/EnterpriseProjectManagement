import { Injectable, type OnModuleInit, type OnModuleDestroy } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { ConfigService } from "../config/config.service.js";

/**
 * Prisma client bound to the platform database (single DB, schema per unit).
 * Connection lifecycle is managed by Nest. Each unit repository uses this client
 * scoped to its own schema — cross-schema writes are forbidden by convention (BR1).
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(config: ConfigService) {
    super({
      datasources: { db: { url: config.get("DATABASE_URL") } },
      log: ["warn", "error"],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
