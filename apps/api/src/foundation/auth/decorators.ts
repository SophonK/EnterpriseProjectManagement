import { SetMetadata, type CustomDecorator } from "@nestjs/common";
import type { Permission } from "@epm/shared";

export const PERMISSION_KEY = "epm:permission";
export const PUBLIC_KEY = "epm:public";

/** Declare the permission a route requires. Enforced by AuthGuard (deny-by-default). */
export const RequirePermission = (permission: Permission): CustomDecorator =>
  SetMetadata(PERMISSION_KEY, permission);

/** Mark a route as public (skips authentication + authorization). */
export const Public = (): CustomDecorator => SetMetadata(PUBLIC_KEY, true);
