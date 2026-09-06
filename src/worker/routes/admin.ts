import { Hono } from "hono";
import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Env, Vars } from "../env";
import { createDb } from "../db/client";
import {
  activities,
  activityCategories,
  groups,
  providers,
  reports,
  users,
} from "../db/schema";
import { parseBody } from "../lib/validate";
import { badRequest, notFound } from "../lib/errors";
import { newId } from "../lib/id";
import { ACTIVITY_CATEGORIES } from "@shared/constants";

type Ctx = { Bindings: Env; Variables: Vars };
const app = new Hono<Ctx>();

/* ------------------------------- stats ------------------------------- */
app.get("/stats", async (c) => {
  const db = createDb(c.env);
  const count = async (t: Parameters<typeof db.select>[0] extends never ? never : any) =>
    (await db.select({ n: sql<number>`count(*)` }).from(t)).at(0)?.n ?? 0;
  return c.json({
    users: await count(users),
    groups: await count(groups),
    activities: await count(activities),
    openReports: (
      await db
        .select({ n: sql<number>`count(*)` })
        .from(reports)
        .where(eq(reports.status, "open"))
    ).at(0)?.n ?? 0,
  });
});

/* ------------------------------- users ------------------------------- */
app.get("/users", async (c) => {
  const db = createDb(c.env);
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      role: users.role,
      status: users.status,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(desc(users.createdAt))
    .limit(200);
  return c.json({ users: rows });
});

/* ------------------------------ groups ------------------------------- */
app.get("/groups", async (c) => {
  const db = createDb(c.env);
  const rows = await db
    .select()
    .from(groups)
    .orderBy(desc(groups.createdAt))
    .limit(200);
  return c.json({ groups: rows });
});

/* ---------------------------- categories ---------------------------- */
app.get("/categories", async (c) => {
  const db = createDb(c.env);
  const rows = await db
    .select()
    .from(activityCategories)
    .orderBy(activityCategories.sort);
  return c.json({ categories: rows.length ? rows : ACTIVITY_CATEGORIES });
});

/* ----------------------------- providers ---------------------------- */
app.get("/providers", async (c) => {
  const db = createDb(c.env);
  return c.json({ providers: await db.select().from(providers) });
});

app.patch("/providers/:id", async (c) => {
  const db = createDb(c.env);
  const body = await parseBody(c, z.object({ enabled: z.boolean() }));
  await db
    .update(providers)
    .set({ enabled: body.enabled ? 1 : 0 })
    .where(eq(providers.id, c.req.param("id")));
  return c.json({ ok: true });
});

/* ---------------------------- activities --------------------------- */
const activityInput = z.object({
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().max(2000).default(""),
  categoryId: z.enum(ACTIVITY_CATEGORIES.map((x) => x.id) as [string, ...string[]]),
  locationLabel: z.string().trim().min(2).max(120),
  lat: z.number().min(-90).max(90).nullable().default(null),
  lng: z.number().min(-180).max(180).nullable().default(null),
  priceCents: z.number().int().min(0).nullable().default(null),
  priceBand: z.enum(["free", "0_10", "10_25", "25_50", "50_100", "100_plus"]),
  durationMin: z.number().int().min(0).nullable().default(null),
  websiteUrl: z.string().url().nullable().default(null),
  bookingUrl: z.string().url().nullable().default(null),
  ticketUrl: z.string().url().nullable().default(null),
  minAge: z.number().int().min(0).max(99).nullable().default(null),
  imageUrl: z.string().url().nullable().default(null),
  tags: z.array(z.string().max(40)).max(20).default([]),
  active: z.boolean().default(true),
});

app.get("/activities", async (c) => {
  const db = createDb(c.env);
  const rows = await db
    .select()
    .from(activities)
    .orderBy(desc(activities.updatedAt))
    .limit(500);
  return c.json({ activities: rows });
});

app.post("/activities", async (c) => {
  const db = createDb(c.env);
  const body = await parseBody(c, activityInput);
  const provider = await db.query.providers.findFirst({
    where: eq(providers.kind, "seed"),
  });
  if (!provider) throw badRequest("No provider configured. Run the seed first.");
  const now = Math.floor(Date.now() / 1000);
  const id = newId();
  await db.insert(activities).values({
    id,
    providerId: provider.id,
    externalId: `admin-${id}`,
    title: body.title,
    description: body.description,
    categoryId: body.categoryId,
    locationLabel: body.locationLabel,
    lat: body.lat != null ? Math.round(body.lat * 1e6) : null,
    lng: body.lng != null ? Math.round(body.lng * 1e6) : null,
    priceCents: body.priceCents,
    priceBand: body.priceBand,
    durationMin: body.durationMin,
    websiteUrl: body.websiteUrl,
    bookingUrl: body.bookingUrl,
    ticketUrl: body.ticketUrl,
    minAge: body.minAge,
    imageUrl: body.imageUrl,
    tags: JSON.stringify(body.tags),
    source: "admin",
    active: body.active ? 1 : 0,
    createdAt: now,
    updatedAt: now,
  });
  return c.json({ id }, 201);
});

app.put("/activities/:id", async (c) => {
  const db = createDb(c.env);
  const body = await parseBody(c, activityInput.partial());
  const existing = await db.query.activities.findFirst({
    where: eq(activities.id, c.req.param("id")),
  });
  if (!existing) throw notFound();
  await db
    .update(activities)
    .set({
      ...body,
      lat: body.lat != null ? Math.round(body.lat * 1e6) : body.lat === null ? null : undefined,
      lng: body.lng != null ? Math.round(body.lng * 1e6) : body.lng === null ? null : undefined,
      tags: body.tags ? JSON.stringify(body.tags) : undefined,
      active: body.active == null ? undefined : body.active ? 1 : 0,
      updatedAt: Math.floor(Date.now() / 1000),
    })
    .where(eq(activities.id, c.req.param("id")));
  return c.json({ ok: true });
});

app.delete("/activities/:id", async (c) => {
  const db = createDb(c.env);
  await db
    .update(activities)
    .set({ active: 0, updatedAt: Math.floor(Date.now() / 1000) })
    .where(eq(activities.id, c.req.param("id")));
  return c.json({ ok: true, note: "Soft-deleted (deactivated)." });
});

/* ------------------------------ reports ---------------------------- */
app.get("/reports", async (c) => {
  const db = createDb(c.env);
  const rows = await db
    .select()
    .from(reports)
    .orderBy(desc(reports.createdAt))
    .limit(200);
  return c.json({ reports: rows });
});

app.patch("/reports/:id", async (c) => {
  const db = createDb(c.env);
  const body = await parseBody(
    c,
    z.object({ status: z.enum(["open", "reviewing", "resolved", "dismissed"]) }),
  );
  await db
    .update(reports)
    .set({
      status: body.status,
      resolverId: c.get("userId"),
      resolvedAt:
        body.status === "resolved" || body.status === "dismissed"
          ? Math.floor(Date.now() / 1000)
          : null,
    })
    .where(eq(reports.id, c.req.param("id")));
  return c.json({ ok: true });
});

export default app;
