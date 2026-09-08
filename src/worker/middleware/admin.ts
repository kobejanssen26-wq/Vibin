import type { MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import { eq } from "drizzle-orm";
import { ADMIN_CSRF_COOKIE, ADMIN_CSRF_HEADER } from "@shared/constants";
import type { Env, Vars } from "../env";
import { createDb } from "../db/client";
import { users } from "../db/schema";
import { forbidden, unauthorized } from "../lib/errors";
import { resolveAdminSession } from "../lib/admin-session";

type Ctx = { Bindings: Env; Variables: Vars };

/**
 * Resolve the Owner Command Center session (if any) onto the context and run a
 * double-submit CSRF check for mutating admin requests. Never throws for a
 * missing session — the gates below decide access.
 */
export const withAdminSession: MiddlewareHandler<Ctx> = async (c, next) => {
  c.set("adminUserId", null);
  c.set("adminSessionId", null);

  const session = await resolveAdminSession(c);
  if (session) {
    c.set("adminUserId", session.userId);
    c.set("adminSessionId", session.hash);

    const method = c.req.method.toUpperCase();
    if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
      const header = c.req.header(ADMIN_CSRF_HEADER);
      const cookie = getCookie(c, ADMIN_CSRF_COOKIE);
      if (!header || !cookie || header !== cookie) {
        throw forbidden("Invalid or missing admin CSRF token. Reload and retry.");
      }
    }
  }
  await next();
};

/**
 * Full Owner Command Center gate. Requires:
 *  - a live admin session
 *  - the MFA step completed on that session
 *  - the account still has role='owner' and status='active'
 * Enforced independently on every request — not derived from the URL or the UI.
 */
export function requireOwner(): MiddlewareHandler<Ctx> {
  return async (c, next) => {
    const adminUserId = c.get("adminUserId");
    const adminSessionId = c.get("adminSessionId");
    if (!adminUserId || !adminSessionId) throw unauthorized("Admin sign-in required.");

    const session = await resolveAdminSession(c);
    if (!session || session.hash !== adminSessionId) {
      throw unauthorized("Admin session is no longer valid.");
    }
    if (!session.mfaVerifiedAt) {
      throw forbidden("Two-factor verification required.");
    }

    const db = createDb(c.env);
    const user = await db.query.users.findFirst({
      where: eq(users.id, adminUserId),
      columns: { role: true, status: true },
    });
    if (user?.role !== "owner" || user.status !== "active") {
      throw forbidden("Owner access required.");
    }
    await next();
  };
}

/**
 * Gate for the MFA step only: a live admin session whose account is a valid
 * owner, but MFA not yet completed on it.
 */
export function requirePendingAdmin(): MiddlewareHandler<Ctx> {
  return async (c, next) => {
    const adminUserId = c.get("adminUserId");
    if (!adminUserId) throw unauthorized("Admin sign-in required.");
    const db = createDb(c.env);
    const user = await db.query.users.findFirst({
      where: eq(users.id, adminUserId),
      columns: { role: true, status: true },
    });
    if (user?.role !== "owner" || user.status !== "active") {
      throw forbidden("Owner access required.");
    }
    await next();
  };
}
