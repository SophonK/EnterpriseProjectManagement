import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { DomainEvent } from "@epm/shared";
import { PrismaService } from "../db/prisma.service.js";
import type { EventHandler } from "./event-bus.js";

/**
 * Idempotency ledger. `markIfNew` atomically claims (eventId, handler) and returns
 * true only the FIRST time — subsequent calls return false. This gives at-most-once
 * handler execution under at-least-once delivery (property P4).
 */
export interface IdempotencyLedger {
  markIfNew(eventId: string, handler: string): Promise<boolean>;
}

/** In-memory ledger — used by unit/property tests and single-process scenarios. */
export class InMemoryIdempotencyLedger implements IdempotencyLedger {
  private readonly seen = new Set<string>();

  async markIfNew(eventId: string, handler: string): Promise<boolean> {
    const key = `${eventId}::${handler}`;
    if (this.seen.has(key)) return false;
    this.seen.add(key);
    return true;
  }
}

/** Durable ledger backed by the `shared.processed_events` table. */
@Injectable()
export class PrismaIdempotencyLedger implements IdempotencyLedger {
  constructor(private readonly prisma: PrismaService) {}

  async markIfNew(eventId: string, handler: string): Promise<boolean> {
    try {
      await this.prisma.processedEvent.create({ data: { eventId, handler } });
      return true;
    } catch (err) {
      // Unique-constraint violation ⇒ already processed.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return false;
      }
      throw err;
    }
  }
}

/**
 * Wrap a handler so it runs at most once per (eventId, handlerName). Duplicate
 * deliveries are skipped after the ledger claim.
 */
export function makeIdempotent<T>(
  handlerName: string,
  ledger: IdempotencyLedger,
  handler: EventHandler<T>,
): EventHandler<T> {
  return async (event: DomainEvent<T>): Promise<void> => {
    const isNew = await ledger.markIfNew(event.eventId, handlerName);
    if (!isNew) return;
    await handler(event);
  };
}
