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
const urlOrNull = z.string().url().max(500).nullable().default(null);
const activityInput = z.object({
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().max(2000).default(""),
  categoryId: z.enum(ACTIVITY_CATEGORIES.map((x) => x.id) as [string, ...string[]]),
  subcategory: z.string().trim().max(60).nullable().default(null),
  provider: z.string().trim().max(120).nullable().default(null),
  providerWebsite: urlOrNull,
  locationLabel: z.string().trim().min(2).max(160),
  address: z.string().trim().max(200).nullable().default(null),
  city: z.string().trim().max(80).nullable().default(null),
  country: z.string().trim().length(2).default("BE"),
  lat: z.number().min(-90).max(90).nullable().default(null),
  lng: z.number().min(-180).max(180).nullable().default(null),
  priceCents: z.number().int().min(0).nullable().default(null),
  priceType: z
    .enum(["per_person", "per_group", "from_per_person", "free", "varies"])
    .default("per_person"),
  priceBand: z.enum(["free", "0_10", "10_25", "25_50", "50_100", "100_plus"]),
  durationMin: z.number().int().min(0).max(10080).nullable().default(null),
  minParticipants: z.number().int().min(1).max(999).nullable().default(null),
  maxParticipants: z.number().int().min(1).max(9999).nullable().default(null),
  minAge: z.number().int().min(0).max(99).nullable().default(null),
  indoorOutdoor: z.enum(["indoor", "outdoor", "both"]).nullable().default(null),
  accessibility: z.string().trim().max(300).nullable().default(null),
  websiteUrl: urlOrNull,
  bookingUrl: urlOrNull,
  ticketUrl: urlOrNull,
  imageUrl: urlOrNull,
  imageSource: z.string().trim().max(80).nullable().default(null),
  imageAttribution: z.string().trim().max(200).nullable().default(null),
  tags: z.array(z.string().max(40)).max(24).default([]),
  source: z.string().trim().max(120).default("admin"),
  sourceUrl: urlOrNull,
  status: z
    .enum(["verified", "needs_review", "outdated", "inactive"])
    .default("needs_review"),
  active: z.boolean().default(true),
  // monetization (§4/§17/§46) — edited only when a real deal exists; never
  // auto-populated with a guess. All optional so a plain content edit doesn't
  // have to resend them.
  monetizationType: z
    .enum(["none", "outbound_tracking", "affiliate", "direct_partner", "booking_partner"])
    .optional(),
  affiliateUrl: urlOrNull.optional(),
  affiliateNetwork: z.string().trim().max(80).nullable().optional(),
  affiliatePartnerId: z.string().trim().max(80).nullable().optional(),
  commissionType: z.enum(["none", "percentage", "fixed"]).optional(),
  commissionRate: z.number().min(0).max(100_000).nullable().optional(),
  commissionCurrency: z.string().trim().length(3).nullable().optional(),
  commissionStatus: z
    .enum(["none", "pending", "active", "paused", "ended"])
    .optional(),
});

const scaleLatLng = (v: number | null | undefined) =>
  v == null ? (v === null ? null : undefined) : Math.round(v * 1e6);

app.get("/activities", async (c) => {
  const db = createDb(c.env);
  const status = new URL(c.req.url).searchParams.get("status");
  const rows = await db
    .select()
    .from(activities)
    .where(
      status && ["verified", "needs_review", "outdated", "inactive"].includes(status)
        ? eq(activities.status, status as never)
        : undefined,
    )
    .orderBy(desc(activities.updatedAt))
    .limit(1000);
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
    ...body,
    lat: scaleLatLng(body.lat) ?? null,
    lng: scaleLatLng(body.lng) ?? null,
    tags: JSON.stringify(body.tags),
    lastVerifiedAt: body.status === "verified" ? now : null,
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
  const now = Math.floor(Date.now() / 1000);
  await db
    .update(activities)
    .set({
      ...body,
      lat: scaleLatLng(body.lat),
      lng: scaleLatLng(body.lng),
      tags: body.tags ? JSON.stringify(body.tags) : undefined,
      active: body.active == null ? undefined : body.active ? 1 : 0,
      // marking an activity "verified" stamps the verification date
      lastVerifiedAt: body.status === "verified" ? now : undefined,
      updatedAt: now,
    })
    .where(eq(activities.id, c.req.param("id")));
  return c.json({ ok: true });
});

/** Quick "I checked this and it's still current" action (§27). */
app.post("/activities/:id/verify", async (c) => {
  const db = createDb(c.env);
  const now = Math.floor(Date.now() / 1000);
  await db
    .update(activities)
    .set({ status: "verified", lastVerifiedAt: now, updatedAt: now })
    .where(eq(activities.id, c.req.param("id")));
  return c.json({ ok: true, lastVerifiedAt: now });
});

app.delete("/activities/:id", async (c) => {
  const db = createDb(c.env);
  await db
    .update(activities)
    .set({ active: 0, status: "inactive", updatedAt: Math.floor(Date.now() / 1000) })
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
      resolverId: c.get("adminUserId"),
      resolvedAt:
        body.status === "resolved" || body.status === "dismissed"
          ? Math.floor(Date.now() / 1000)
          : null,
    })
    .where(eq(reports.id, c.req.param("id")));
  return c.json({ ok: true });
});

export default app;
