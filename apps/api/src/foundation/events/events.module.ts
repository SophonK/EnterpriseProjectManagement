import { Global, Module } from "@nestjs/common";
import { EVENT_BUS, InProcessEventBus } from "./event-bus.js";
import { OutboxWriter, OutboxRelay } from "./outbox.js";
import { PrismaIdempotencyLedger } from "./idempotency.js";

/** Global events module — in-process EventBus, transactional outbox, relay, idempotency. */
@Global()
@Module({
  providers: [
    InProcessEventBus,
    { provide: EVENT_BUS, useExisting: InProcessEventBus },
    OutboxWriter,
    OutboxRelay,
    PrismaIdempotencyLedger,
  ],
  exports: [InProcessEventBus, EVENT_BUS, OutboxWriter, OutboxRelay, PrismaIdempotencyLedger],
})
export class EventsModule {}
