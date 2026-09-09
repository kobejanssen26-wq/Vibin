import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { adminApi, setAdminUnauthorizedHandler } from "./api";

export interface AdminUser {
  id: string;
  email: string;
  displayName: string;
  role: string;
}

/**
 * stage:
 *   loading  — still fetching /session
 *   setup    — no owner exists yet; run first-time setup
 *   login    — no admin session; needs password
 *   mfa      — password done; needs a TOTP / recovery code
 *   enroll   — password done; owner has no confirmed authenticator
 *   ready    — fully authenticated into the command center
 */
export type AdminStage = "loading" | "setup" | "login" | "mfa" | "enroll" | "ready";

interface AdminAuthState {
  stage: AdminStage;
  user: AdminUser | null;
  sessionExpiresAt: number | null;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AdminAuthState | null>(null);

interface SessionResponse {
  user: AdminUser | null;
  stage: "none" | "mfa" | "enroll" | "ready";
  setupComplete: boolean;
  sessionExpiresAt?: number | null;
}

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [stage, setStage] = useState<AdminStage>("loading");
  const [user, setUser] = useState<AdminUser | null>(null);
  const [sessionExpiresAt, setExpires] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const s = await adminApi<SessionResponse>("/auth/session");
      setUser(s.user);
      setExpires(s.sessionExpiresAt ?? null);
      if (!s.setupComplete) setStage("setup");
      else if (s.stage === "none") setStage("login");
      else setStage(s.stage);
    } catch {
      setUser(null);
      setStage("login");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // A 401 mid-session (expired / revoked) re-checks the session, which drops the
  // shell back to the login or MFA stage instead of leaving a dead page.
  useEffect(() => {
    setAdminUnauthorizedHandler(() => {
      void refresh();
    });
    return () => setAdminUnauthorizedHandler(null);
  }, [refresh]);

  const logout = useCallback(async () => {
    await adminApi("/auth/logout", { method: "POST" }).catch(() => {});
    setUser(null);
    setExpires(null);
    setStage("login");
  }, []);

  return (
    <Ctx.Provider value={{ stage, user, sessionExpiresAt, refresh, logout }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAdminAuth(): AdminAuthState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAdminAuth outside <AdminAuthProvider>");
  return ctx;
}
