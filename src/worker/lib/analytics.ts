import type { Context } from "hono";
import type { Env, Vars } from "../env";
import { createDb } from "../db/client";
import { analyticsEvents } from "../db/schema";
import { newId } from "./id";

type Ctx = Context<{ Bindings: Env; Variables: Vars }>;

/**
 * The closed set of product analytics events. Keeping this a union makes the
 * funnel/report queries stable and stops typo'd event names polluting the data.
 */
export type EventName =
  | "user_registered"
  | "email_verified"
  | "onboarding_completed"
  | "group_created"
  | "group_invite_sent"
  | "group_joined"
  | "group_config_saved"
  | "swiping_started"
  | "activity_viewed"
  | "activity_liked"
  | "activity_passed"
  | "activity_superliked"
  | "activity_matched"
  | "date_match_started"
  | "date_vote_cast"
  | "date_matched"
  | "date_match_failed"
  | "plan_created"
  | "booking_clicked"
  | "calendar_action"
  | "client_error"
  | "server_error";

export interface TrackOpts {
  userId?: string | null;
  groupId?: string | null;
  activityId?: string | null;
  props?: Record<string, unknown>;
  /** When set, the same key is only ever recorded once (retry/reload safe). */
  dedupeKey?: string | null;
  /** Explicit timestamp (epoch seconds); defaults to now. */
  at?: number;
}

function writeEvent(env: Env, name: EventName, opts: TrackOpts): Promise<unknown> {
  const db = createDb(env);
  const row = {
    id: newId(),
    name,
    userId: opts.userId ?? null,
    groupId: opts.groupId ?? null,
    activityId: opts.activityId ?? null,
    props: JSON.stringify(trimProps(opts.props ?? {})),
    dedupeKey: opts.dedupeKey ?? null,
    createdAt: opts.at ?? Math.floor(Date.now() / 1000),
  };
  const q = db.insert(analyticsEvents).values(row);
  // dedupeKey has a UNIQUE index; ignore a duplicate instead of erroring.
  return opts.dedupeKey ? q.onConflictDoNothing().catch(() => {}) : q.catch(() => {});
}

/** Keep event props small and free of anything sensitive. */
function trimProps(props: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  let n = 0;
  for (const [k, v] of Object.entries(props)) {
    if (n++ >= 12) break;
    if (/(pass|secret|token|email|phone|key|hash)/i.test(k)) continue;
    if (typeof v === "string") out[k] = v.slice(0, 200);
    else if (typeof v === "number" || typeof v === "boolean") out[k] = v;
  }
  return out;
}

/**
 * Fire-and-forget: the event write runs after the response via `waitUntil` and
 * can never fail the request. Use in route handlers.
 */
export function track(c: Ctx, name: EventName, opts: TrackOpts = {}): void {
  const p = writeEvent(c.env, name, opts);
  const ctx = c.executionCtx as { waitUntil?: (p: Promise<unknown>) => void } | undefined;
  if (ctx?.waitUntil) ctx.waitUntil(p);
  else void p;
}

/** Awaitable variant for background jobs / tests. */
export async function trackNow(
  env: Env,
  name: EventName,
  opts: TrackOpts = {},
): Promise<void> {
  await writeEvent(env, name, opts);
}
