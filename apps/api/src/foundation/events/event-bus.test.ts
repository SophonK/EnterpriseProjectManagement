import { describe, it, expect, vi } from "vitest";
import type { DomainEvent } from "@epm/shared";
import { InProcessEventBus } from "./event-bus.js";

const noopLogger = { error: vi.fn() } as unknown as Parameters<
  typeof InProcessEventBus.prototype.constructor
>[0];

function evt(eventType: string): DomainEvent {
  return { eventId: "e1", eventType, occurredAt: new Date(0).toISOString(), source: "t", data: {} };
}

describe("InProcessEventBus", () => {
  it("delivers an event to all subscribers of its type", async () => {
    const bus = new InProcessEventBus(noopLogger);
    const seen: string[] = [];
    bus.subscribe("a.b.c", async () => void seen.push("h1"));
    bus.subscribe("a.b.c", async () => void seen.push("h2"));
    bus.subscribe("x.y.z", async () => void seen.push("other"));

    await bus.publish(evt("a.b.c"));

    expect(seen).toEqual(["h1", "h2"]);
  });

  it("isolates a throwing handler so siblings still run", async () => {
    const logger = { error: vi.fn() };
    const bus = new InProcessEventBus(logger as never);
    const seen: string[] = [];
    bus.subscribe("a.b.c", async () => {
      throw new Error("boom");
    });
    bus.subscribe("a.b.c", async () => void seen.push("ran"));

    await bus.publish(evt("a.b.c"));

    expect(seen).toEqual(["ran"]);
    expect(logger.error).toHaveBeenCalledOnce();
  });

  it("rejects invalid event types on publish and subscribe", async () => {
    const bus = new InProcessEventBus(noopLogger);
    expect(() => bus.subscribe("not-valid", async () => {})).toThrow();
    await expect(bus.publish(evt("not-valid"))).rejects.toThrow();
  });
});
