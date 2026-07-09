import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { UNAUTHORIZED_EVENT } from "./api-client";

interface AuthState {
  /** Optimistic: true until a 401 proves the session is gone. httpOnly cookies can't be read,
   *  so we can't know for sure up front — protected pages render and bounce to /login on 401. */
  isAuthed: boolean;
  /** Kick off the OIDC redirect flow via the backend (proxied). */
  login: () => void;
  /** Clear the session cookies and return to the login screen. */
  logout: () => Promise<void>;
  /** Called internally when a request 401s. */
  markUnauthed: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthed, setIsAuthed] = useState(true);

  useEffect(() => {
    const onUnauthorized = () => setIsAuthed(false);
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      isAuthed,
      login: () => {
        // Full-page navigate so the browser follows the IdP redirect chain and receives
        // the Set-Cookie from /auth/callback. Returns to "/" on success.
        window.location.href = "/auth/login";
      },
      logout: async () => {
        try {
          await fetch("/auth/logout", { method: "POST", credentials: "include" });
        } finally {
          setIsAuthed(false);
        }
      },
      markUnauthed: () => setIsAuthed(false),
    }),
    [isAuthed],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
