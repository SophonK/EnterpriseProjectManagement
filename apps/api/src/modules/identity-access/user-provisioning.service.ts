import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import {
  AUTH_LOGIN_SUCCEEDED,
  type DomainEvent,
  type LoginSucceededData,
} from "@epm/shared";
import { InProcessEventBus } from "../../foundation/events/event-bus.js";
import { PrismaIdempotencyLedger, makeIdempotent } from "../../foundation/events/idempotency.js";
import { LOGGER, type AppLogger } from "../../foundation/logging/logger.js";
import { IdentityRepository } from "./identity.repository.js";

/** JIT-provisions a user on first successful SSO login (US-001), idempotently. */
@Injectable()
export class UserProvisioningService implements OnModuleInit {
  constructor(
    private readonly repo: IdentityRepository,
    private readonly bus: InProcessEventBus,
    private readonly ledger: PrismaIdempotencyLedger,
    @Inject(LOGGER) private readonly logger: AppLogger,
  ) {}

  onModuleInit(): void {
    const handler = makeIdempotent<LoginSucceededData>(
      "identity.provisioning",
      this.ledger,
      (event) => this.provision(event),
    );
    this.bus.subscribe(AUTH_LOGIN_SUCCEEDED, handler);
  }

  private async provision(event: DomainEvent<LoginSucceededData>): Promise<void> {
    await this.repo.upsertUserBySubject({
      subject: event.data.subject,
      email: event.data.email,
      name: event.data.name,
    });
    this.logger.info({ subject: event.data.subject }, "user provisioned from login");
  }
}
