/**
 * DB-backed sessions for the Owner Command Center.
 *
 * Design:
 *  - Completely separate from the normal app session. A `vibin_session` cookie
 *    NEVER grants admin access.
 *  - The raw session id lives only in the HttpOnly `vibin_admin` cookie; the
 *    database stores only its SHA-256 hash.
 *  - A row is created at password step with `mfaVerifiedAt = null`; it only
 *    becomes usable after the TOTP / recovery-code step calls `markMfaVerified`.
 *  - A paired non-HttpOnly `vibin_admin_csrf` cookie backs a double-submit CSRF
 *    check on mutating admin requests.
 */
import type { Context } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { and, eq, lt, isNull } from "drizzle-orm";
import {
  ADMIN_CSRF_COOKIE,
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_TTL_SECONDS,
} from "@shared/constants";
import type { Env, Vars } from "../env";
import { createDb } from "../db/client";
import { adminSessions } from "../db/schema";
import { newSessionId } from "./id";
import { sha256Hex } from "./password";
import { clientIp } from "./ratelimit";

type Ctx = Context<{ Bindings: Env; Variables: Vars }>;

const nowS = () => Math.floor(Date.now() / 1000);
const isProd = (env: Env) => env.APP_ENV !== "development";

export interface LiveAdminSession {
  hash: string;
  userId: string;
  mfaVerifiedAt: number | null;
  createdAt: number;
  lastSeenAt: number;
  expiresAt: number;
}

/** Create a pending (pre-MFA) admin session and set the cookies. Returns raw id. */
export async function createAdminSession(
  c: Ctx,
  userId: string,
): Promise<{ rawId: string; csrf: string }> {
  const db = createDb(c.env);
  const rawId = newSessionId();
  const csrf = newSessionId();
  const hash = await sha256Hex(rawId);
  const created = nowS();
  await db.insert(adminSessions).values({
    id: hash,
    userId,
    mfaVerifiedAt: null,
    ip: clientIp(c.req.raw),
    userAgent: c.req.header("user-agent")?.slice(0, 300) ?? null,
    createdAt: created,
    lastSeenAt: created,
    expiresAt: created + ADMIN_SESSION_TTL_SECONDS,
  });
  setAdminCookies(c, rawId, csrf);
  return { rawId, csrf };
}

export function setAdminCookies(c: Ctx, rawId: string, csrf: string): void {
  const opts = {
    path: "/",
    secure: isProd(c.env),
    sameSite: "Lax" as const,
    maxAge: ADMIN_SESSION_TTL_SECONDS,
  };
  setCookie(c, ADMIN_SESSION_COOKIE, rawId, { ...opts, httpOnly: true });
  setCookie(c, ADMIN_CSRF_COOKIE, csrf, { ...opts, httpOnly: false });
}

export function clearAdminCookies(c: Ctx): void {
  deleteCookie(c, ADMIN_SESSION_COOKIE, { path: "/" });
  deleteCookie(c, ADMIN_CSRF_COOKIE, { path: "/" });
}

export async function markMfaVerified(env: Env, hash: string): Promise<void> {
  const db = createDb(env);
  await db
    .update(adminSessions)
    .set({ mfaVerifiedAt: nowS(), lastSeenAt: nowS() })
    .where(eq(adminSessions.id, hash));
}

/**
 * Resolve the current admin session from the cookie. Returns null when there is
 * no cookie, the row is missing, revoked or expired. Touches `lastSeenAt`.
 */
export async function resolveAdminSession(
  c: Ctx,
): Promise<LiveAdminSession | null> {
  const rawId = getCookie(c, ADMIN_SESSION_COOKIE);
  if (!rawId) return null;
  const hash = await sha256Hex(rawId);
  const db = createDb(c.env);
  const row = await db.query.adminSessions.findFirst({
    where: eq(adminSessions.id, hash),
  });
  if (!row || row.revokedAt || row.expiresAt < nowS()) return null;
  // best-effort last-seen touch
  void db
    .update(adminSessions)
    .set({ lastSeenAt: nowS() })
    .where(eq(adminSessions.id, hash))
    .catch(() => {});
  return {
    hash: row.id,
    userId: row.userId,
    mfaVerifiedAt: row.mfaVerifiedAt,
    createdAt: row.createdAt,
    lastSeenAt: row.lastSeenAt,
    expiresAt: row.expiresAt,
  };
}

export async function revokeAdminSession(env: Env, hash: string): Promise<void> {
  const db = createDb(env);
  await db
    .update(adminSessions)
    .set({ revokedAt: nowS() })
    .where(and(eq(adminSessions.id, hash), isNull(adminSessions.revokedAt)));
}

export async function revokeAllAdminSessions(
  env: Env,
  userId: string,
  exceptHash?: string,
): Promise<number> {
  const db = createDb(env);
  const open = await db.query.adminSessions.findMany({
    where: and(eq(adminSessions.userId, userId), isNull(adminSessions.revokedAt)),
    columns: { id: true },
  });
  let revoked = 0;
  for (const s of open) {
    if (exceptHash && s.id === exceptHash) continue;
    await db
      .update(adminSessions)
      .set({ revokedAt: nowS() })
      .where(eq(adminSessions.id, s.id));
    revoked++;
  }
  return revoked;
}

/** Housekeeping — delete rows that expired more than a day ago. */
export async function pruneExpiredAdminSessions(env: Env): Promise<void> {
  const db = createDb(env);
  await db
    .delete(adminSessions)
    .where(lt(adminSessions.expiresAt, nowS() - 86400));
}
