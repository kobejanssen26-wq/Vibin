import type { MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import { eq } from "drizzle-orm";
import { ADMIN_CSRF_COOKIE, ADMIN_CSRF_HEADER } from "@shared/constants";
import type { Env, Vars } from "../env";
import { createDb } from "../db/client";
import { users } from "../db/schema";
import { forbidden, unauthorized } from "../lib/errors";
import { resolveAdminSession } from "../lib/admin-session";
import { allPermissions, loadPermissions, requiredFor } from "../lib/admin-rbac";
import type { AdminPermission } from "@shared/constants";

type Ctx = { Bindings: Env; Variables: Vars };

/**
 * Resolve the Owner Command Center session (if any) onto the context and run a
 * double-submit CSRF check for mutating admin requests. Never throws for a
 * missing session — the gates below decide access.
 */
export const withAdminSession: MiddlewareHandler<Ctx> = async (c, next) => {
  c.set("adminUserId", null);
  c.set("adminSessionId", null);
  c.set("adminRole", null);
  c.set("adminPerms", []);

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
    c.set("adminRole", "owner");
    c.set("adminPerms", allPermissions());
    await next();
  };
}

/**
 * Staff gate: like requireOwner() (live admin session, MFA done, account active, re-checked on
 * every request) but also lets a `developer` through. Sets `adminRole` and `adminPerms` on the
 * context; the owner holds every permission, a developer only the ones in `developer_access`.
 * Which areas a developer may touch is decided per path by ccPermissionGate().
 */
export function requireStaff(): MiddlewareHandler<Ctx> {
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
    if (!user || user.status !== "active" || (user.role !== "owner" && user.role !== "developer")) {
      throw forbidden("Admin access required.");
    }
    c.set("adminRole", user.role);
    c.set(
      "adminPerms",
      user.role === "owner" ? allPermissions() : await loadPermissions(c.env, adminUserId),
    );
    await next();
  };
}

/**
 * Path-based permission gate for the Command Center API (mounted right after requireStaff()).
 * The owner passes everything. A developer passes only the areas whose permission they hold;
 * every path that is not explicitly mapped (see lib/admin-rbac.ts) is owner-only.
 */
export function ccPermissionGate(): MiddlewareHandler<Ctx> {
  return async (c, next) => {
    if (c.get("adminRole") === "owner") return next();
    const rel = new URL(c.req.url).pathname.replace(/^\/api\/admin\/cc/, "") || "/";
    const need = requiredFor(rel);
    if (need === "owner" || !c.get("adminPerms").includes(need)) {
      throw forbidden("You don't have access to this section.");
    }
    return next();
  };
}

/** Extra per-route check, e.g. `requirePermission("files.write")` on a save endpoint. */
export function requirePermission(perm: AdminPermission): MiddlewareHandler<Ctx> {
  return async (c, next) => {
    if (c.get("adminRole") !== "owner" && !c.get("adminPerms").includes(perm)) {
      throw forbidden("You don't have permission for this action.");
    }
    return next();
  };
}

/**
 * Gate for the MFA step only: a live admin session whose account is a valid
 * staff account (owner or developer), but MFA not yet completed on it.
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
    if (!user || user.status !== "active" || (user.role !== "owner" && user.role !== "developer")) {
      throw forbidden("Admin access required.");
    }
    await next();
  };
}
