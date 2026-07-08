import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { serializeEvent, deserializeEvent } from "./serialization.js";
import type { DomainEvent } from "./domain-event.js";

// Arbitrary that always produces a VALID DomainEvent (matches EVENT_TYPE_PATTERN, JSON-safe data).
const segment = fc.constantFrom(
  "project-execution",
  "risk-raid",
  "demand-intake",
  "status",
  "risk",
  "demand",
  "changed",
  "escalated",
  "promoted",
  "a1",
  "b-2",
);

const domainEventArb: fc.Arbitrary<DomainEvent<unknown>> = fc.record({
  eventId: fc.uuid(),
  eventType: fc.tuple(segment, segment, segment).map(([a, b, c]) => `${a}.${b}.${c}`),
  occurredAt: fc.date({ noInvalidDate: true }).map((d) => d.toISOString()),
  source: segment,
  data: fc.jsonValue(),
});

describe("DomainEvent serialization (PBT — property P1)", () => {
  // P1: an event serialized → transported → deserialized → re-serialized yields identical bytes.
  // (String-level stability is the real transport guarantee; JSON normalizes -0→0, NaN→null, etc.,
  //  so structural Object.is equality is not the right invariant for a JSON envelope.)
  it("round-trips: re-serializing the restored event yields identical JSON", () => {
    fc.assert(
      fc.property(domainEventArb, (event) => {
        const serialized = serializeEvent(event);
        const restored = deserializeEvent(serialized);
        expect(serializeEvent(restored)).toBe(serialized);
      }),
    );
  });

  it("restored event deep-equals the JSON-normalized original", () => {
    fc.assert(
      fc.property(domainEventArb, (event) => {
        const normalized = JSON.parse(serializeEvent(event));
        const restored = deserializeEvent(serializeEvent(event));
        expect(restored).toEqual(normalized);
      }),
    );
  });

  it("rejects non-JSON input", () => {
    expect(() => deserializeEvent("{not json")).toThrow();
  });

  it("rejects a well-formed JSON that is not a DomainEvent", () => {
    expect(() => deserializeEvent(JSON.stringify({ foo: "bar" }))).toThrow();
  });

  it("rejects an event with an invalid eventType", () => {
    const bad = JSON.stringify({
      eventId: "id",
      eventType: "not-three-segments",
      occurredAt: new Date(0).toISOString(),
      source: "x",
      data: {},
    });
    expect(() => deserializeEvent(bad)).toThrow();
  });
});
