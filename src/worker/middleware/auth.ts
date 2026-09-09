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

/** `Authorization: Bearer <token>` — the token is the KV session id. */
function bearer(c: { req: { header: (n: string) => string | undefined } }) {
  const h = c.req.header("authorization");
  if (!h) return null;
  const m = /^Bearer\s+([A-Za-z0-9._-]+)$/i.exec(h.trim());
  return m ? m[1]! : null;
}

/**
 * Resolve the session (if any) and stash userId/sessionId on the context.
 * The session id comes from the `vibin_session` cookie (web) or an
 * `Authorization: Bearer` header (native apps). Cookie-backed mutating requests
 * still get the double-submit CSRF check; bearer-backed requests skip it — the
 * token is not an ambient credential and can't be attached cross-site.
 */
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

  const cookieSid = getCookie(c, SESSION_COOKIE);
  const bearerSid = cookieSid ? null : bearer(c);
  const sid = cookieSid ?? bearerSid;
  if (sid) {
    const session = await getSession(c.env, sid);
    if (session) {
      c.set("userId", session.userId);
      c.set("sessionId", sid);
      // Double-submit CSRF check — only for cookie (ambient) credentials.
      const method = c.req.method.toUpperCase();
      if (
        !bearerSid &&
        method !== "GET" &&
        method !== "HEAD" &&
        method !== "OPTIONS"
      ) {
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
