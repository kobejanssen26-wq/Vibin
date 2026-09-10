/**
 * Cron entrypoint for the events pipeline. Runs every enabled source that is
 * due, records the result on the source row, then rolls event statuses forward.
 * Safe to call with zero sources — it just returns { ran: 0 }.
 */
import { and, eq, lte, or, isNull } from "drizzle-orm";
import type { DB } from "../db/client";
import { eventSources } from "../db/schema";
import type { Env } from "../env";
import { runSource } from "./ingest";
import { refreshEventStatuses } from "./lifecycle";

export async function runDueSources(
  db: DB,
  env: Env,
  opts: { force?: boolean } = {},
): Promise<{ ran: number; results: Record<string, string> }> {
  const now = Math.floor(Date.now() / 1000);
  const due = await db
    .select()
    .from(eventSources)
    .where(
      opts.force
        ? eq(eventSources.enabled, 1)
        : and(
            eq(eventSources.enabled, 1),
            or(isNull(eventSources.nextRunAt), lte(eventSources.nextRunAt, now)),
          ),
    );

  const results: Record<string, string> = {};
  for (const source of due) {
    let summary: string;
    try {
      const r = await runSource(db, env, source);
      summary = r.ok ? r.message : `not run: ${r.message}`;
      await db
        .update(eventSources)
        .set({
          lastRunAt: now,
          nextRunAt: now + source.syncEveryMin * 60,
          lastResult: JSON.stringify(r),
          updatedAt: now,
        })
        .where(eq(eventSources.id, source.id));
    } catch (e) {
      summary = e instanceof Error ? e.message.slice(0, 200) : "run failed";
      await db
        .update(eventSources)
        .set({
          lastRunAt: now,
          nextRunAt: now + source.syncEveryMin * 60,
          lastResult: JSON.stringify({ ok: false, message: summary }),
          updatedAt: now,
        })
        .where(eq(eventSources.id, source.id));
    }
    results[source.name] = summary;
  }

  const rolled = await refreshEventStatuses(db);
  results["_lifecycle"] = `live +${rolled.toLive}, completed +${rolled.toCompleted}`;

  return { ran: due.length, results };
}
