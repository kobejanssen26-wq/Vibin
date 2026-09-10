/**
 * Time-driven status transitions, run on the cron alongside source syncs.
 *
 *   upcoming -> live       once startsAt has passed (and endsAt hasn't)
 *   live/upcoming -> completed   once endsAt (or startsAt + 4h fallback) has passed
 *
 * `cancelled` / `postponed` / `sold_out` are only ever set by a feed or an
 * admin — the clock never overrides them.
 */
import { and, eq, lt, notInArray, sql } from "drizzle-orm";
import type { DB } from "../db/client";
import { events } from "../db/schema";

const FALLBACK_DURATION_SEC = 4 * 3600;

export async function refreshEventStatuses(db: DB): Promise<{
  toLive: number;
  toCompleted: number;
}> {
  const now = Math.floor(Date.now() / 1000);

  // -> completed: ended, or (no end) started long enough ago
  const completed = await db
    .update(events)
    .set({ status: "completed", updatedAt: now })
    .where(
      and(
        eq(events.active, 1),
        notInArray(events.status, ["completed", "cancelled"]),
        sql`coalesce(${events.endsAt}, ${events.startsAt} + ${FALLBACK_DURATION_SEC}) < ${now}`,
      ),
    );

  // -> live: started, not yet completed
  const live = await db
    .update(events)
    .set({ status: "live", updatedAt: now })
    .where(
      and(
        eq(events.active, 1),
        eq(events.status, "upcoming"),
        lt(events.startsAt, now),
        sql`coalesce(${events.endsAt}, ${events.startsAt} + ${FALLBACK_DURATION_SEC}) >= ${now}`,
      ),
    );

  return {
    toLive: (live as { meta?: { changes?: number } }).meta?.changes ?? 0,
    toCompleted: (completed as { meta?: { changes?: number } }).meta?.changes ?? 0,
  };
}
