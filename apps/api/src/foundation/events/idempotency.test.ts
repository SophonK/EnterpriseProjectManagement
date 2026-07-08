import { describe, it, expect } from "vitest";
import fc from "fast-check";
import type { DomainEvent } from "@epm/shared";
import { InMemoryIdempotencyLedger, makeIdempotent } from "./idempotency.js";

function evt(eventId: string): DomainEvent {
  return {
    eventId,
    eventType: "project-execution.status.changed",
    occurredAt: new Date(0).toISOString(),
    source: "test",
    data: {},
  };
}

// A small id pool guarantees duplicate deliveries in generated sequences.
const idPool = ["id-1", "id-2", "id-3", "id-4", "id-5"];
const deliverySeq = fc.array(fc.constantFrom(...idPool), { maxLength: 40 });

describe("Idempotent delivery (PBT — property P4)", () => {
  it("runs the handler's effect at most once per (eventId, handler)", async () => {
    await fc.assert(
      fc.asyncProperty(deliverySeq, async (ids) => {
        const ledger = new InMemoryIdempotencyLedger();
        const effects: string[] = [];
        const handler = makeIdempotent("h", ledger, async (e) => {
          effects.push(e.eventId);
        });

        for (const id of ids) {
          await handler(evt(id));
        }

        const distinct = new Set(ids);
        // Effect fired exactly once for each distinct event, never for duplicates.
        expect(effects.length).toBe(distinct.size);
        expect(new Set(effects)).toEqual(distinct);
      }),
    );
  });

  it("tracks idempotency independently per handler name", async () => {
    const ledger = new InMemoryIdempotencyLedger();
    let a = 0;
    let b = 0;
    const hA = makeIdempotent("A", ledger, async () => void a++);
    const hB = makeIdempotent("B", ledger, async () => void b++);
    const e = evt("same-id");

    await hA(e);
    await hA(e); // duplicate for A → skipped
    await hB(e); // different handler → runs once

    expect(a).toBe(1);
    expect(b).toBe(1);
  });
});
