import type { Env } from "../env";

/** How long a session stays valid since it was last used (sliding window).
 *  Shared by lib/session.ts (KV expirationTtl) and lib/cookies.ts (cookie
 *  maxAge) — kept in its own file so both can import it without a cycle. */
export function sessionInactivitySeconds(env: Env): number {
  const days = Number(env.SESSION_INACTIVITY_DAYS);
  return (Number.isFinite(days) && days > 0 ? days : 14) * 24 * 60 * 60;
}
