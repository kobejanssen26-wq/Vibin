/**
 * Command Center — live events + their ingestion sources.
 *
 * Mounted under /api/admin/cc (owner session + admin CSRF already applied).
 *   GET    /events                  list / filter
 *   POST   /events                  create a manual event
 *   PATCH  /events/:id              edit (edited fields are frozen vs. re-sync)
 *   POST   /events/:id/:action      verify | needs-review | archive | unarchive | cancel
 *   DELETE /events/:id              hard delete (junk only)
 *   GET    /event-sources           list feeds
 *   POST   /event-sources           add a feed
 *   PATCH  /event-sources/:id       enable/disable, edit config
 *   POST   /event-sources/:id/run   sync now
 *   GET    /events-coverage         per-municipality activity + event counts
 */
import { Hono } from "hono";
import { and, asc, between, desc, eq, gte, inArray, like, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { Env, Vars } from "../env";
import { createDb } from "../db/client";
import { activities, eventSources, events } from "../db/schema";
import { parseBody, parseQuery } from "../lib/validate";
import { badRequest, notFound } from "../lib/errors";
import { newId } from "../lib/id";
import { resolvePlace, allPlaces } from "../lib/be-places";
import { dedupeHash } from "../events/dedupe";
import { runSource } from "../events/ingest";
import { EVENT_KINDS, EVENT_STATUSES } from "@shared/constants";
import { haversineKm } from "../engine/deck";

type Ctx = { Bindings: Env; Variables: Vars };
const app = new Hono<Ctx>();

const KIND = z.enum(EVENT_KINDS as unknown as [string, ...string[]]);
const STATUS = z.enum(EVENT_STATUSES as unknown as [string, ...string[]]);
const VERIF = z.enum(["verified", "needs_review", "unverified", "archived"]);
const urlOrNull = z.string().trim().url().max(500).nullable().default(null);

/* --------------------------------- list --------------------------------- */
app.get("/events", async (c) => {
  const q = parseQuery(
    c,
    z.object({
      kind: KIND.optional(),
      status: STATUS.optional(),
      verification: VERIF.optional(),
      city: z.string().trim().max(80).optional(),
      sourceId: z.string().max(40).optional(),
      q: z.string().trim().max(80).optional(),
      from: z.coerce.number().int().positive().optional(),
      to: z.coerce.number().int().positive().optional(),
      limit: z.coerce.number().int().min(1).max(1000).default(300),
    }),
  );
  const db = createDb(c.env);
  const where = [
    ...(q.kind ? [eq(events.kind, q.kind as never)] : []),
    ...(q.status ? [eq(events.status, q.status as never)] : []),
    ...(q.verification ? [eq(events.verificationStatus, q.verification as never)] : []),
    ...(q.city ? [like(events.city, `%${q.city}%`)] : []),
    ...(q.sourceId ? [eq(events.sourceId, q.sourceId)] : []),
    ...(q.q ? [or(like(events.title, `%${q.q}%`), like(events.venueName, `%${q.q}%`))] : []),
    ...(q.from || q.to
      ? [between(events.startsAt, q.from ?? 0, q.to ?? 4102444800)]
      : []),
  ];
  const rows = await db
    .select()
    .from(events)
    .where(where.length ? and(...where) : undefined)
    .orderBy(asc(events.startsAt))
    .limit(q.limit);
  return c.json({ events: rows });
});

/* -------------------------------- create -------------------------------- */
const eventInput = z.object({
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().max(2000).default(""),
  kind: KIND.default("other"),
  categoryId: z.string().trim().max(40).nullable().default(null),
  subcategory: z.string().trim().max(80).nullable().default(null),
  venueName: z.string().trim().max(160).nullable().default(null),
  address: z.string().trim().max(240).nullable().default(null),
  city: z.string().trim().max(80).nullable().default(null),
  lat: z.number().min(-90).max(90).nullable().default(null),
  lng: z.number().min(-180).max(180).nullable().default(null),
  startsAt: z.number().int().positive(),
  endsAt: z.number().int().positive().nullable().default(null),
  allDay: z.boolean().default(false),
  status: STATUS.default("upcoming"),
  priceType: z.enum(["free", "paid", "varies", "unknown"]).default("unknown"),
  priceMinCents: z.number().int().min(0).max(10_000_00).nullable().default(null),
  priceMaxCents: z.number().int().min(0).max(10_000_00).nullable().default(null),
  currency: z.string().trim().length(3).default("EUR"),
  url: urlOrNull,
  ticketUrl: urlOrNull,
  imageUrl: urlOrNull,
  imageAttribution: z.string().trim().max(200).nullable().default(null),
  tags: z.array(z.string().max(40)).max(16).default([]),
  sourceUrl: urlOrNull,
  verificationStatus: VERIF.default("verified"),
});

app.post("/events", async (c) => {
  const body = await parseBody(c, eventInput);
  const db = createDb(c.env);
  const now = Math.floor(Date.now() / 1000);
  let latE6: number | null = body.lat != null ? Math.round(body.lat * 1e6) : null;
  let lngE6: number | null = body.lng != null ? Math.round(body.lng * 1e6) : null;
  if ((latE6 == null || lngE6 == null) && body.city) {
    const hit = resolvePlace(body.city);
    if (hit) {
      latE6 = Math.round(hit.lat * 1e6);
      lngE6 = Math.round(hit.lng * 1e6);
    }
  }
  const id = newId();
  await db.insert(events).values({
    id,
    sourceId: null,
    externalId: `manual-${id}`,
    dedupeHash: dedupeHash(body.title, body.startsAt, body.city),
    title: body.title,
    description: body.description,
    kind: body.kind as never,
    categoryId: body.categoryId,
    subcategory: body.subcategory,
    venueName: body.venueName,
    address: body.address,
    city: body.city,
    lat: latE6,
    lng: lngE6,
    startsAt: body.startsAt,
    endsAt: body.endsAt,
    allDay: body.allDay ? 1 : 0,
    status: body.status as never,
    priceType: body.priceType,
    priceMinCents: body.priceMinCents,
    priceMaxCents: body.priceMaxCents,
    currency: body.currency.toUpperCase(),
    url: body.url,
    ticketUrl: body.ticketUrl,
    imageUrl: body.imageUrl,
    imageSource: body.imageUrl ? "admin" : null,
    imageAttribution: body.imageAttribution,
    tags: JSON.stringify(body.tags),
    source: "manual",
    sourceUrl: body.sourceUrl,
    verificationStatus: body.verificationStatus as never,
    lockedFields: "[]",
    lastSyncedAt: now,
    nextSyncAt: null,
    active: 1,
    createdAt: now,
    updatedAt: now,
  });
  return c.json({ id }, 201);
});

/* --------------------------------- edit --------------------------------- */
app.patch("/events/:id", async (c) => {
  const db = createDb(c.env);
  const id = c.req.param("id");
  const row = await db.query.events.findFirst({ where: eq(events.id, id) });
  if (!row) throw notFound("Event not found.");
  const body = await parseBody(c, eventInput.partial());
  const now = Math.floor(Date.now() / 1000);

  const patch: Record<string, unknown> = { updatedAt: now };
  const locked = new Set<string>(safeArr(row.lockedFields));
  for (const [k, v] of Object.entries(body)) {
    if (v === undefined) continue;
    if (k === "lat") patch.lat = v == null ? null : Math.round((v as number) * 1e6);
    else if (k === "lng") patch.lng = v == null ? null : Math.round((v as number) * 1e6);
    else if (k === "allDay") patch.allDay = v ? 1 : 0;
    else if (k === "tags") patch.tags = JSON.stringify(v);
    else if (k === "currency") patch.currency = String(v).toUpperCase();
    else patch[k] = v;
    // freeze any field a human touched so a later re-sync won't clobber it
    if (["lat", "lng"].includes(k)) {
      locked.add("lat");
      locked.add("lng");
    } else locked.add(k);
  }
  if (body.title || body.startsAt || body.city !== undefined) {
    patch.dedupeHash = dedupeHash(
      (body.title as string) ?? row.title,
      (body.startsAt as number) ?? row.startsAt,
      body.city !== undefined ? (body.city as string | null) : row.city,
    );
  }
  patch.lockedFields = JSON.stringify([...locked]);
  await db.update(events).set(patch).where(eq(events.id, id));
  return c.json({ ok: true, locked: [...locked] });
});

/* ---------------------------- state actions ---------------------------- */
app.post("/events/:id/:action", async (c) => {
  const db = createDb(c.env);
  const id = c.req.param("id");
  const action = c.req.param("action");
  const map: Record<string, Record<string, unknown>> = {
    verify: { verificationStatus: "verified" },
    "needs-review": { verificationStatus: "needs_review" },
    archive: { verificationStatus: "archived", active: 0 },
    unarchive: { verificationStatus: "needs_review", active: 1 },
    cancel: { status: "cancelled" },
  };
  const set = map[action];
  if (!set) throw badRequest("Unknown action.");
  const r = await db
    .update(events)
    .set({ ...set, updatedAt: Math.floor(Date.now() / 1000) })
    .where(eq(events.id, id));
  if (!(r as { meta?: { changes?: number } }).meta?.changes) {
    throw notFound("Event not found.");
  }
  return c.json({ ok: true });
});

app.delete("/events/:id", async (c) => {
  const db = createDb(c.env);
  await db.delete(events).where(eq(events.id, c.req.param("id")));
  return c.json({ ok: true });
});

/* ------------------------------- sources ------------------------------- */
app.get("/event-sources", async (c) => {
  const db = createDb(c.env);
  const rows = await db
    .select()
    .from(eventSources)
    .orderBy(desc(eventSources.enabled), asc(eventSources.name));
  const counts = await db
    .select({ sourceId: events.sourceId, n: sql<number>`count(*)` })
    .from(events)
    .groupBy(events.sourceId);
  const byId = new Map(counts.map((x) => [x.sourceId, x.n]));
  return c.json({
    sources: rows.map((s) => ({ ...s, eventCount: byId.get(s.id) ?? 0 })),
  });
});

const sourceInput = z.object({
  name: z.string().trim().min(2).max(120),
  kind: z.enum(["manual", "sports_api", "ticket_feed", "city_calendar", "ics", "rss"]),
  enabled: z.boolean().default(false),
  trust: z.enum(["official", "trusted", "third_party"]).default("third_party"),
  config: z.record(z.unknown()).default({}),
  syncEveryMin: z.number().int().min(30).max(10080).default(720),
});

app.post("/event-sources", async (c) => {
  const body = await parseBody(c, sourceInput);
  const db = createDb(c.env);
  const now = Math.floor(Date.now() / 1000);
  const id = newId();
  await db.insert(eventSources).values({
    id,
    name: body.name,
    kind: body.kind,
    enabled: body.enabled ? 1 : 0,
    trust: body.trust,
    config: JSON.stringify(body.config),
    syncEveryMin: body.syncEveryMin,
    nextRunAt: body.enabled ? now : null,
    createdAt: now,
    updatedAt: now,
  });
  return c.json({ id }, 201);
});

app.patch("/event-sources/:id", async (c) => {
  const db = createDb(c.env);
  const id = c.req.param("id");
  const body = await parseBody(c, sourceInput.partial());
  const patch: Record<string, unknown> = { updatedAt: Math.floor(Date.now() / 1000) };
  if (body.name !== undefined) patch.name = body.name;
  if (body.kind !== undefined) patch.kind = body.kind;
  if (body.trust !== undefined) patch.trust = body.trust;
  if (body.syncEveryMin !== undefined) patch.syncEveryMin = body.syncEveryMin;
  if (body.config !== undefined) patch.config = JSON.stringify(body.config);
  if (body.enabled !== undefined) {
    patch.enabled = body.enabled ? 1 : 0;
    if (body.enabled) patch.nextRunAt = Math.floor(Date.now() / 1000);
  }
  const r = await db.update(eventSources).set(patch).where(eq(eventSources.id, id));
  if (!(r as { meta?: { changes?: number } }).meta?.changes) {
    throw notFound("Source not found.");
  }
  return c.json({ ok: true });
});

app.post("/event-sources/:id/run", async (c) => {
  const db = createDb(c.env);
  const src = await db.query.eventSources.findFirst({
    where: eq(eventSources.id, c.req.param("id")),
  });
  if (!src) throw notFound("Source not found.");
  const result = await runSource(db, c.env, src);
  const now = Math.floor(Date.now() / 1000);
  await db
    .update(eventSources)
    .set({
      lastRunAt: now,
      nextRunAt: now + src.syncEveryMin * 60,
      lastResult: JSON.stringify(result),
      updatedAt: now,
    })
    .where(eq(eventSources.id, src.id));
  return c.json({ result });
});

/* --------------------------- geo coverage ---------------------------- */
app.get("/events-coverage", async (c) => {
  const q = parseQuery(
    c,
    z.object({
      radiusKm: z.coerce.number().min(1).max(50).default(15),
      minPop: z.coerce.number().min(0).default(0),
      limit: z.coerce.number().int().min(1).max(2000).default(2000),
    }),
  );
  const db = createDb(c.env);
  const acts = await db
    .select({ lat: activities.lat, lng: activities.lng })
    .from(activities)
    .where(and(eq(activities.active, 1), inArray(activities.status, ["verified", "needs_review"])));
  const now = Math.floor(Date.now() / 1000);
  const evs = await db
    .select({ lat: events.lat, lng: events.lng })
    .from(events)
    .where(and(eq(events.active, 1), gte(events.startsAt, now)));

  const A = acts.filter((r) => r.lat != null && r.lng != null) as { lat: number; lng: number }[];
  const E = evs.filter((r) => r.lat != null && r.lng != null) as { lat: number; lng: number }[];

  const rows = allPlaces()
    .map((p) => {
      const withinA = A.filter(
        (a) => haversineKm(p.lat, p.lng, a.lat / 1e6, a.lng / 1e6) <= q.radiusKm,
      ).length;
      const withinE = E.filter(
        (e) => haversineKm(p.lat, p.lng, e.lat / 1e6, e.lng / 1e6) <= q.radiusKm,
      ).length;
      const score = withinA + withinE * 2;
      return {
        name: p.name,
        lat: p.lat,
        lng: p.lng,
        activities: withinA,
        events: withinE,
        score,
        gap: withinA === 0 ? "critical" : withinA < 3 ? "thin" : "ok",
      };
    })
    .sort((a, b) => a.score - b.score)
    .slice(0, q.limit);

  return c.json({
    radiusKm: q.radiusKm,
    places: rows.length,
    critical: rows.filter((r) => r.gap === "critical").length,
    thin: rows.filter((r) => r.gap === "thin").length,
    rows,
  });
});

function safeArr(raw: string): string[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

export default app;
