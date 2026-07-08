// @epm/shared — the cross-unit domain event envelope.

/**
 * DomainEvent envelope. Event names follow `[unit].[entity].[action]`,
 * e.g. "project-execution.status.changed".
 */
export interface DomainEvent<T = unknown> {
  readonly eventId: string;
  readonly eventType: string;
  /** ISO 8601 UTC timestamp. */
  readonly occurredAt: string;
  /** Publishing unit name, e.g. "project-execution". */
  readonly source: string;
  readonly data: T;
}

/** Regex for `[unit].[entity].[action]` event type names. */
export const EVENT_TYPE_PATTERN = /^[a-z0-9-]+\.[a-z0-9-]+\.[a-z0-9-]+$/;

export function isValidEventType(eventType: string): boolean {
  return EVENT_TYPE_PATTERN.test(eventType);
}
