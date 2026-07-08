// @epm/shared — identity-access domain DTOs.
import type { Role } from "../auth/roles.js";

export interface UserDTO {
  id: string;
  subject: string;
  email: string | null;
  displayName: string | null;
  status: string;
  roles: Role[];
  createdAt: string; // ISO 8601 UTC
}
