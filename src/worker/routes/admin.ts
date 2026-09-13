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
import { activityInput, ensureAdminProvider, scaleLatLng } from "../lib/activity-input";

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

/**
 * Rename or activate/deactivate an EXISTING category (§13). The category id
 * set itself stays fixed here: icon/colour lookups for these ids are
 * duplicated across several swipe-UI components (SwipeCard, ActivityExpanded,
 * PlanView, …), so adding a brand-new id needs matching entries added in each
 * of those — a larger, separate change. Renaming/reordering/deactivating the
 * 12 that exist needs none of that and is fully safe.
 */
app.patch("/categories/:id", async (c) => {
  const db = createDb(c.env);
  const id = c.req.param("id");
  const body = await parseBody(
    c,
    z.object({
      label: z.string().trim().min(1).max(60).optional(),
      active: z.boolean().optional(),
    }),
  );
  const existing = await db.query.activityCategories.findFirst({
    where: eq(activityCategories.id, id),
  });
  if (!existing) throw notFound("Category not found.");
  // Deactivating only hides the category from the filter picker for new
  // selections — existing activities keep their categoryId untouched, so
  // there's no orphaning risk to guard against here (unlike a hard delete).
  await db
    .update(activityCategories)
    .set({
      ...(body.label !== undefined ? { label: body.label } : {}),
      ...(body.active !== undefined ? { active: body.active ? 1 : 0 } : {}),
    })
    .where(eq(activityCategories.id, id));
  return c.json({ ok: true });
});

/** Reorder categories: body is the full list of ids in the desired order. */
app.post("/categories/reorder", async (c) => {
  const db = createDb(c.env);
  const { ids } = await parseBody(c, z.object({ ids: z.array(z.string()).min(1).max(60) }));
  const existing = await db.select({ id: activityCategories.id }).from(activityCategories);
  const known = new Set(existing.map((r) => r.id));
  if (ids.length !== known.size || !ids.every((id) => known.has(id))) {
    throw badRequest("The id list must contain exactly the existing categories, once each.");
  }
  for (let i = 0; i < ids.length; i++) {
    await db.update(activityCategories).set({ sort: i }).where(eq(activityCategories.id, ids[i]!));
  }
  return c.json({ ok: true });
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
  const providerId = await ensureAdminProvider(c.env);
  const now = Math.floor(Date.now() / 1000);
  const id = newId();
  await db.insert(activities).values({
    id,
    providerId,
    externalId: `admin-${id}`,
    ...body,
    lat: scaleLatLng(body.lat) ?? null,
    lng: scaleLatLng(body.lng) ?? null,
    tags: JSON.stringify(body.tags),
    openingHours: JSON.stringify(body.openingHours),
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
      openingHours: body.openingHours ? JSON.stringify(body.openingHours) : undefined,
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
  const url = new URL(c.req.url);
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const pageSize = Math.min(100, Math.max(5, Number(url.searchParams.get("pageSize")) || 25));
  const status = url.searchParams.get("status");
  const targetType = url.searchParams.get("targetType");

  const where: string[] = [];
  const args: unknown[] = [];
  if (status && ["open", "reviewing", "resolved", "dismissed"].includes(status)) {
    where.push(`r.status = ?${args.length + 1}`);
    args.push(status);
  }
  if (targetType && ["activity", "group", "member", "message"].includes(targetType)) {
    where.push(`r.target_type = ?${args.length + 1}`);
    args.push(targetType);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const offset = (page - 1) * pageSize;

  const rows = await c.env.DB.prepare(
    `SELECT r.id, r.reporter_id AS reporterId, r.target_type AS targetType, r.target_id AS targetId,
            r.reason, r.detail, r.status, r.resolver_id AS resolverId,
            r.created_at AS createdAt, r.resolved_at AS resolvedAt,
            u.email AS reporterEmail
     FROM reports r LEFT JOIN users u ON u.id = r.reporter_id
     ${whereSql}
     ORDER BY r.created_at DESC
     LIMIT ${pageSize} OFFSET ${offset}`,
  )
    .bind(...(args as never[]))
    .all();
  const total = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM reports r ${whereSql}`)
    .bind(...(args as never[]))
    .first<{ n: number }>();

  return c.json({
    rows: rows.results,
    total: total?.n ?? 0,
    page,
    pageSize,
    pageCount: Math.ceil((total?.n ?? 0) / pageSize) || 1,
  });
});

/** Best-effort human-readable snapshot of what was reported — never invented,
 *  just a lookup; a target that no longer exists (deleted since) shows "—". */
async function resolveReportTarget(
  c: { env: Env },
  targetType: string,
  targetId: string,
): Promise<Record<string, unknown> | null> {
  const db = createDb(c.env);
  if (targetType === "activity") {
    const a = await db.query.activities.findFirst({
      where: eq(activities.id, targetId),
      columns: { id: true, title: true, city: true, status: true },
    });
    return a ?? null;
  }
  if (targetType === "group") {
    const g = await db.query.groups.findFirst({
      where: eq(groups.id, targetId),
      columns: { id: true, name: true, status: true },
    });
    return g ?? null;
  }
  if (targetType === "member") {
    const u = await db.query.users.findFirst({
      where: eq(users.id, targetId),
      columns: { id: true, email: true, status: true },
    });
    return u ?? null;
  }
  if (targetType === "message") {
    const row = await c.env.DB.prepare(
      `SELECT id, group_id AS groupId, body, created_at AS createdAt FROM messages WHERE id = ?1`,
    )
      .bind(targetId)
      .first();
    return row ?? null;
  }
  return null;
}

app.get("/reports/:id", async (c) => {
  const db = createDb(c.env);
  const report = await db.query.reports.findFirst({ where: eq(reports.id, c.req.param("id")) });
  if (!report) throw notFound("Report not found.");
  const [reporter, resolver, target] = await Promise.all([
    db.query.users.findFirst({ where: eq(users.id, report.reporterId), columns: { id: true, email: true } }),
    report.resolverId
      ? db.query.users.findFirst({ where: eq(users.id, report.resolverId!), columns: { id: true, email: true } })
      : Promise.resolve(null),
    resolveReportTarget(c, report.targetType, report.targetId),
  ]);
  return c.json({ report, reporter, resolver, target });
});

app.patch("/reports/:id", async (c) => {
  const db = createDb(c.env);
  const body = await parseBody(
    c,
    z.object({
      status: z.enum(["open", "reviewing", "resolved", "dismissed"]).optional(),
      notes: z.string().max(2000).nullable().optional(),
    }),
  );
  if (Object.keys(body).length === 0) throw badRequest("Nothing to update.");
  await db
    .update(reports)
    .set({
      ...(body.status ? { status: body.status } : {}),
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
      ...(body.status && (body.status === "resolved" || body.status === "dismissed")
        ? { resolverId: c.get("adminUserId"), resolvedAt: Math.floor(Date.now() / 1000) }
        : body.status
          ? { resolverId: null, resolvedAt: null }
          : {}),
    })
    .where(eq(reports.id, c.req.param("id")));
  return c.json({ ok: true });
});

export default app;
