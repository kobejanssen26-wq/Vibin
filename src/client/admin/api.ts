import { ADMIN_CSRF_COOKIE, ADMIN_CSRF_HEADER } from "@shared/constants";
import type { ApiError } from "@shared/types";

/**
 * API client for the Owner Command Center. Talks only to `/api/admin/*`,
 * carries the dedicated admin CSRF header, and never touches the normal-user
 * session. A 401 means "admin sign-in required" and is surfaced so the shell
 * can bounce to the login flow.
 */
export class AdminApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

function adminCsrf(): string {
  const m = document.cookie.match(
    new RegExp(`(?:^|; )${ADMIN_CSRF_COOKIE}=([^;]*)`),
  );
  return m ? decodeURIComponent(m[1]!) : "";
}

/**
 * Fired when an admin request returns 401 (the 12h admin session expired or was
 * revoked mid-use). AdminAuthProvider registers a handler that re-runs
 * /auth/session, which drops the shell back to the login/MFA stage. Not fired
 * for /auth/* calls — those own their error handling.
 */
let onAdminUnauthorized: (() => void) | null = null;
export function setAdminUnauthorizedHandler(fn: (() => void) | null): void {
  onAdminUnauthorized = fn;
}

type Options = Omit<RequestInit, "body"> & { body?: unknown };

export async function adminApi<T>(path: string, opts: Options = {}): Promise<T> {
  const method = (opts.method ?? "GET").toUpperCase();
  const headers = new Headers(opts.headers);
  let body: BodyInit | undefined;

  if (opts.body !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(opts.body);
  }
  if (method !== "GET" && method !== "HEAD") {
    headers.set(ADMIN_CSRF_HEADER, adminCsrf());
  }

  const res = await fetch(`/api/admin${path}`, {
    ...opts,
    method,
    headers,
    body,
    credentials: "same-origin",
  });

  if (res.status === 204) return undefined as T;

  const isJson = res.headers
    .get("content-type")
    ?.includes("application/json");
  const payload = isJson ? await res.json() : await res.text();

  if (!res.ok) {
    if (res.status === 401 && !path.startsWith("/auth/")) onAdminUnauthorized?.();
    const err = (isJson ? payload : { message: payload }) as ApiError;
    throw new AdminApiError(
      res.status,
      err.error ?? "error",
      err.message ?? "Request failed.",
      err.details,
    );
  }
  return payload as T;
}

/** Shorthand for the command-center data API (`/api/admin/cc/*`). */
export const cc = <T>(path: string, opts?: Options) =>
  adminApi<T>(`/cc${path}`, opts);
