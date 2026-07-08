import { Injectable } from "@nestjs/common";
import type { Role, RecordScope } from "@epm/shared";
import type { AuthContextEnricher } from "../../foundation/auth/auth-context-enricher.js";
import { UserDirectoryService } from "./user-directory.service.js";

/**
 * Binds identity-access as the foundation AuthContextEnricher: roles/scopes come
 * from the `identity` DB (fail-closed on error), not from IdP claims (IA-SEC-1 / IA-REL-2).
 */
@Injectable()
export class IdentityAuthEnricher implements AuthContextEnricher {
  constructor(private readonly directory: UserDirectoryService) {}

  async enrich(userId: string): Promise<{ roles: Role[]; recordScopes: RecordScope[] }> {
    try {
      const [roles, recordScopes] = await Promise.all([
        this.directory.resolveRoles(userId),
        this.directory.resolveScopes(userId),
      ]);
      return { roles, recordScopes };
    } catch {
      // Fail closed — no roles/scopes ⇒ deny (never fail open).
      return { roles: [], recordScopes: [] };
    }
  }
}
