import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { api, setUnauthorizedHandler } from "./api";
import type { Me } from "@shared/types";

interface AuthState {
  user: Me | null;
  loading: boolean;
  signup: (input: {
    email: string;
    password: string;
    displayName: string;
  }) => Promise<void>;
  login: (input: { email: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  setUser: (u: Me) => void;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const { user } = await api<{ user: Me | null }>("/auth/session");
      setUser(user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // A 401 on any authed request (expired / revoked session) drops the user, so
  // protected routes redirect to /login instead of getting stuck on an error.
  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
    return () => setUnauthorizedHandler(null);
  }, []);

  const signup: AuthState["signup"] = async (input) => {
    const { user } = await api<{ user: Me }>("/auth/signup", {
      method: "POST",
      body: input,
    });
    setUser(user);
  };

  const login: AuthState["login"] = async (input) => {
    const { user } = await api<{ user: Me }>("/auth/login", {
      method: "POST",
      body: input,
    });
    setUser(user);
  };

  const logout: AuthState["logout"] = async () => {
    await api("/auth/logout", { method: "POST" });
    setUser(null);
  };

  return (
    <Ctx.Provider
      value={{ user, loading, signup, login, logout, refresh, setUser }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
