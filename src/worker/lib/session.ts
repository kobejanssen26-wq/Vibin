/**
 * Sessions live in KV (fast, edge-local, TTL'd) — never trusted from the client.
 * Key:   session:<sessionId>
 * Value: { userId, csrf, createdAt, ua }
 */
import { SESSION_TTL_SECONDS } from "@shared/constants";
import type { Env } from "../env";
import { newCsrfToken } from "./cookies";
import { newSessionId } from "./id";

export interface SessionRecord {
  userId: string;
  csrf: string;
  createdAt: number;
  ua: string;
}

const key = (id: string) => `session:${id}`;

export async function createSession(
  env: Env,
  userId: string,
  ua: string,
): Promise<{ sessionId: string; csrf: string }> {
  const sessionId = newSessionId();
  const csrf = newCsrfToken();
  const record: SessionRecord = {
    userId,
    csrf,
    createdAt: Math.floor(Date.now() / 1000),
    ua: ua.slice(0, 200),
  };
  await env.KV.put(key(sessionId), JSON.stringify(record), {
    expirationTtl: SESSION_TTL_SECONDS,
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
    return JSON.parse(raw) as SessionRecord;
  } catch {
    return null;
  }
}

export async function destroySession(env: Env, sessionId: string): Promise<void> {
  await env.KV.delete(key(sessionId));
}

/** Invalidate every session for a user (password reset, account deletion). */
export async function destroyAllSessions(env: Env, userId: string): Promise<void> {
  // KV has no secondary index; we keep a per-user set of session ids.
  const idxKey = `user_sessions:${userId}`;
  const raw = await env.KV.get(idxKey);
  if (raw) {
    const ids = JSON.parse(raw) as string[];
    await Promise.all(ids.map((id) => env.KV.delete(key(id))));
    await env.KV.delete(idxKey);
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
    expirationTtl: SESSION_TTL_SECONDS,
  });
}
