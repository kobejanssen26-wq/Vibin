import type { Context } from "hono";
import { setCookie, deleteCookie } from "hono/cookie";
import {
  CSRF_COOKIE,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
} from "@shared/constants";
import type { Env, Vars } from "../env";

type Ctx = Context<{ Bindings: Env; Variables: Vars }>;

function secure(env: Env): boolean {
  return env.APP_ENV !== "development";
}

export function setSessionCookie(c: Ctx, sessionId: string) {
  setCookie(c, SESSION_COOKIE, sessionId, {
    httpOnly: true,
    secure: secure(c.env),
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function clearSessionCookie(c: Ctx) {
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  deleteCookie(c, CSRF_COOKIE, { path: "/" });
}

/**
 * CSRF: double-submit cookie. The token is readable by JS (not httpOnly) so the
 * client echoes it in the X-Vibin-CSRF header on every mutating request; the
 * server checks header === cookie. Combined with SameSite=Lax on the session
 * cookie this blocks cross-site form posts.
 */
export function setCsrfCookie(c: Ctx, token: string) {
  setCookie(c, CSRF_COOKIE, token, {
    httpOnly: false,
    secure: secure(c.env),
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function newCsrfToken(): string {
  return crypto.randomUUID().replace(/-/g, "");
}
