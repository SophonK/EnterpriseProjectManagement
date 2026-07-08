// @epm/shared — DomainEvent serialization. Round-trip safe (PBT property P1).
import { AppError } from "../errors/app-error.js";
import type { DomainEvent } from "./domain-event.js";
import { isValidEventType } from "./domain-event.js";

/** Serialize a DomainEvent to a canonical JSON string. */
export function serializeEvent<T>(event: DomainEvent<T>): string {
  return JSON.stringify(event);
}

/**
 * Parse and validate a serialized DomainEvent.
 * Throws AppError(VALIDATION_001) on malformed input — never returns a partial event.
 */
export function deserializeEvent<T = unknown>(raw: string): DomainEvent<T> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw AppError.validation("event payload is not valid JSON");
  }
  if (!isDomainEventShape(parsed)) {
    throw AppError.validation("event payload is not a valid DomainEvent");
  }
  return parsed as DomainEvent<T>;
}

function isDomainEventShape(value: unknown): value is DomainEvent {
  if (typeof value !== "object" || value === null) return false;
  const e = value as Record<string, unknown>;
  return (
    typeof e.eventId === "string" &&
    typeof e.eventType === "string" &&
    isValidEventType(e.eventType) &&
    typeof e.occurredAt === "string" &&
    !Number.isNaN(Date.parse(e.occurredAt)) &&
    typeof e.source === "string" &&
    "data" in e
  );
}
