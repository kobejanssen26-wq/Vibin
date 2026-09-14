/**
 * Sessions live in KV (fast, edge-local, TTL'd) — never trusted from the client.
 * Key:   session:<sessionId>
 * Value: { userId, csrf, createdAt, lastSeenAt, ua }
 *
 * Expiration is a SLIDING window keyed on activity, not a fixed lifetime from
 * login: every authenticated request within SESSION_INACTIVITY_DAYS extends
 * it (see `touchSession` + middleware/auth.ts), so "log in once, stay logged
 * in while actively using VIBIN" — only real inactivity signs the user out.
 */
import type { Env } from "../env";
import { newCsrfToken } from "./cookies";
import { newSessionId } from "./id";
import { sessionInactivitySeconds } from "./session-config";
export { sessionInactivitySeconds } from "./session-config";

export interface SessionRecord {
  userId: string;
  csrf: string;
  createdAt: number;
  lastSeenAt: number;
  ua: string;
}

const key = (id: string) => `session:${id}`;

/** Only re-extend the KV TTL / cookie at most this often, not on every single
 *  request — a day of slack is negligible against a 14-day window and keeps
 *  KV writes (and Set-Cookie churn) low. */
export const SESSION_TOUCH_THRESHOLD_SECONDS = 24 * 60 * 60;

export async function createSession(
  env: Env,
  userId: string,
  ua: string,
): Promise<{ sessionId: string; csrf: string }> {
  const sessionId = newSessionId();
  const csrf = newCsrfToken();
  const now = Math.floor(Date.now() / 1000);
  const record: SessionRecord = {
    userId,
    csrf,
    createdAt: now,
    lastSeenAt: now,
    ua: ua.slice(0, 200),
  };
  await env.KV.put(key(sessionId), JSON.stringify(record), {
    expirationTtl: sessionInactivitySeconds(env),
  });
  return { sessionId, csrf };
}

export async function getSession(
  env: Env,
  sessionId: string,
): Promise<SessionRecord | null> {
  const raw = await env.KV.get(key(sessionId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<SessionRecord>;
    // Tolerate sessions written before lastSeenAt existed.
    if (typeof parsed.lastSeenAt !== "number") parsed.lastSeenAt = parsed.createdAt ?? 0;
    return parsed as SessionRecord;
  } catch {
    return null;
  }
}

/** Slides the session's expiration forward. Idempotent no-op if it was
 *  already touched recently (see SESSION_TOUCH_THRESHOLD_SECONDS) — callers
 *  should check that themselves to also decide whether to reissue cookies. */
export async function touchSession(
  env: Env,
  sessionId: string,
  record: SessionRecord,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await env.KV.put(
    key(sessionId),
    JSON.stringify({ ...record, lastSeenAt: now }),
    { expirationTtl: sessionInactivitySeconds(env) },
  );
}

export async function destroySession(env: Env, sessionId: string): Promise<void> {
  await env.KV.delete(key(sessionId));
}

/** Invalidate every session for a user (password reset, account deletion,
 *  password/email change). Pass `exceptSessionId` to keep the session making
 *  the current request alive (e.g. changing your own password shouldn't log
 *  out the device you're changing it from). */
export async function destroyAllSessions(
  env: Env,
  userId: string,
  exceptSessionId?: string,
): Promise<void> {
  // KV has no secondary index; we keep a per-user set of session ids.
  const idxKey = `user_sessions:${userId}`;
  const raw = await env.KV.get(idxKey);
  if (raw) {
    const ids = (JSON.parse(raw) as string[]).filter((id) => id !== exceptSessionId);
    await Promise.all(ids.map((id) => env.KV.delete(key(id))));
    if (exceptSessionId) {
      await env.KV.put(idxKey, JSON.stringify([exceptSessionId]), {
        expirationTtl: sessionInactivitySeconds(env),
      });
    } else {
      await env.KV.delete(idxKey);
    }
  }
}

export async function trackUserSession(
  env: Env,
  userId: string,
  sessionId: string,
): Promise<void> {
  const idxKey = `user_sessions:${userId}`;
  const raw = await env.KV.get(idxKey);
  const ids = raw ? (JSON.parse(raw) as string[]) : [];
  ids.push(sessionId);
  await env.KV.put(idxKey, JSON.stringify(ids.slice(-20)), {
    expirationTtl: sessionInactivitySeconds(env),
  });
}
