/**
 * Public discovery of live / upcoming events (temporary happenings — matches,
 * concerts, markets, festivals). Read-only; the catalogue is populated by the
 * ingestion pipeline (src/worker/events) and the Command Center.
 *
 * `nearby` is geo-filtered with the same bounding-box + haversine approach as
 * the activity deck, so "within X km of Hoogstraten" means real distance.
 */
import { Hono } from "hono";
import { and, asc, between, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";
import { z } from "zod";
import type { Env, Vars } from "../env";
import { createDb } from "../db/client";
import { events } from "../db/schema";
import { parseQuery } from "../lib/validate";
import { notFound } from "../lib/errors";
import { toEventDTO } from "../lib/event-dto";
import { haversineKm } from "../engine/deck";
import { EVENT_KINDS } from "@shared/constants";

type Ctx = { Bindings: Env; Variables: Vars };
const app = new Hono<Ctx>();

/** Default discovery window (days before startsAt) for an event that hasn't
 *  been given its own — a major festival might want longer, a small local
 *  event shorter (see events.visibilityWindowDays, admin-settable per event). */
const DEFAULT_VISIBILITY_WINDOW_DAYS = 60;

const nearbySchema = z.object({
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  radiusKm: z.coerce.number().min(1).max(200).default(25),
  /** unix seconds; defaults now .. now + 60 days */
  from: z.coerce.number().int().positive().optional(),
  to: z.coerce.number().int().positive().optional(),
  kind: z.enum(EVENT_KINDS as unknown as [string, ...string[]]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(60),
});

app.get("/nearby", async (c) => {
  const q = parseQuery(c, nearbySchema);
  const db = createDb(c.env);
  const now = Math.floor(Date.now() / 1000);
  const from = q.from ?? now - 3600;
  // `to` is just an outer sanity cap (or an explicit client override) — the
  // real "is this event visible yet" decision is the per-event window below,
  // so the default has to be generous enough not to clip a long-window event.
  const to = q.to ?? now + 365 * 86_400;

  const where = [
    eq(events.active, 1),
    ne(events.verificationStatus, "archived"),
    inArray(events.status, ["upcoming", "live"]),
    between(events.startsAt, from, to),
    sql`${events.startsAt} <= ${now} + COALESCE(${events.visibilityWindowDays}, ${DEFAULT_VISIBILITY_WINDOW_DAYS}) * 86400`,
    ...(q.kind ? [eq(events.kind, q.kind as (typeof EVENT_KINDS)[number])] : []),
  ];

  const hasGeo = q.lat != null && q.lng != null;
  if (hasGeo) {
    const km = q.radiusKm + 2;
    const dLat = Math.ceil((km / 111.32) * 1e6);
    const dLng = Math.ceil(
      (km / (111.32 * Math.max(0.01, Math.cos((q.lat! * Math.PI) / 180)))) * 1e6,
    );
    const latE6 = Math.round(q.lat! * 1e6);
    const lngE6 = Math.round(q.lng! * 1e6);
    where.push(
      gte(events.lat, latE6 - dLat),
      lte(events.lat, latE6 + dLat),
      gte(events.lng, lngE6 - dLng),
      lte(events.lng, lngE6 + dLng),
    );
  }

  let rows = await db
    .select()
    .from(events)
    .where(and(...where))
    .orderBy(asc(events.startsAt))
    .limit(hasGeo ? Math.max(q.limit * 6, 300) : q.limit);

  let withDist = rows.map((e) => ({ e, d: null as number | null }));
  if (hasGeo) {
    withDist = rows
      .map((e) => ({
        e,
        d:
          e.lat != null && e.lng != null
            ? haversineKm(q.lat!, q.lng!, e.lat / 1e6, e.lng / 1e6)
            : null,
      }))
      .filter((x) => x.d != null && x.d <= q.radiusKm)
      .slice(0, q.limit);
  }

  return c.json({
    events: withDist.map(({ e, d }) => toEventDTO(e, d, now)),
    note: "Event info is third-party and can change — confirm with the organiser.",
  });
});

app.get("/:id", async (c) => {
  const db = createDb(c.env);
  const row = await db.query.events.findFirst({
    where: eq(events.id, c.req.param("id")),
  });
  if (!row || row.active !== 1 || row.verificationStatus === "archived") {
    throw notFound("Event not found.");
  }
  return c.json({ event: toEventDTO(row) });
});

export default app;
