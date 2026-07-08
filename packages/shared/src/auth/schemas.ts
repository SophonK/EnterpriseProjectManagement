// @epm/shared — Zod schemas for auth types (used for validation + PBT arbitraries).
import { z } from "zod";
import { ROLES, SCOPE_TYPES } from "./roles.js";

export const roleSchema = z.enum(ROLES);

export const permissionSchema = z
  .string()
  .regex(/^[a-z0-9-]+:[a-z0-9-]+$/, "permission must be '[domain]:[action]'");

export const recordScopeSchema = z
  .object({
    type: z.enum(SCOPE_TYPES),
    ids: z.array(z.string().uuid()).optional(),
    subtreeRootId: z.string().uuid().optional(),
  })
  .refine((s) => s.ids !== undefined || s.subtreeRootId !== undefined, {
    message: "a record scope must specify ids or subtreeRootId",
  });

export const authContextSchema = z.object({
  userId: z.string().uuid(),
  roles: z.array(roleSchema),
  recordScopes: z.array(recordScopeSchema),
});

export const scopedRefSchema = z.object({
  type: z.enum(SCOPE_TYPES),
  id: z.string().uuid(),
  ancestorIds: z.array(z.string().uuid()).optional(),
});
