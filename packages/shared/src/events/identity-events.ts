// @epm/shared — event contracts around identity (published by foundation + identity-access).

/** Published by the foundation OIDC callback; consumed by identity-access for JIT provisioning. */
export const AUTH_LOGIN_SUCCEEDED = "auth.login.succeeded";
export interface LoginSucceededData {
  subject: string;
  email: string | null;
  name: string | null;
}

/** Published by identity-access admin operations. */
export const IDENTITY_ROLE_ASSIGNED = "identity.role.assigned";
export const IDENTITY_SCOPE_GRANTED = "identity.scope.granted";

export interface RoleAssignedData {
  userId: string;
  role: string;
}
export interface ScopeGrantedData {
  userId: string;
  scopeId: string;
}
