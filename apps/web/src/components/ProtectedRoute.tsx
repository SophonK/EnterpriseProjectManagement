import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../lib/auth";

/** Gate for authenticated areas. Optimistic — renders until a 401 flips auth off, then
 *  redirects to /login (the httpOnly session cookie can't be inspected up front). */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthed } = useAuth();
  if (!isAuthed) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
