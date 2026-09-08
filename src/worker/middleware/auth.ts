import type { MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import {
  CSRF_HEADER,
  SESSION_COOKIE,
} from "@shared/constants";
import type { Env, Vars } from "../env";
import { forbidden, unauthorized } from "../lib/errors";
import { getSession } from "../lib/session";

type Ctx = { Bindings: Env; Variables: Vars };

/** Resolve the session (if any) and stash userId/sessionId on the context. */
export const withSession: MiddlewareHandler<Ctx> = async (c, next) => {
  c.set("userId", null);
  c.set("sessionId", null);

  // The Owner Command Center has its own session + CSRF scheme
  // (vibin_admin / x-vibin-admin-csrf). Don't let a normal-user vibin_session
  // that the owner also happens to hold trip the app CSRF check on
  // /api/admin/* — those routes never read the normal session anyway.
  if (new URL(c.req.url).pathname.startsWith("/api/admin/")) {
    return next();
  }

  const sid = getCookie(c, SESSION_COOKIE);
  if (sid) {
    const session = await getSession(c.env, sid);
    if (session) {
      c.set("userId", session.userId);
      c.set("sessionId", sid);
      // Double-submit CSRF check for mutating requests.
      const method = c.req.method.toUpperCase();
      if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
        const header = c.req.header(CSRF_HEADER);
        if (!header || header !== session.csrf) {
          throw forbidden("Invalid or missing CSRF token. Refresh and retry.");
        }
      }
    }
  }
  await next();
};

/** Gate: 401 unless authenticated. */
export const requireAuth: MiddlewareHandler<Ctx> = async (c, next) => {
  if (!c.get("userId")) throw unauthorized();
  await next();
};

/*
 * Owner Command Center authorization moved to middleware/admin.ts
 * (`requireOwner`) — it uses a separate MFA-verified admin session, not the
 * normal app session, so holding `vibin_session` never grants admin access.
 */
