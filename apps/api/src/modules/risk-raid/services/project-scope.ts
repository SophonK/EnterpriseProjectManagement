import type { AuthContext } from "@epm/shared";
import type { ProjectService } from "../../project-execution/services/project.service.js";

/**
 * Resolve the caller's accessible project ids from project-execution (the source of
 * truth). Director/unrestricted callers ⇒ `null` (no project filter); everyone else is
 * restricted to the projects `listProjects` returns under their scope.
 *
 * Shared by RaidItemService (write/read scoping) and RaidQueryService (reporting read
 * side) so both units apply the identical record-scope resolution — a single place to
 * keep the fail-closed semantics correct.
 *
 * Pagination note: listProjects caps pageSize at 100, so we loop pages until we have
 * every accessible id. For callers whose scope spans an unusually large number of
 * projects this issues several queries, but it is correct and fail-closed (a missed
 * page can only narrow, never widen, access).
 */
export async function resolveAccessibleProjectIds(
  projectService: ProjectService,
  ctx: AuthContext,
): Promise<string[] | null> {
  if (ctx.roles.includes("EPMO_DIRECTOR")) return null;
  const pageSize = 100;
  const ids: string[] = [];
  for (let page = 1; ; page++) {
    const result = await projectService.listProjects({ page, pageSize }, ctx);
    for (const p of result.data) ids.push(p.id);
    if (page * pageSize >= result.total || result.data.length === 0) break;
  }
  return ids;
}
