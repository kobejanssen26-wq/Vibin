/**
 * Client-reported analytics events (things the server can't observe directly):
 * activity impressions, booking-link clicks, calendar actions, front-end errors.
 *
 * Authenticated, rate-limited, and restricted to a fixed event whitelist so the
 * table can't be spammed with arbitrary names. `dedupeKey` from the client
 * makes reloads / retries idempotent.
 */
import { Hono } from "hono";
import { z } from "zod";
import type { Env, Vars } from "../env";
import { parseBody } from "../lib/validate";
import { rateLimit, clientIp } from "../lib/ratelimit";
import { trackNow, type EventName } from "../lib/analytics";

type Ctx = { Bindings: Env; Variables: Vars };
const app = new Hono<Ctx>();
const uid = (c: { get: (k: "userId") => string | null }) => c.get("userId")!;

const CLIENT_EVENTS = [
  "activity_viewed",
  "activity_expanded",
  "activity_shared",
  "booking_clicked",
  "calendar_action",
  "onboarding_completed",
  "client_error",
] as const;

const eventSchema = z.object({
  name: z.enum(CLIENT_EVENTS),
  groupId: z.string().max(40).optional(),
  activityId: z.string().max(40).optional(),
  props: z.record(z.union([z.string().max(200), z.number(), z.boolean()])).optional(),
  dedupeKey: z.string().max(120).optional(),
  at: z.number().int().positive().optional(),
});

app.post("/", async (c) => {
  const userId = uid(c);
  await rateLimit(c.env, "client-events", `${clientIp(c.req.raw)}:${userId}`, 300, 5 * 60);
  const body = await parseBody(c, z.union([eventSchema, z.array(eventSchema).max(20)]));
  const list = Array.isArray(body) ? body : [body];

  await Promise.all(
    list.map((e) =>
      trackNow(c.env, e.name as EventName, {
        userId,
        groupId: e.groupId ?? null,
        activityId: e.activityId ?? null,
        props: e.props,
        dedupeKey: e.dedupeKey ?? null,
        at: e.at,
      }),
    ),
  );
  return c.json({ ok: true, accepted: list.length });
});

export default app;
