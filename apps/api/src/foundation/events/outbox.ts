import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { DomainEvent } from "@epm/shared";
import { PrismaService } from "../db/prisma.service.js";
import { LOGGER, type AppLogger } from "../logging/logger.js";
import { InProcessEventBus } from "./event-bus.js";

/**
 * Transactional outbox writer. Units call `enqueue` INSIDE the same Prisma
 * transaction as their state change, so the event is persisted atomically with
 * the write (REL-4). The relay delivers it after commit.
 */
@Injectable()
export class OutboxWriter {
  /** Persist an event in the outbox as part of an ongoing transaction. */
  async enqueue<T>(tx: Prisma.TransactionClient, event: DomainEvent<T>): Promise<void> {
    await tx.outboxEvent.create({
      data: {
        eventId: event.eventId,
        eventType: event.eventType,
        payload: event as unknown as Prisma.InputJsonValue,
        occurredAt: new Date(event.occurredAt),
      },
    });
  }
}

/**
 * Post-commit relay: reads unprocessed outbox rows, publishes them to the bus,
 * and marks them processed. Idempotent consumers (idempotency.ts) make redelivery
 * safe if a crash occurs between publish and mark.
 */
@Injectable()
export class OutboxRelay {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bus: InProcessEventBus,
    @Inject(LOGGER) private readonly logger: AppLogger,
  ) {}

  /** Deliver up to `batchSize` pending events. Returns the number delivered. */
  async relayOnce(batchSize = 100): Promise<number> {
    const pending = await this.prisma.outboxEvent.findMany({
      where: { processedAt: null },
      orderBy: { occurredAt: "asc" },
      take: batchSize,
    });

    let delivered = 0;
    for (const row of pending) {
      const event = row.payload as unknown as DomainEvent;
      try {
        await this.bus.publish(event);
        await this.prisma.outboxEvent.update({
          where: { eventId: row.eventId },
          data: { processedAt: new Date() },
        });
        delivered += 1;
      } catch (err) {
        this.logger.error({ err, eventId: row.eventId }, "outbox relay failed; will retry");
        break; // preserve ordering — retry this row on the next tick
      }
    }
    return delivered;
  }
}
