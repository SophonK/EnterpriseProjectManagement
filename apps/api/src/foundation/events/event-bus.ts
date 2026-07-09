import { Inject, Injectable } from "@nestjs/common";
import { AppError, isValidEventType, type DomainEvent } from "@epm/shared";
import { LOGGER, type AppLogger } from "../logging/logger.js";

export type EventHandler<T = unknown> = (event: DomainEvent<T>) => Promise<void>;

/** Publish/subscribe contract. In-process for the monolith; broker-swappable later. */
export interface EventBus {
  /** Lenient delivery: one handler's failure is isolated (logged) and never propagates.
   *  Use for fire-and-forget events where sibling handlers must not be blocked. */
  publish<T>(event: DomainEvent<T>): Promise<void>;
  /** Strict delivery: runs all handlers, then RE-THROWS the first failure. Use when the
   *  publisher must know delivery failed — e.g. an in-transaction promote that must roll
   *  back (and stay retryable) instead of orphaning state (C2). Handlers stay idempotent. */
  dispatch<T>(event: DomainEvent<T>): Promise<void>;
  subscribe<T>(eventType: string, handler: EventHandler<T>): void;
}

/**
 * In-process event bus. Handlers are invoked sequentially; one handler's failure
 * is isolated (logged) so it cannot block sibling handlers. Delivery is
 * at-least-once — handlers must be idempotent (see idempotency.ts, property P4).
 */
@Injectable()
export class InProcessEventBus implements EventBus {
  private readonly handlers = new Map<string, EventHandler[]>();

  constructor(@Inject(LOGGER) private readonly logger: AppLogger) {}

  subscribe<T>(eventType: string, handler: EventHandler<T>): void {
    if (!isValidEventType(eventType)) {
      throw AppError.validation(`invalid event type for subscription: ${eventType}`);
    }
    const list = this.handlers.get(eventType) ?? [];
    list.push(handler as EventHandler);
    this.handlers.set(eventType, list);
  }

  async publish<T>(event: DomainEvent<T>): Promise<void> {
    if (!isValidEventType(event.eventType)) {
      throw AppError.validation(`invalid event type: ${event.eventType}`);
    }
    const list = this.handlers.get(event.eventType) ?? [];
    for (const handler of list) {
      try {
        await handler(event);
      } catch (err) {
        this.logger.error(
          { err, eventId: event.eventId, eventType: event.eventType },
          "event handler failed",
        );
      }
    }
  }

  async dispatch<T>(event: DomainEvent<T>): Promise<void> {
    if (!isValidEventType(event.eventType)) {
      throw AppError.validation(`invalid event type: ${event.eventType}`);
    }
    const list = this.handlers.get(event.eventType) ?? [];
    let firstError: unknown;
    for (const handler of list) {
      try {
        await handler(event);
      } catch (err) {
        this.logger.error(
          { err, eventId: event.eventId, eventType: event.eventType },
          "event handler failed (dispatch)",
        );
        if (firstError === undefined) firstError = err;
      }
    }
    if (firstError !== undefined) throw firstError;
  }
}

/** DI token for the EventBus. */
export const EVENT_BUS = Symbol("EVENT_BUS");
