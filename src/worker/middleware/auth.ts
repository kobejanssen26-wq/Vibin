import type { MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import {
  CSRF_HEADER,
  SESSION_COOKIE,
} from "@shared/constants";
import type { Env, Vars } from "../env";
import { createDb } from "../db/client";
import { forbidden, unauthorized } from "../lib/errors";
import { getSession } from "../lib/session";

type Ctx = { Bindings: Env; Variables: Vars };

/** Resolve the session (if any) and stash userId/sessionId on the context. */
export const withSession: MiddlewareHandler<Ctx> = async (c, next) => {
  c.set("userId", null);
  c.set("sessionId", null);
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

/** Gate: 403 unless the authenticated user has the admin role. */
export function requireAdmin(): MiddlewareHandler<Ctx> {
  return async (c, next) => {
    const userId = c.get("userId");
    if (!userId) throw unauthorized();
    const db = createDb(c.env);
    const user = await db.query.users.findFirst({
      where: (u, { eq }) => eq(u.id, userId),
      columns: { role: true, status: true },
    });
    if (user?.role !== "admin" || user.status !== "active") {
      throw forbidden("Admin access required.");
    }
    await next();
  };
}
