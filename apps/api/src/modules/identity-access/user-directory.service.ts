import { Injectable } from "@nestjs/common";
import type { RecordScope, Role } from "@epm/shared";
import { IdentityRepository } from "./identity.repository.js";
import { toRecordScopes } from "./logic.js";

/** Resolves a user's authorization data (roles + scopes) from the `identity` DB. */
@Injectable()
export class UserDirectoryService {
  constructor(private readonly repo: IdentityRepository) {}

  resolveRoles(userId: string): Promise<Role[]> {
    return this.repo.rolesOf(userId);
  }

  async resolveScopes(userId: string): Promise<RecordScope[]> {
    const rows = await this.repo.scopesOf(userId);
    return toRecordScopes(rows);
  }
}
