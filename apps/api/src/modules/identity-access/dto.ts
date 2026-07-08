import { z } from "zod";
import { roleSchema, recordScopeSchema } from "@epm/shared";

export const assignRoleSchema = z.object({ role: roleSchema });
export const grantScopeSchema = recordScopeSchema;
export const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(25),
});
