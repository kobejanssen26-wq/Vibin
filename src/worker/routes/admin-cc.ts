/**
 * Owner Command Center — data API (`/api/admin/cc/*`).
 *
 * Every route here is already behind `withAdminSession` + `requireOwner()`
 * (see index.ts): a live, MFA-verified admin session whose account still has
 * role='owner', re-checked from the database on every request.
 *
 * All numbers are computed from real rows. Where a metric genuinely has no
 * data the response carries a null / zero and the client shows
 * "Not enough data yet" — nothing is invented.
 */
import { Hono } from "hono";
import { and, desc, gte, lt, sql, eq, ne, inArray } from "drizzle-orm";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import type { Env, Vars } from "../env";
import { createDb } from "../db/client";
import {
  activities,
  activityCategories,
  activityVotes,
  analyticsEvents,
  auditLog,
  groupInvites,
  groupMembers,
  groups,
  groupSettings,
  matches,
  plans,
  reports,
  supportTickets,
  users,
} from "../db/schema";
import { z } from "zod";
import { parseRange, pctDelta } from "../lib/range";
import { hasEncryptionKey } from "../lib/crypto-box";
import { badRequest, forbidden, notFound } from "../lib/errors";
import { newId, newInviteCode } from "../lib/id";
import { verifyPassword } from "../lib/password";
import { groupNameSchema, parseBody } from "../lib/validate";
import { CSV_BOM, toCsvLine } from "../lib/csv";
import {
  ACTIVITY_CSV_COLUMNS,
  EXPORT_HEADERS,
  IMPORT_TEMPLATE_HEADERS,
} from "../lib/activity-csv-columns";
import { audit } from "../lib/audit";
import { SETTINGS, getSetting, setSetting } from "../lib/system-settings";

type Ctx = { Bindings: Env; Variables: Vars };
const app = new Hono<Ctx>();

/* --------------------------- small query helpers --------------------------- */

async function scalar(q: Promise<{ n: number }[]>): Promise<number> {
  return (await q).at(0)?.n ?? 0;
}
const COUNT = { n: sql<number>`count(*)` };

/** Shared list-query params: ?q=&page=&pageSize=&sort=&order= */
function listParams(url: URL, sortable: string[], defSort: string) {
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const pageSize = Math.min(
    100,
    Math.max(5, Number(url.searchParams.get("pageSize")) || 25),
  );
  const q = (url.searchParams.get("q") || "").trim().slice(0, 120);
  const sortReq = url.searchParams.get("sort") || defSort;
  const sort = sortable.includes(sortReq) ? sortReq : defSort;
  const order =
    (url.searchParams.get("order") || "desc").toLowerCase() === "asc"
      ? "asc"
      : "desc";
  return { page, pageSize, q, sort, order, offset: (page - 1) * pageSize };
}

function pageMeta(total: number, page: number, pageSize: number) {
  return { total, page, pageSize, pageCount: Math.ceil(total / pageSize) || 1 };
}

/* -------------------------------- overview -------------------------------- */

app.get("/overview", async (c) => {
  const db = createDb(c.env);
  const r = parseRange(new URL(c.req.url).searchParams);

  const inCur = (col: AnySQLiteColumn) =>
    and(gte(col, r.from), lt(col, r.to));
  const inPrev = (col: AnySQLiteColumn) =>
    and(gte(col, r.prevFrom), lt(col, r.prevTo));

  /* users */
  const usersTotal = await scalar(
    db.select(COUNT).from(users).where(ne(users.status, "deleted")),
  );
  const usersNewCur = await scalar(
    db.select(COUNT).from(users).where(inCur(users.createdAt)),
  );
  const usersNewPrev = await scalar(
    db.select(COUNT).from(users).where(inPrev(users.createdAt)),
  );
  const activeCur = await scalar(
    db
      .select({ n: sql<number>`count(distinct ${analyticsEvents.userId})` })
      .from(analyticsEvents)
      .where(
        and(
          gte(analyticsEvents.createdAt, r.from),
          lt(analyticsEvents.createdAt, r.to),
          sql`${analyticsEvents.userId} is not null`,
        ),
      ),
  );
  const activePrev = await scalar(
    db
      .select({ n: sql<number>`count(distinct ${analyticsEvents.userId})` })
      .from(analyticsEvents)
      .where(
        and(
          gte(analyticsEvents.createdAt, r.prevFrom),
          lt(analyticsEvents.createdAt, r.prevTo),
          sql`${analyticsEvents.userId} is not null`,
        ),
      ),
  );

  /* groups */
  const groupsTotal = await scalar(db.select(COUNT).from(groups));
  const groupsActive = await scalar(
    db
      .select(COUNT)
      .from(groups)
      .where(inArray(groups.status, ["swiping", "date_matching", "planned"])),
  );
  const groupsNewCur = await scalar(
    db.select(COUNT).from(groups).where(inCur(groups.createdAt)),
  );
  const groupsNewPrev = await scalar(
    db.select(COUNT).from(groups).where(inPrev(groups.createdAt)),
  );

  /* swipes — authoritative from activity_votes */
  const voteCounts = await db
    .select({ value: activityVotes.value, n: sql<number>`count(*)` })
    .from(activityVotes)
    .where(inCur(activityVotes.createdAt))
    .groupBy(activityVotes.value);
  const vc = Object.fromEntries(voteCounts.map((v) => [v.value, v.n]));
  const likes = vc.like ?? 0;
  const passes = vc.nope ?? 0;
  const superlikes = vc.superlike ?? 0;
  const swipesTotal = likes + passes + superlikes;
  const swipesPrev = await scalar(
    db.select(COUNT).from(activityVotes).where(inPrev(activityVotes.createdAt)),
  );

  /* matches & plans */
  const matchActivity = await scalar(
    db.select(COUNT).from(matches).where(inCur(matches.matchedAt)),
  );
  const matchDate = await scalar(
    db
      .select(COUNT)
      .from(matches)
      .where(
        and(
          eq(matches.status, "complete"),
          gte(matches.completedAt, r.from),
          lt(matches.completedAt, r.to),
        ),
      ),
  );
  const plansCur = await scalar(
    db.select(COUNT).from(plans).where(inCur(plans.createdAt)),
  );

  /* activity catalogue */
  const actActive = await scalar(
    db
      .select(COUNT)
      .from(activities)
      .where(and(eq(activities.active, 1), ne(activities.status, "inactive"))),
  );
  const actNeedsReview = await scalar(
    db.select(COUNT).from(activities).where(eq(activities.status, "needs_review")),
  );
  const actOutdated = await scalar(
    db.select(COUNT).from(activities).where(eq(activities.status, "outdated")),
  );
  const actInactive = await scalar(
    db
      .select(COUNT)
      .from(activities)
      .where(sql`${activities.active} = 0 or ${activities.status} = 'inactive'`),
  );
  const openReports = await scalar(
    db.select(COUNT).from(reports).where(eq(reports.status, "open")),
  );
  const openTickets = await scalar(
    db.select(COUNT).from(supportTickets).where(eq(supportTickets.status, "open")),
  );

  /* system — only report "operational" for things actually checked now */
  const system: { name: string; status: string; detail: string }[] = [];
  system.push({ name: "Database (D1)", status: "operational", detail: "queried ok" });
  try {
    await c.env.KV.get("__cc_health");
    system.push({ name: "KV store", status: "operational", detail: "read ok" });
  } catch {
    system.push({ name: "KV store", status: "down", detail: "read failed" });
  }
  system.push({
    name: "Encryption key",
    status: hasEncryptionKey(c.env) ? "operational" : "down",
    detail: hasEncryptionKey(c.env) ? "configured" : "ENCRYPTION_KEY missing",
  });
  system.push({
    name: "Email",
    status: c.env.EMAIL_API_KEY ? "operational" : "unknown",
    detail: c.env.EMAIL_API_KEY ? "provider key set" : "not configured (dev logs)",
  });
  system.push({
    name: "Break-glass recovery",
    status: c.env.OWNER_RECOVERY_SECRET ? "operational" : "unknown",
    detail: c.env.OWNER_RECOVERY_SECRET ? "configured" : "not configured",
  });
  system.push({
    name: "Object storage (R2)",
    status: c.env.MEDIA ? "operational" : "unknown",
    detail: c.env.MEDIA ? "bound" : "not enabled (avatars use initials)",
  });

  /* attention */
  const attention: { level: "info" | "warn" | "crit"; text: string; href?: string }[] =
    [];
  if (!hasEncryptionKey(c.env))
    attention.push({
      level: "crit",
      text: "ENCRYPTION_KEY is not set — the credential vault and TOTP secrets cannot be stored.",
    });
  if (actNeedsReview > 0)
    attention.push({
      level: "warn",
      text: `${actNeedsReview} activit${actNeedsReview === 1 ? "y needs" : "ies need"} verification.`,
      href: "/admin/activities?status=needs_review",
    });
  if (actOutdated > 0)
    attention.push({
      level: "warn",
      text: `${actOutdated} activit${actOutdated === 1 ? "y is" : "ies are"} marked outdated.`,
      href: "/admin/activities?status=outdated",
    });
  if (openReports > 0)
    attention.push({
      level: "info",
      text: `${openReports} open user report${openReports === 1 ? "" : "s"}.`,
      href: "/admin/reports?status=open",
    });
  if (openTickets > 0)
    attention.push({
      level: "warn",
      text: `${openTickets} support ticket${openTickets === 1 ? "" : "s"} waiting for a reply.`,
      href: "/admin/support?status=open",
    });

  return c.json({
    range: { from: r.from, to: r.to, label: r.label },
    users: {
      total: usersTotal,
      newInRange: {
        value: usersNewCur,
        delta: pctDelta(usersNewCur, usersNewPrev),
      },
      activeInRange: {
        value: activeCur,
        delta: pctDelta(activeCur, activePrev),
      },
    },
    groups: {
      total: groupsTotal,
      active: groupsActive,
      newInRange: {
        value: groupsNewCur,
        delta: pctDelta(groupsNewCur, groupsNewPrev),
      },
    },
    swipes: {
      total: swipesTotal,
      likes,
      passes,
      superlikes,
      likeRate: swipesTotal > 0 ? (likes + superlikes) / swipesTotal : null,
      delta: pctDelta(swipesTotal, swipesPrev),
    },
    matches: { activity: matchActivity, date: matchDate, plans: plansCur },
    activities: {
      active: actActive,
      needsReview: actNeedsReview,
      outdated: actOutdated,
      inactive: actInactive,
    },
    system,
    attention,
  });
});

/* ------------------------------ global search ------------------------------ */
/** One box, five tables — capped small per category so it stays instant even
 *  at this catalogue's size. Exact-id matches first, then a LIKE scan. */
app.get("/search", async (c) => {
  const q = (new URL(c.req.url).searchParams.get("q") || "").trim().slice(0, 120);
  if (q.length < 2) return c.json({ users: [], groups: [], activities: [], reports: [], tickets: [] });
  const like = `%${q}%`;

  const [users_, groups_, activities_, reports_, tickets_] = await Promise.all([
    c.env.DB.prepare(
      `SELECT u.id, u.email, p.display_name AS displayName
       FROM users u LEFT JOIN profiles p ON p.user_id = u.id
       WHERE u.id = ?2 OR u.email_normalized LIKE ?1 OR p.display_name LIKE ?1
       LIMIT 5`,
    )
      .bind(like, q)
      .all<{ id: string; email: string; displayName: string | null }>(),
    c.env.DB.prepare(
      `SELECT id, name, status FROM groups WHERE id = ?2 OR name LIKE ?1 LIMIT 5`,
    )
      .bind(like, q)
      .all<{ id: string; name: string; status: string }>(),
    c.env.DB.prepare(
      `SELECT id, title, city, status FROM activities WHERE id = ?2 OR title LIKE ?1 LIMIT 5`,
    )
      .bind(like, q)
      .all<{ id: string; title: string; city: string | null; status: string }>(),
    c.env.DB.prepare(
      `SELECT id, target_type AS targetType, target_id AS targetId, reason, status FROM reports WHERE id = ?2 OR target_id = ?2 OR reason LIKE ?1 LIMIT 5`,
    )
      .bind(like, q)
      .all<{ id: string; targetType: string; targetId: string; reason: string; status: string }>(),
    c.env.DB.prepare(
      `SELECT t.id, t.subject, t.status, u.email AS userEmail
       FROM support_tickets t JOIN users u ON u.id = t.user_id
       WHERE t.id = ?2 OR t.subject LIKE ?1 OR u.email_normalized LIKE ?1 LIMIT 5`,
    )
      .bind(like, q)
      .all<{ id: string; subject: string; status: string; userEmail: string }>(),
  ]);

  return c.json({
    users: users_.results,
    groups: groups_.results,
    activities: activities_.results,
    reports: reports_.results,
    tickets: tickets_.results,
  });
});

/* --------------------------------- users --------------------------------- */

const USER_SORT: Record<string, string> = {
  created: "u.created_at",
  email: "u.email_normalized",
  active: "last_active_at",
  groups: "group_count",
};

app.get("/users", async (c) => {
  const url = new URL(c.req.url);
  const { page, pageSize, q, sort, order, offset } = listParams(
    url,
    Object.keys(USER_SORT),
    "created",
  );
  const status = url.searchParams.get("status");
  const validStatus =
    status && ["active", "suspended", "deleted"].includes(status) ? status : null;

  const where: string[] = [];
  const args: unknown[] = [];
  if (q) {
    where.push("(u.email_normalized LIKE ?1 OR u.id = ?2 OR p.display_name LIKE ?1)");
    args.push(`%${q.toLowerCase()}%`, q);
  }
  if (validStatus) {
    where.push(`u.status = ?${args.length + 1}`);
    args.push(validStatus);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const orderSql = `${USER_SORT[sort]} ${order.toUpperCase()}`;

  const rows = await c.env.DB.prepare(
    `SELECT u.id, u.email, u.role, u.status, u.created_at AS createdAt,
            p.display_name AS displayName,
            (SELECT COUNT(*) FROM group_members gm WHERE gm.user_id = u.id AND gm.status IN ('active','inactive')) AS group_count,
            (SELECT COUNT(*) FROM activity_votes av WHERE av.user_id = u.id) AS vote_count,
            (SELECT MAX(ce) FROM (
               SELECT MAX(created_at) AS ce FROM analytics_events WHERE user_id = u.id
               UNION ALL SELECT MAX(created_at) FROM activity_votes WHERE user_id = u.id
               UNION ALL SELECT MAX(created_at) FROM messages WHERE user_id = u.id
            )) AS last_active_at
     FROM users u LEFT JOIN profiles p ON p.user_id = u.id
     ${whereSql}
     ORDER BY ${orderSql}
     LIMIT ${pageSize} OFFSET ${offset}`,
  )
    .bind(...(args as never[]))
    .all<{
      id: string;
      email: string;
      role: string;
      status: string;
      createdAt: number;
      displayName: string | null;
      group_count: number;
      vote_count: number;
      last_active_at: number | null;
    }>();
  const totalCount = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM users u LEFT JOIN profiles p ON p.user_id = u.id ${whereSql}`,
  )
    .bind(...(args as never[]))
    .first<{ n: number }>();

  return c.json({
    rows: rows.results.map((r) => ({
      id: r.id,
      email: r.email,
      displayName: r.displayName,
      role: r.role,
      status: r.status,
      createdAt: r.createdAt,
      groupCount: r.group_count,
      voteCount: r.vote_count,
      lastActiveAt: r.last_active_at,
    })),
    ...pageMeta(totalCount?.n ?? 0, page, pageSize),
  });
});

app.get("/users/:id", async (c) => {
  const db = createDb(c.env);
  const id = c.req.param("id");
  const u = await db
    .select({
      id: users.id,
      email: users.email,
      role: users.role,
      status: users.status,
      emailVerifiedAt: users.emailVerifiedAt,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    })
    .from(users)
    .where(eq(users.id, id))
    .get();
  if (!u) throw notFound("User not found.");

  const profile = await c.env.DB.prepare(
    `SELECT display_name AS displayName, age, location_label AS locationLabel, bio FROM profiles WHERE user_id = ?1`,
  )
    .bind(id)
    .first<{
      displayName: string | null;
      age: number | null;
      locationLabel: string | null;
      bio: string | null;
    }>();

  const groupRows = await c.env.DB.prepare(
    `SELECT g.id, g.name, g.status, gm.role AS memberRole, gm.status AS memberStatus, gm.joined_at AS joinedAt
     FROM group_members gm JOIN groups g ON g.id = gm.group_id
     WHERE gm.user_id = ?1 ORDER BY gm.joined_at DESC`,
  )
    .bind(id)
    .all();

  const votes = await c.env.DB.prepare(
    `SELECT value, COUNT(*) AS n FROM activity_votes WHERE user_id = ?1 GROUP BY value`,
  )
    .bind(id)
    .all<{ value: string; n: number }>();
  const vc = Object.fromEntries(votes.results.map((v) => [v.value, v.n]));

  const planCount = await c.env.DB.prepare(
    `SELECT COUNT(DISTINCT p.id) AS n FROM plans p
     JOIN group_members gm ON gm.group_id = p.group_id
     WHERE gm.user_id = ?1 AND gm.status IN ('active','inactive')`,
  )
    .bind(id)
    .first<{ n: number }>();

  const timeline = await c.env.DB.prepare(
    `SELECT name, activity_id AS activityId, group_id AS groupId, created_at AS createdAt
     FROM analytics_events WHERE user_id = ?1 ORDER BY created_at DESC LIMIT 40`,
  )
    .bind(id)
    .all();

  const recentSwipes = await c.env.DB.prepare(
    `SELECT av.value, av.created_at AS createdAt, a.title, a.category_id AS category
     FROM activity_votes av JOIN activities a ON a.id = av.activity_id
     WHERE av.user_id = ?1 ORDER BY av.created_at DESC LIMIT 20`,
  )
    .bind(id)
    .all();

  const createdGroups = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM groups WHERE creator_id = ?1`,
  )
    .bind(id)
    .first<{ n: number }>();

  const modRows = await db
    .select({
      action: auditLog.action,
      meta: auditLog.meta,
      createdAt: auditLog.createdAt,
      actorEmail: users.email,
    })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.actorId))
    .where(
      and(
        eq(auditLog.targetType, "user"),
        eq(auditLog.targetId, id),
        inArray(auditLog.action, ["user.suspended", "user.reactivated"]),
      ),
    )
    .orderBy(desc(auditLog.createdAt))
    .limit(20);
  const moderationHistory = modRows.map((r) => ({
    action: r.action,
    reason: (JSON.parse(r.meta) as { reason?: string }).reason ?? null,
    actorEmail: r.actorEmail,
    createdAt: r.createdAt,
  }));

  return c.json({
    user: { ...u, ...(profile ?? {}) },
    groups: groupRows.results,
    activity: {
      likes: vc.like ?? 0,
      passes: vc.nope ?? 0,
      superlikes: vc.superlike ?? 0,
      total: (vc.like ?? 0) + (vc.nope ?? 0) + (vc.superlike ?? 0),
    },
    plans: planCount?.n ?? 0,
    createdGroups: createdGroups?.n ?? 0,
    recentSwipes: recentSwipes.results,
    timeline: timeline.results,
    moderationHistory,
  });
});

/* --------------------------- user moderation --------------------------- */

app.post("/users/:id/status", async (c) => {
  const id = c.req.param("id");
  const { status, reason } = await parseBody(
    c,
    z.object({
      status: z.enum(["active", "suspended"]),
      reason: z.string().trim().max(500).optional(),
    }),
  );
  if (status === "suspended" && !reason) {
    throw badRequest("A reason is required to suspend an account.");
  }
  const db = createDb(c.env);
  const target = await db.query.users.findFirst({
    where: eq(users.id, id),
    columns: { id: true, role: true },
  });
  if (!target) throw notFound("User not found.");
  if (target.role === "owner") throw badRequest("The owner account cannot be suspended.");

  await db
    .update(users)
    .set({ status, updatedAt: Math.floor(Date.now() / 1000) })
    .where(eq(users.id, id));
  await audit(c, {
    action: status === "suspended" ? "user.suspended" : "user.reactivated",
    targetType: "user",
    targetId: id,
    meta: reason ? { reason } : {},
  });
  return c.json({ ok: true });
});

app.delete("/users/:id", async (c) => {
  const id = c.req.param("id");
  const { password } = await parseBody(
    c,
    z.object({ password: z.string().min(1).max(200) }),
  );
  const db = createDb(c.env);

  // sensitive action -> fresh password re-entry
  const me = await db.query.users.findFirst({
    where: eq(users.id, c.get("adminUserId")!),
    columns: { passwordHash: true },
  });
  const { ok } = await verifyPassword(password, me?.passwordHash ?? "");
  if (!ok) throw forbidden("Password re-entry failed.");

  const target = await db.query.users.findFirst({
    where: eq(users.id, id),
    columns: { id: true, role: true, email: true },
  });
  if (!target) throw notFound("User not found.");
  if (target.role === "owner")
    throw badRequest("The owner account cannot be deleted here.");
  if (id === c.get("adminUserId"))
    throw badRequest("You cannot delete your own account.");

  // Hard delete. FKs cascade: group_members, activity_votes, date_votes,
  // notifications, email_tokens, group_invites, reports(reporter). Groups this
  // user created cascade too (and their matches / plans / pool / messages).
  // analytics_events.user_id and audit_log.actor_id are ON DELETE SET NULL, so
  // history stays intact (§93, §95).
  await db.delete(users).where(eq(users.id, id));
  await audit(c, {
    action: "user.deleted",
    targetType: "user",
    targetId: id,
    meta: { email: target.email },
  });
  return c.json({ ok: true });
});

/** Bulk delete. Same rules as the single delete: one fresh password re-entry,
 *  owner + self are always skipped. Capped at 200 ids. */
app.post("/users/bulk-delete", async (c) => {
  const { ids, password } = await parseBody(
    c,
    z.object({
      ids: z.array(z.string().min(1).max(40)).min(1).max(200),
      password: z.string().min(1).max(200),
    }),
  );
  const db = createDb(c.env);
  const me = await db.query.users.findFirst({
    where: eq(users.id, c.get("adminUserId")!),
    columns: { passwordHash: true },
  });
  const { ok } = await verifyPassword(password, me?.passwordHash ?? "");
  if (!ok) throw forbidden("Password re-entry failed.");

  const requested = [...new Set(ids)];
  const uniq = requested.filter((x) => x !== c.get("adminUserId"));
  const rows = uniq.length
    ? await db.query.users.findMany({
        where: inArray(users.id, uniq),
        columns: { id: true, role: true, email: true },
      })
    : [];
  const deletable = rows.filter((r) => r.role !== "owner");

  let deleted = 0;
  for (const r of deletable) {
    await db.delete(users).where(eq(users.id, r.id));
    await audit(c, {
      action: "user.deleted",
      targetType: "user",
      targetId: r.id,
      meta: { email: r.email, bulk: true },
    });
    deleted++;
  }
  // skipped = everything asked for that wasn't deleted (self, owner, not found)
  const skipped = requested.length - deleted;
  await audit(c, {
    action: "user.bulk_deleted",
    meta: { requested: requested.length, deleted, skipped },
  });
  return c.json({ deleted, skipped });
});

/* -------------------------------- groups -------------------------------- */

const GROUP_SORT: Record<string, string> = {
  created: "g.created_at",
  name: "g.name",
  members: "member_count",
};

app.get("/groups", async (c) => {
  const url = new URL(c.req.url);
  const { page, pageSize, q, sort, order, offset } = listParams(
    url,
    Object.keys(GROUP_SORT),
    "created",
  );
  const status = url.searchParams.get("status");
  const validStatus =
    status &&
    ["configuring", "swiping", "date_matching", "planned", "archived"].includes(
      status,
    )
      ? status
      : null;

  const where: string[] = [];
  const args: unknown[] = [];
  if (q) {
    where.push("(g.name LIKE ?1 OR g.id = ?2)");
    args.push(`%${q}%`, q);
  }
  if (validStatus) {
    where.push(`g.status = ?${args.length + 1}`);
    args.push(validStatus);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const rows = await c.env.DB.prepare(
    `SELECT g.id, g.name, g.status, g.created_at AS createdAt,
            g.creator_id AS creatorId, cp.display_name AS creatorName,
            (SELECT COUNT(*) FROM group_members gm WHERE gm.group_id = g.id AND gm.status IN ('active','inactive')) AS member_count,
            (SELECT COUNT(*) FROM matches m WHERE m.group_id = g.id) AS match_count,
            (SELECT COUNT(*) FROM plans p WHERE p.group_id = g.id) AS plan_count
     FROM groups g LEFT JOIN profiles cp ON cp.user_id = g.creator_id
     ${whereSql}
     ORDER BY ${GROUP_SORT[sort]} ${order.toUpperCase()}
     LIMIT ${pageSize} OFFSET ${offset}`,
  )
    .bind(...(args as never[]))
    .all<{
      id: string;
      name: string;
      status: string;
      createdAt: number;
      creatorId: string;
      creatorName: string | null;
      member_count: number;
      match_count: number;
      plan_count: number;
    }>();
  const total = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM groups g ${whereSql}`,
  )
    .bind(...(args as never[]))
    .first<{ n: number }>();

  return c.json({
    rows: rows.results.map((r) => ({
      id: r.id,
      name: r.name,
      status: r.status,
      createdAt: r.createdAt,
      creatorId: r.creatorId,
      creatorName: r.creatorName,
      memberCount: r.member_count,
      matchCount: r.match_count,
      planCount: r.plan_count,
    })),
    ...pageMeta(total?.n ?? 0, page, pageSize),
  });
});

app.get("/groups/:id", async (c) => {
  const db = createDb(c.env);
  const id = c.req.param("id");
  const g = await db.select().from(groups).where(eq(groups.id, id)).get();
  if (!g) throw notFound("Group not found.");

  const settings = await c.env.DB.prepare(
    `SELECT * FROM group_settings WHERE group_id = ?1`,
  )
    .bind(id)
    .first();

  const members = await c.env.DB.prepare(
    `SELECT gm.user_id AS userId, gm.role, gm.status, gm.joined_at AS joinedAt,
            u.email, p.display_name AS displayName
     FROM group_members gm JOIN users u ON u.id = gm.user_id
     LEFT JOIN profiles p ON p.user_id = gm.user_id
     WHERE gm.group_id = ?1 ORDER BY gm.joined_at ASC`,
  )
    .bind(id)
    .all();

  const votes = await c.env.DB.prepare(
    `SELECT value, COUNT(*) AS n FROM activity_votes WHERE group_id = ?1 GROUP BY value`,
  )
    .bind(id)
    .all<{ value: string; n: number }>();
  const vc = Object.fromEntries(votes.results.map((v) => [v.value, v.n]));

  const matchRows = await c.env.DB.prepare(
    `SELECT m.id, m.status, m.starts_at AS startsAt, m.matched_at AS matchedAt,
            m.completed_at AS completedAt, a.title, a.category_id AS category
     FROM matches m JOIN activities a ON a.id = m.activity_id
     WHERE m.group_id = ?1 ORDER BY m.matched_at DESC`,
  )
    .bind(id)
    .all();

  const planRows = await c.env.DB.prepare(
    `SELECT p.id, p.starts_at AS startsAt, p.location_label AS locationLabel,
            p.created_at AS createdAt, a.title
     FROM plans p JOIN activities a ON a.id = p.activity_id
     WHERE p.group_id = ?1 ORDER BY p.created_at DESC`,
  )
    .bind(id)
    .all();

  const msgCount = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM messages WHERE group_id = ?1 AND kind = 'text'`,
  )
    .bind(id)
    .first<{ n: number }>();

  const deckSize = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM group_activity_pool WHERE group_id = ?1`,
  )
    .bind(id)
    .first<{ n: number }>();

  return c.json({
    group: g,
    settings,
    members: members.results,
    votes: {
      likes: vc.like ?? 0,
      passes: vc.nope ?? 0,
      superlikes: vc.superlike ?? 0,
    },
    matches: matchRows.results,
    plans: planRows.results,
    messageCount: msgCount?.n ?? 0,
    deckSize: deckSize?.n ?? 0,
  });
});

/* ------------------------------ group CRUD ------------------------------ */
/**
 * Mirrors the normal-user create flow (groups.ts POST "/"): a group row, the
 * creator as an active "creator" member, default group_settings (all
 * activities, so it's swipeable immediately), and one invite code. Additional
 * memberIds are added as active "member" rows — useful for support/testing,
 * never required.
 */
const groupCreateInput = z.object({
  name: groupNameSchema,
  creatorEmail: z.string().trim().email().max(200),
  memberEmails: z.array(z.string().trim().email().max(200)).max(50).default([]),
});

app.post("/groups", async (c) => {
  const body = await parseBody(c, groupCreateInput);
  const db = createDb(c.env);
  const creatorEmailNorm = body.creatorEmail.toLowerCase();
  const creator = await db.query.users.findFirst({
    where: eq(users.emailNormalized, creatorEmailNorm),
    columns: { id: true },
  });
  if (!creator) throw badRequest(`No user with email "${body.creatorEmail}".`);

  const memberEmailsNorm = [
    ...new Set(body.memberEmails.map((e) => e.toLowerCase()).filter((e) => e !== creatorEmailNorm)),
  ];
  let memberIds: string[] = [];
  if (memberEmailsNorm.length) {
    const found = await db.query.users.findMany({
      where: inArray(users.emailNormalized, memberEmailsNorm),
      columns: { id: true, emailNormalized: true },
    });
    if (found.length !== memberEmailsNorm.length) {
      const foundEmails = new Set(found.map((f) => f.emailNormalized));
      const missing = memberEmailsNorm.filter((e) => !foundEmails.has(e));
      throw badRequest(`No user with email: ${missing.join(", ")}.`);
    }
    memberIds = found.map((f) => f.id);
  }

  const now = Math.floor(Date.now() / 1000);
  const groupId = newId();
  await db.batch([
    db.insert(groups).values({
      id: groupId,
      name: body.name,
      creatorId: creator.id,
      status: "configuring",
      createdAt: now,
      updatedAt: now,
    }),
    db.insert(groupMembers).values({
      id: newId(),
      groupId,
      userId: creator.id,
      role: "creator",
      status: "active",
      joinedAt: now,
    }),
    db.insert(groupSettings).values({ groupId, allActivities: 1, updatedAt: now }),
    db.insert(groupInvites).values({
      id: newId(),
      groupId,
      code: newInviteCode(),
      createdBy: creator.id,
      createdAt: now,
    }),
    ...memberIds.map((userId) =>
      db.insert(groupMembers).values({
        id: newId(),
        groupId,
        userId,
        role: "member",
        status: "active",
        joinedAt: now,
      }),
    ),
  ]);
  await audit(c, {
    action: "group.created",
    targetType: "group",
    targetId: groupId,
    meta: { name: body.name, creatorEmail: body.creatorEmail, memberCount: memberIds.length },
  });
  return c.json({ id: groupId }, 201);
});

app.put("/groups/:id", async (c) => {
  const id = c.req.param("id");
  const body = await parseBody(
    c,
    z.object({
      name: groupNameSchema.optional(),
      status: z
        .enum(["configuring", "swiping", "date_matching", "planned", "archived"])
        .optional(),
    }),
  );
  const db = createDb(c.env);
  const existing = await db.query.groups.findFirst({ where: eq(groups.id, id) });
  if (!existing) throw notFound("Group not found.");

  await db
    .update(groups)
    .set({
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.status !== undefined ? { status: body.status } : {}),
      updatedAt: Math.floor(Date.now() / 1000),
    })
    .where(eq(groups.id, id));
  await audit(c, {
    action: "group.updated",
    targetType: "group",
    targetId: id,
    meta: body,
  });
  return c.json({ ok: true });
});

/** Soft-delete only — mirrors the existing user-facing DELETE /groups/:id
 *  (groups.ts): status -> "archived", nothing cascaded. Members, votes,
 *  matches and plans stay in place, just hidden behind the archived status. */
app.delete("/groups/:id", async (c) => {
  const id = c.req.param("id");
  const db = createDb(c.env);
  const existing = await db.query.groups.findFirst({
    where: eq(groups.id, id),
    columns: { id: true, status: true, name: true },
  });
  if (!existing) throw notFound("Group not found.");
  await db
    .update(groups)
    .set({ status: "archived", updatedAt: Math.floor(Date.now() / 1000) })
    .where(eq(groups.id, id));
  await audit(c, {
    action: "group.archived",
    targetType: "group",
    targetId: id,
    meta: { name: existing.name, previousStatus: existing.status },
  });
  return c.json({ ok: true });
});

app.post("/groups/:id/restore", async (c) => {
  const id = c.req.param("id");
  const db = createDb(c.env);
  const existing = await db.query.groups.findFirst({
    where: eq(groups.id, id),
    columns: { id: true, status: true },
  });
  if (!existing) throw notFound("Group not found.");
  if (existing.status !== "archived") throw badRequest("Group isn't archived.");
  await db
    .update(groups)
    .set({ status: "configuring", updatedAt: Math.floor(Date.now() / 1000) })
    .where(eq(groups.id, id));
  await audit(c, { action: "group.restored", targetType: "group", targetId: id });
  return c.json({ ok: true });
});

app.post("/groups/bulk-archive", async (c) => {
  const { ids } = await parseBody(
    c,
    z.object({ ids: z.array(z.string().min(1).max(40)).min(1).max(200) }),
  );
  const db = createDb(c.env);
  const uniq = [...new Set(ids)];
  const rows = await db.query.groups.findMany({
    where: and(inArray(groups.id, uniq), ne(groups.status, "archived")),
    columns: { id: true },
  });
  const now = Math.floor(Date.now() / 1000);
  for (const r of rows) {
    await db
      .update(groups)
      .set({ status: "archived", updatedAt: now })
      .where(eq(groups.id, r.id));
  }
  await audit(c, {
    action: "group.bulk_archived",
    meta: { requested: uniq.length, archived: rows.length },
  });
  return c.json({ archived: rows.length, skipped: uniq.length - rows.length });
});

/* ------------------------------ activities ------------------------------ */
/**
 * Real per-activity behaviour. Impressions/views/booking-clicks come from
 * analytics_events; likes/passes/matches/plans come from the relational
 * tables so the numbers are complete for data that predates event tracking.
 */
async function activityMetrics(
  env: Env,
  where: string,
  args: unknown[],
): Promise<Map<string, ActMetric>> {
  const bind = (sql: string) => env.DB.prepare(sql).bind(...(args as never[]));
  const [votes, matchRows, planRows, viewRows, bookRows, poolRows, webRows, expandRows, shareRows, calRows] =
    await Promise.all([
      bind(
        `SELECT av.activity_id AS id, av.value, COUNT(*) AS n
         FROM activity_votes av JOIN activities a ON a.id = av.activity_id
         ${where} GROUP BY av.activity_id, av.value`,
      ).all<{ id: string; value: string; n: number }>(),
      bind(
        `SELECT m.activity_id AS id, COUNT(*) AS n
         FROM matches m JOIN activities a ON a.id = m.activity_id
         ${where} GROUP BY m.activity_id`,
      ).all<{ id: string; n: number }>(),
      bind(
        `SELECT p.activity_id AS id, COUNT(*) AS n
         FROM plans p JOIN activities a ON a.id = p.activity_id
         ${where} GROUP BY p.activity_id`,
      ).all<{ id: string; n: number }>(),
      bind(
        `SELECT e.activity_id AS id, COUNT(*) AS n
         FROM analytics_events e JOIN activities a ON a.id = e.activity_id
         ${where} ${where ? "AND" : "WHERE"} e.name IN ('activity_viewed')
         GROUP BY e.activity_id`,
      ).all<{ id: string; n: number }>(),
      bind(
        `SELECT e.activity_id AS id, COUNT(*) AS n
         FROM analytics_events e JOIN activities a ON a.id = e.activity_id
         ${where} ${where ? "AND" : "WHERE"} e.name = 'booking_clicked'
         GROUP BY e.activity_id`,
      ).all<{ id: string; n: number }>(),
      bind(
        `SELECT gap.activity_id AS id, COUNT(*) AS n
         FROM group_activity_pool gap JOIN activities a ON a.id = gap.activity_id
         ${where} GROUP BY gap.activity_id`,
      ).all<{ id: string; n: number }>(),
      bind(
        `SELECT e.activity_id AS id, COUNT(*) AS n
         FROM analytics_events e JOIN activities a ON a.id = e.activity_id
         ${where} ${where ? "AND" : "WHERE"} e.name = 'activity_website_clicked'
         GROUP BY e.activity_id`,
      ).all<{ id: string; n: number }>(),
      bind(
        `SELECT e.activity_id AS id, COUNT(*) AS n
         FROM analytics_events e JOIN activities a ON a.id = e.activity_id
         ${where} ${where ? "AND" : "WHERE"} e.name = 'activity_expanded'
         GROUP BY e.activity_id`,
      ).all<{ id: string; n: number }>(),
      bind(
        `SELECT e.activity_id AS id, COUNT(*) AS n
         FROM analytics_events e JOIN activities a ON a.id = e.activity_id
         ${where} ${where ? "AND" : "WHERE"} e.name = 'activity_shared'
         GROUP BY e.activity_id`,
      ).all<{ id: string; n: number }>(),
      bind(
        `SELECT e.activity_id AS id, COUNT(*) AS n
         FROM analytics_events e JOIN activities a ON a.id = e.activity_id
         ${where} ${where ? "AND" : "WHERE"} e.name = 'calendar_action'
         GROUP BY e.activity_id`,
      ).all<{ id: string; n: number }>(),
    ]);

  const m = new Map<string, ActMetric>();
  const get = (id: string) => {
    let x = m.get(id);
    if (!x) {
      x = emptyMetric();
      m.set(id, x);
    }
    return x;
  };
  for (const v of votes.results) {
    const x = get(v.id);
    if (v.value === "like") x.likes = v.n;
    else if (v.value === "nope") x.passes = v.n;
    else if (v.value === "superlike") x.superlikes = v.n;
  }
  for (const r of matchRows.results) get(r.id).matches = r.n;
  for (const r of planRows.results) get(r.id).plans = r.n;
  for (const r of viewRows.results) get(r.id).views = r.n;
  for (const r of bookRows.results) get(r.id).bookingClicks = r.n;
  for (const r of poolRows.results) get(r.id).pooled = r.n;
  for (const r of webRows.results) get(r.id).websiteClicks = r.n;
  for (const r of expandRows.results) get(r.id).expanded = r.n;
  for (const r of shareRows.results) get(r.id).shares = r.n;
  for (const r of calRows.results) get(r.id).calendarAdds = r.n;
  return m;
}

interface ActMetric {
  likes: number;
  passes: number;
  superlikes: number;
  matches: number;
  plans: number;
  views: number;
  bookingClicks: number;
  pooled: number;
  websiteClicks: number;
  expanded: number;
  shares: number;
  calendarAdds: number;
}

const emptyMetric = (): ActMetric => ({
  likes: 0,
  passes: 0,
  superlikes: 0,
  matches: 0,
  plans: 0,
  views: 0,
  bookingClicks: 0,
  pooled: 0,
  websiteClicks: 0,
  expanded: 0,
  shares: 0,
  calendarAdds: 0,
});

function derive(x: ActMetric) {
  const swipes = x.likes + x.passes + x.superlikes;
  const outboundClicks = x.bookingClicks + x.websiteClicks;
  return {
    ...x,
    swipes,
    outboundClicks,
    likeRate: swipes > 0 ? (x.likes + x.superlikes) / swipes : null,
    matchRate: x.pooled > 0 ? x.matches / x.pooled : null,
    planConversion: x.matches > 0 ? x.plans / x.matches : null,
    // view -> click and like -> click conversion (§6). Never a "sale" — a
    // click only ever means VIBIN sent someone to the destination (§15/§44).
    viewToClickRate: x.views > 0 ? outboundClicks / x.views : null,
    likeToClickRate: x.likes + x.superlikes > 0 ? outboundClicks / (x.likes + x.superlikes) : null,
    matchToClickRate: x.matches > 0 ? outboundClicks / x.matches : null,
  };
}

const ACT_SORT = new Set([
  "updated",
  "title",
  "status",
  "views",
  "likes",
  "passes",
  "likeRate",
  "matches",
  "plans",
  "bookingClicks",
]);

app.get("/activities", async (c) => {
  const url = new URL(c.req.url);
  const { page, pageSize, q, offset } = listParams(url, ["updated"], "updated");
  const sortReq = url.searchParams.get("sort") || "updated";
  const sort = ACT_SORT.has(sortReq) ? sortReq : "updated";
  const order =
    (url.searchParams.get("order") || "desc").toLowerCase() === "asc"
      ? "ASC"
      : "DESC";
  const status = url.searchParams.get("status");
  const category = url.searchParams.get("category");
  const activeParam = url.searchParams.get("active");

  const where: string[] = [];
  const args: unknown[] = [];
  if (q) {
    args.push(`%${q}%`, q);
    where.push(`(a.title LIKE ?${args.length - 1} OR a.id = ?${args.length})`);
  }
  if (
    status &&
    ["verified", "needs_review", "outdated", "inactive"].includes(status)
  ) {
    args.push(status);
    where.push(`a.status = ?${args.length}`);
  }
  if (category) {
    args.push(category);
    where.push(`a.category_id = ?${args.length}`);
  }
  if (activeParam === "1" || activeParam === "0") {
    args.push(Number(activeParam));
    where.push(`a.active = ?${args.length}`);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const total = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM activities a ${whereSql}`,
  )
    .bind(...(args as never[]))
    .first<{ n: number }>();

  // For behavioural sorts we need metrics for the whole filtered set, then
  // sort + paginate in JS. Catalogue is small (hundreds), so this is fine.
  const behavioural = [
    "views",
    "likes",
    "passes",
    "likeRate",
    "matches",
    "plans",
    "bookingClicks",
  ].includes(sort);

  const baseRows = await c.env.DB.prepare(
    `SELECT a.id, a.title, a.category_id AS category, a.city, a.status,
            a.active, a.price_type AS priceType, a.price_cents AS priceCents,
            a.provider, a.last_verified_at AS lastVerifiedAt,
            a.image_url AS imageUrl, a.updated_at AS updatedAt
     FROM activities a ${whereSql}
     ${behavioural ? "" : `ORDER BY a.${sqlCol(sort)} ${order} LIMIT ${pageSize} OFFSET ${offset}`}`,
  )
    .bind(...(args as never[]))
    .all<Record<string, unknown>>();

  const metrics = await activityMetrics(c.env, whereSql, args);
  let rows = baseRows.results.map((r) => {
    const m = derive(metrics.get(r.id as string) ?? emptyMetric());
    return { ...r, metrics: m };
  });

  if (behavioural) {
    const key = sort as keyof ReturnType<typeof derive>;
    rows.sort((a, b) => {
      const av = (a.metrics[key] as number) ?? -1;
      const bv = (b.metrics[key] as number) ?? -1;
      return order === "ASC" ? av - bv : bv - av;
    });
    rows = rows.slice(offset, offset + pageSize);
  }

  return c.json({ rows, ...pageMeta(total?.n ?? 0, page, pageSize) });
});

function sqlCol(sort: string): string {
  return sort === "title"
    ? "title"
    : sort === "status"
      ? "status"
      : "updated_at";
}

/**
 * CSV export (§8/§58) — the full activity record (same columns the CSV
 * import template uses, so export -> edit -> re-import round-trips), plus
 * engagement metrics. A UTF-8 BOM is included so Excel — not just Sheets or a
 * raw parser — renders Dutch/French accented characters correctly instead of
 * guessing the system codepage; every cell goes through escapeCsvCell so
 * commas/quotes/newlines are safe AND a value starting with = + - @ can't be
 * interpreted as a spreadsheet formula (§33). No credentials or per-user PII
 * are in this table, so none can leak here.
 *
 * MUST be registered before GET /activities/:id — Hono's router falls back to
 * registration order for overlapping patterns, and "export.csv"/"import"
 * would otherwise be swallowed by :id and return a fake "Activity not found"
 * (this was the exact live bug behind the "CSV export doesn't work" report).
 */
app.get("/activities/export.csv", async (c) => {
  const rows = await c.env.DB.prepare(`SELECT * FROM activities ORDER BY title`).all<
    Record<string, unknown>
  >();
  const metrics = await activityMetrics(c.env, "", []);

  const cols = [
    ...EXPORT_HEADERS,
    "impressions",
    "views",
    "likes",
    "passes",
    "matches",
    "plans",
    "website_clicks",
    "booking_clicks",
    "outbound_clicks",
    "calendar_adds",
    "shares",
  ];
  const lines = [toCsvLine(cols)];
  for (const r of rows.results) {
    const m = derive(metrics.get(r.id as string) ?? emptyMetric());
    const cells: (string | number | null)[] = [r.id as string];
    for (const col of ACTIVITY_CSV_COLUMNS) {
      const raw = r[camelToSnake(col.key)];
      if (col.key === "tags") {
        cells.push(col.format(typeof raw === "string" ? safeJsonArray(raw) : []));
      } else if (col.key === "openingHours") {
        cells.push(col.format(typeof raw === "string" ? safeJsonObject(raw) : {}));
      } else {
        cells.push(col.format(raw));
      }
    }
    cells.push(
      r.last_verified_at as number | null,
      r.created_at as number,
      r.updated_at as number,
      m.pooled,
      m.views,
      m.likes + m.superlikes,
      m.passes,
      m.matches,
      m.plans,
      m.websiteClicks,
      m.bookingClicks,
      m.outboundClicks,
      m.calendarAdds,
      m.shares,
    );
    lines.push(toCsvLine(cells));
  }
  return new Response(CSV_BOM + lines.join("\r\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="vibin-activities-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
});

/** Blank template (header row only) so an admin's import always matches the
 *  live schema/import logic — never a hand-guessed column list (§9). */
app.get("/activities/import/template.csv", async (c) => {
  return new Response(CSV_BOM + toCsvLine(IMPORT_TEMPLATE_HEADERS), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="vibin-activities-template.csv"`,
    },
  });
});

app.get("/activities/:id", async (c) => {
  const id = c.req.param("id");
  const a = await c.env.DB.prepare(`SELECT * FROM activities WHERE id = ?1`)
    .bind(id)
    .first<Record<string, unknown>>();
  if (!a) throw notFound("Activity not found.");

  const metrics = derive(
    (await activityMetrics(c.env, "WHERE a.id = ?1", [id])).get(id) ?? emptyMetric(),
  );

  const provider = a.provider_id
    ? await c.env.DB.prepare(`SELECT * FROM providers WHERE id = ?1`)
        .bind(a.provider_id)
        .first()
    : null;

  const recentGroups = await c.env.DB.prepare(
    `SELECT DISTINCT g.id, g.name, g.status
     FROM matches m JOIN groups g ON g.id = m.group_id
     WHERE m.activity_id = ?1 ORDER BY m.matched_at DESC LIMIT 10`,
  )
    .bind(id)
    .all();

  /* internal quality score — factual completeness only, never shown to users */
  const q = qualityScore(a);

  return c.json({
    activity: a,
    metrics,
    provider,
    matchedGroups: recentGroups.results,
    quality: q,
    qualityBreakdown: qualityBreakdown(a),
  });
});

/**
 * Per-aspect 0-5 quality breakdown (§39) — lets Admin see *which* aspect of
 * an activity is weak (e.g. price 2/5 while description is 5/5) instead of
 * one blended score. Reuses the enrichment-pipeline fields when a real
 * assessment has been made; falls back to a conservative guess from what's
 * on file for never-enriched rows, and is always honest about "unknown"
 * rather than inventing a mid score.
 */
function qualityBreakdown(a: Record<string, unknown>) {
  const OSM_BOILERPLATE = /From OpenStreetMap\s*[—-]\s*not yet verified by VIBIN/i;
  const rawDesc = typeof a.description === "string" ? a.description : "";
  const hasShortDesc = typeof a.short_description === "string" && a.short_description.length > 0;
  const description = hasShortDesc
    ? 5
    : rawDesc && !OSM_BOILERPLATE.test(rawDesc)
      ? 3
      : rawDesc
        ? 1
        : 0;

  const imgScore = a.image_quality_score;
  const image =
    typeof imgScore === "number"
      ? imgScore
      : !isUrl(a.image_url)
        ? 0
        : a.image_is_generic
          ? 2
          : 3;

  const price =
    a.price_confidence === "exact"
      ? 5
      : a.price_type === "free"
        ? 5
        : a.price_min_cents != null || a.price_confidence === "estimate"
          ? 3
          : a.price_band && a.price_type === "varies"
            ? 2
            : a.price_cents != null
              ? 4
              : 0;

  let hoursCount = 0;
  try {
    const parsed = JSON.parse(typeof a.opening_hours === "string" ? a.opening_hours : "{}");
    hoursCount = parsed && typeof parsed === "object" ? Object.keys(parsed).length : 0;
  } catch {
    hoursCount = 0;
  }
  const openingHours = hoursCount > 0 ? 4 : 0;

  const website = isUrl(a.website_url) || isUrl(a.provider_website) ? 5 : 0;
  const location = a.lat != null && a.lng != null ? (a.address ? 5 : 3) : 0;

  const needsReview: string[] = [];
  if (description < 3) needsReview.push("description");
  if (image < 3) needsReview.push("image");
  if (price < 3) needsReview.push("price");
  if (openingHours === 0) needsReview.push("opening_hours");
  if (website === 0) needsReview.push("website");

  return { description, image, price, openingHours, website, location, needsReview };
}

/** Internal completeness score (0–100). Not an editorial rating; not exposed
 *  to end users. */
function qualityScore(a: Record<string, unknown>) {
  const checks = [
    { k: "has provider", ok: !!a.provider },
    { k: "valid website", ok: isUrl(a.provider_website) || isUrl(a.website_url) },
    { k: "booking or ticket url", ok: isUrl(a.booking_url) || isUrl(a.ticket_url) },
    { k: "price set", ok: a.price_type === "free" || a.price_cents != null },
    { k: "image", ok: isUrl(a.image_url) },
    { k: "coordinates", ok: a.lat != null && a.lng != null },
    { k: "address", ok: !!a.address },
    {
      k: "verified in last 180d",
      ok:
        a.status === "verified" &&
        a.last_verified_at != null &&
        (a.last_verified_at as number) > Math.floor(Date.now() / 1000) - 180 * 86400,
    },
  ];
  const score = Math.round(
    (checks.filter((c) => c.ok).length / checks.length) * 100,
  );
  return { score, checks };
}
function isUrl(v: unknown): boolean {
  return typeof v === "string" && /^https?:\/\//.test(v);
}

function camelToSnake(s: string): string {
  return s.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
}

function safeJsonArray(s: string): unknown[] {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function safeJsonObject(s: string): Record<string, unknown> {
  try {
    const v = JSON.parse(s);
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

/* --------------------------- data quality (§29) --------------------------- */
/**
 * Every number below is a plain COUNT(*) against the real catalogue — no
 * crawling, no guessing. We deliberately do NOT report "broken links" or
 * "broken images" as a count: verifying a URL is actually reachable requires
 * live HTTP requests against thousands of external sites, which this page
 * does not perform, so a "0 broken" figure would be a fabricated one. That
 * check is a per-activity, admin-triggered action (Activity Detail), not a
 * background sweep, at this catalogue size.
 */
app.get("/data-quality", async (c) => {
  const db = createDb(c.env);
  const total = await scalar(db.select(COUNT).from(activities).where(eq(activities.active, 1)));

  const withWebsite = await scalar(
    db
      .select(COUNT)
      .from(activities)
      .where(and(eq(activities.active, 1), sql`(${activities.websiteUrl} is not null or ${activities.providerWebsite} is not null)`)),
  );
  const withBookingOrTicket = await scalar(
    db
      .select(COUNT)
      .from(activities)
      .where(and(eq(activities.active, 1), sql`(${activities.bookingUrl} is not null or ${activities.ticketUrl} is not null)`)),
  );
  const withImage = await scalar(
    db.select(COUNT).from(activities).where(and(eq(activities.active, 1), sql`${activities.imageUrl} is not null`)),
  );
  const withSpecificImage = await scalar(
    db
      .select(COUNT)
      .from(activities)
      .where(and(eq(activities.active, 1), sql`${activities.imageUrl} is not null`, eq(activities.imageIsGeneric, 0))),
  );
  const withGenericImage = await scalar(
    db.select(COUNT).from(activities).where(and(eq(activities.active, 1), eq(activities.imageIsGeneric, 1))),
  );
  const missingImage = await scalar(
    db.select(COUNT).from(activities).where(and(eq(activities.active, 1), sql`${activities.imageUrl} is null`)),
  );
  const withCoords = await scalar(
    db.select(COUNT).from(activities).where(and(eq(activities.active, 1), sql`${activities.lat} is not null and ${activities.lng} is not null`)),
  );
  const withAddress = await scalar(
    db.select(COUNT).from(activities).where(and(eq(activities.active, 1), sql`${activities.address} is not null`)),
  );
  const withPrice = await scalar(
    db
      .select(COUNT)
      .from(activities)
      .where(and(eq(activities.active, 1), sql`(${activities.priceType} = 'free' or ${activities.priceCents} is not null)`)),
  );
  const withOpeningHours = await scalar(
    db.select(COUNT).from(activities).where(and(eq(activities.active, 1), sql`${activities.openingHours} not in ('{}', '')`)),
  );
  const withSource = await scalar(
    db.select(COUNT).from(activities).where(and(eq(activities.active, 1), sql`${activities.sourceUrl} is not null`)),
  );

  const statusRows = await db
    .select({ status: activities.status, n: sql<number>`count(*)` })
    .from(activities)
    .where(eq(activities.active, 1))
    .groupBy(activities.status);
  const byStatus = Object.fromEntries(statusRows.map((r) => [r.status, r.n]));

  const verifiedRecently = await scalar(
    db
      .select(COUNT)
      .from(activities)
      .where(
        and(
          eq(activities.active, 1),
          eq(activities.status, "verified"),
          sql`${activities.lastVerifiedAt} > ${Math.floor(Date.now() / 1000) - 180 * 86400}`,
        ),
      ),
  );

  // top reused images — the concrete "same image repeatedly" signal (§27/§28)
  const reuse = await c.env.DB.prepare(
    `SELECT image_url AS imageUrl, COUNT(*) AS n
     FROM activities WHERE active = 1 AND image_url IS NOT NULL
     GROUP BY image_url HAVING COUNT(*) > 1
     ORDER BY n DESC LIMIT 15`,
  ).all<{ imageUrl: string; n: number }>();
  const distinctImages = await scalar(
    db.select({ n: sql<number>`count(distinct ${activities.imageUrl})` }).from(activities).where(and(eq(activities.active, 1), sql`${activities.imageUrl} is not null`)),
  );

  return c.json({
    total,
    withWebsite,
    withBookingOrTicket,
    withImage,
    withSpecificImage,
    withGenericImage,
    missingImage,
    distinctImages,
    withCoords,
    withAddress,
    withPrice,
    withOpeningHours,
    withSource,
    verifiedRecently,
    byStatus: {
      verified: byStatus.verified ?? 0,
      needs_review: byStatus.needs_review ?? 0,
      outdated: byStatus.outdated ?? 0,
      inactive: byStatus.inactive ?? 0,
    },
    mostReusedImages: reuse.results,
  });
});

/** Paginated image audit: filter by generic / missing / specific. */
app.get("/images/quality", async (c) => {
  const url = new URL(c.req.url);
  const { page, pageSize, q, offset } = listParams(url, ["title", "updated"], "updated");
  const filter = url.searchParams.get("filter"); // generic | missing | specific | reused

  const where: string[] = ["active = 1"];
  const args: unknown[] = [];
  if (q) {
    where.push("title LIKE ?" + (args.length + 1));
    args.push(`%${q}%`);
  }
  if (filter === "generic") where.push("image_is_generic = 1");
  else if (filter === "missing") where.push("image_url IS NULL");
  else if (filter === "specific") where.push("image_url IS NOT NULL AND image_is_generic = 0");
  else if (filter === "reused") {
    where.push(
      "image_url IN (SELECT image_url FROM activities WHERE active = 1 AND image_url IS NOT NULL GROUP BY image_url HAVING COUNT(*) > 1)",
    );
  }
  const whereSql = `WHERE ${where.join(" AND ")}`;

  const rows = await c.env.DB.prepare(
    `SELECT id, title, category_id AS category, city, image_url AS imageUrl,
            image_is_generic AS imageIsGeneric, image_source AS imageSource,
            status, updated_at AS updatedAt,
            (SELECT COUNT(*) FROM activities a2 WHERE a2.active = 1 AND a2.image_url = activities.image_url) AS sharedByCount
     FROM activities
     ${whereSql}
     ORDER BY ${q ? "title" : "updated_at"} DESC
     LIMIT ${pageSize} OFFSET ${offset}`,
  )
    .bind(...(args as never[]))
    .all();
  const total = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM activities ${whereSql}`)
    .bind(...(args as never[]))
    .first<{ n: number }>();

  return c.json({ rows: rows.results, ...pageMeta(total?.n ?? 0, page, pageSize) });
});

/**
 * One-time backfill (§27): for activities that still only have a generic
 * category fallback, check whether Google Street View has real coverage of
 * that exact address (a free metadata call — no image is downloaded here)
 * and, if so, point the activity at the /media/streetview proxy instead.
 * Self-advancing: call repeatedly, each call only ever selects rows that
 * still need checking (already-resolved ones stop matching the WHERE
 * clause), so there's no offset/cursor to track. No-ops with a clear error
 * if GOOGLE_MAPS_API_KEY isn't configured.
 */
app.post("/images/backfill-streetview", async (c) => {
  if (!c.env.GOOGLE_MAPS_API_KEY) {
    throw badRequest("GOOGLE_MAPS_API_KEY isn't configured — set it with `wrangler secret put GOOGLE_MAPS_API_KEY` first.");
  }
  const { limit } = await parseBody(
    c,
    z.object({ limit: z.number().int().min(1).max(200).default(50) }),
  );
  const rows = await c.env.DB.prepare(
    `SELECT id, lat, lng FROM activities
     WHERE active = 1 AND image_is_generic = 1 AND lat IS NOT NULL AND lng IS NOT NULL
       AND (image_source IS NULL OR image_source != 'streetview_no_coverage')
     LIMIT ?1`,
  )
    .bind(limit)
    .all<{ id: string; lat: number; lng: number }>();

  let found = 0;
  let noCoverage = 0;
  const now = Math.floor(Date.now() / 1000);
  for (const r of rows.results) {
    const lat = r.lat / 1e6;
    const lng = r.lng / 1e6;
    // ZERO_RESULTS is the only status that genuinely means "no imagery here"
    // — anything else (REQUEST_DENIED for a bad/misconfigured key,
    // OVER_QUERY_LIMIT, a network error, …) must NOT be recorded as "no
    // coverage", or a bad key would permanently mis-mark the whole catalogue
    // on the very first run. Those abort the batch instead, leaving
    // unresolved rows to retry on the next call.
    const meta = await fetch(
      `https://maps.googleapis.com/maps/api/streetview/metadata?location=${lat},${lng}&key=${c.env.GOOGLE_MAPS_API_KEY}`,
    );
    const json = await meta.json<{ status: string; error_message?: string }>();
    if (json.status !== "OK" && json.status !== "ZERO_RESULTS") {
      throw badRequest(
        `Street View API error (${json.status}): ${json.error_message ?? "check the key/billing"}. Stopped after ${found + noCoverage} rows — nothing already resolved was lost.`,
      );
    }
    const hasCoverage = json.status === "OK";
    if (hasCoverage) {
      await c.env.DB.prepare(
        `UPDATE activities SET image_url = ?1, image_source = 'Google Street View',
           image_attribution = '© Google Street View', image_is_generic = 0, updated_at = ?2
         WHERE id = ?3`,
      )
        .bind(`/api/media/streetview/${r.id}`, now, r.id)
        .run();
      found++;
    } else {
      await c.env.DB.prepare(
        `UPDATE activities SET image_source = 'streetview_no_coverage', updated_at = ?1 WHERE id = ?2`,
      )
        .bind(now, r.id)
        .run();
      noCoverage++;
    }
  }
  await audit(c, {
    action: "images.streetview_backfill",
    meta: { checked: rows.results.length, found, noCoverage },
  });
  return c.json({ checked: rows.results.length, found, noCoverage, done: rows.results.length < limit });
});

app.get("/rankings/activities", async (c) => {
  const url = new URL(c.req.url);
  const r = parseRange(url.searchParams);
  const limit = Math.min(
    50,
    Math.max(5, Number(url.searchParams.get("limit")) || 20),
  );

  const scoped = await activityMetricsRanged(c.env, r.from, r.to);
  const titles = await c.env.DB.prepare(
    `SELECT id, title, category_id AS category, city FROM activities`,
  ).all<{ id: string; title: string; category: string; city: string | null }>();
  const tmap = new Map(titles.results.map((t) => [t.id, t]));

  const rows = [...scoped.entries()]
    .map(([id, m]) => ({ id, ...tmap.get(id), ...derive(m) }))
    .filter((x) => x.title);

  const rank = (key: string) =>
    [...rows]
      .filter((x) => (x as never as Record<string, number>)[key] != null)
      .sort(
        (a, b) =>
          ((b as never as Record<string, number>)[key] ?? -1) -
          ((a as never as Record<string, number>)[key] ?? -1),
      )
      .slice(0, limit);

  return c.json({
    range: { from: r.from, to: r.to, label: r.label },
    mostViewed: rank("views"),
    mostLiked: rank("likes"),
    highestLikeRate: rank("likeRate").filter((x) => x.swipes >= 3),
    mostMatched: rank("matches"),
    highestPlanConversion: rank("planConversion").filter((x) => x.matches >= 1),
    mostBookingClicks: rank("bookingClicks"),
    mostWebsiteClicks: rank("websiteClicks"),
    mostOutboundClicks: rank("outboundClicks"),
    mostExpanded: rank("expanded"),
    mostShared: rank("shares"),
    mostPassed: rank("passes"),
  });
});

async function activityMetricsRanged(env: Env, from: number, to: number) {
  const b = (s: string) => env.DB.prepare(s).bind(from, to);
  const [votes, matchRows, planRows, viewRows, bookRows, poolRows, webRows, expandRows, shareRows, calRows] =
    await Promise.all([
      b(
        `SELECT activity_id AS id, value, COUNT(*) AS n FROM activity_votes
         WHERE created_at >= ?1 AND created_at < ?2 GROUP BY activity_id, value`,
      ).all<{ id: string; value: string; n: number }>(),
      b(
        `SELECT activity_id AS id, COUNT(*) AS n FROM matches
         WHERE matched_at >= ?1 AND matched_at < ?2 GROUP BY activity_id`,
      ).all<{ id: string; n: number }>(),
      b(
        `SELECT activity_id AS id, COUNT(*) AS n FROM plans
         WHERE created_at >= ?1 AND created_at < ?2 GROUP BY activity_id`,
      ).all<{ id: string; n: number }>(),
      b(
        `SELECT activity_id AS id, COUNT(*) AS n FROM analytics_events
         WHERE name = 'activity_viewed' AND created_at >= ?1 AND created_at < ?2
         AND activity_id IS NOT NULL GROUP BY activity_id`,
      ).all<{ id: string; n: number }>(),
      b(
        `SELECT activity_id AS id, COUNT(*) AS n FROM analytics_events
         WHERE name = 'booking_clicked' AND created_at >= ?1 AND created_at < ?2
         AND activity_id IS NOT NULL GROUP BY activity_id`,
      ).all<{ id: string; n: number }>(),
      env.DB.prepare(
        `SELECT activity_id AS id, COUNT(*) AS n FROM group_activity_pool GROUP BY activity_id`,
      ).all<{ id: string; n: number }>(),
      b(
        `SELECT activity_id AS id, COUNT(*) AS n FROM analytics_events
         WHERE name = 'activity_website_clicked' AND created_at >= ?1 AND created_at < ?2
         AND activity_id IS NOT NULL GROUP BY activity_id`,
      ).all<{ id: string; n: number }>(),
      b(
        `SELECT activity_id AS id, COUNT(*) AS n FROM analytics_events
         WHERE name = 'activity_expanded' AND created_at >= ?1 AND created_at < ?2
         AND activity_id IS NOT NULL GROUP BY activity_id`,
      ).all<{ id: string; n: number }>(),
      b(
        `SELECT activity_id AS id, COUNT(*) AS n FROM analytics_events
         WHERE name = 'activity_shared' AND created_at >= ?1 AND created_at < ?2
         AND activity_id IS NOT NULL GROUP BY activity_id`,
      ).all<{ id: string; n: number }>(),
      b(
        `SELECT activity_id AS id, COUNT(*) AS n FROM analytics_events
         WHERE name = 'calendar_action' AND created_at >= ?1 AND created_at < ?2
         AND activity_id IS NOT NULL GROUP BY activity_id`,
      ).all<{ id: string; n: number }>(),
    ]);
  const m = new Map<string, ActMetric>();
  const g = (id: string) => {
    let x = m.get(id);
    if (!x) {
      x = emptyMetric();
      m.set(id, x);
    }
    return x;
  };
  for (const v of votes.results) {
    const x = g(v.id);
    if (v.value === "like") x.likes = v.n;
    else if (v.value === "nope") x.passes = v.n;
    else if (v.value === "superlike") x.superlikes = v.n;
  }
  for (const r of matchRows.results) g(r.id).matches = r.n;
  for (const r of planRows.results) g(r.id).plans = r.n;
  for (const r of viewRows.results) g(r.id).views = r.n;
  for (const r of bookRows.results) g(r.id).bookingClicks = r.n;
  for (const r of poolRows.results) g(r.id).pooled = r.n;
  for (const r of webRows.results) g(r.id).websiteClicks = r.n;
  for (const r of expandRows.results) g(r.id).expanded = r.n;
  for (const r of shareRows.results) g(r.id).shares = r.n;
  for (const r of calRows.results) g(r.id).calendarAdds = r.n;
  return m;
}

/* --------------------------- category analytics --------------------------- */

app.get("/rankings/categories", async (c) => {
  const r = parseRange(new URL(c.req.url).searchParams);
  const scoped = await activityMetricsRanged(c.env, r.from, r.to);
  const cats = await c.env.DB.prepare(
    `SELECT id, category_id AS category FROM activities`,
  ).all<{ id: string; category: string }>();
  const byCat = new Map<string, ActMetric>();
  const g = (k: string) => {
    let x = byCat.get(k);
    if (!x) {
      x = emptyMetric();
      byCat.set(k, x);
    }
    return x;
  };
  for (const row of cats.results) {
    const m = scoped.get(row.id);
    if (!m) continue;
    const x = g(row.category);
    x.likes += m.likes;
    x.passes += m.passes;
    x.superlikes += m.superlikes;
    x.matches += m.matches;
    x.plans += m.plans;
    x.views += m.views;
    x.bookingClicks += m.bookingClicks;
    x.pooled += m.pooled;
  }
  return c.json({
    range: { from: r.from, to: r.to, label: r.label },
    categories: [...byCat.entries()].map(([category, m]) => ({
      category,
      ...derive(m),
    })),
  });
});

/* ------------------------------- providers ------------------------------ */

app.get("/providers", async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT p.id, p.name, p.kind, p.enabled, p.crm_status AS crmStatus,
            (SELECT COUNT(*) FROM activities a WHERE a.provider_id = p.id) AS activity_count,
            (SELECT COUNT(*) FROM activities a WHERE a.provider_id = p.id AND a.status = 'verified') AS verified_count,
            (SELECT COUNT(*) FROM provider_contacts pc WHERE pc.provider_id = p.id) AS contact_count,
            (SELECT MAX(occurred_at) FROM provider_communications co WHERE co.provider_id = p.id) AS last_contact_at
     FROM providers p ORDER BY activity_count DESC`,
  ).all<{
    id: string;
    name: string;
    kind: string;
    enabled: number;
    crmStatus: string;
    activity_count: number;
    verified_count: number;
    contact_count: number;
    last_contact_at: number | null;
  }>();
  return c.json({
    rows: rows.results.map((r) => ({
      id: r.id,
      name: r.name,
      kind: r.kind,
      enabled: !!r.enabled,
      crmStatus: r.crmStatus,
      activityCount: r.activity_count,
      verifiedCount: r.verified_count,
      contactCount: r.contact_count,
      lastContactAt: r.last_contact_at,
    })),
  });
});

const CRM_STATUSES = [
  "not_contacted",
  "contacted",
  "interested",
  "partner",
  "not_interested",
  "follow_up",
  "needs_review",
  "outdated",
  "inactive",
] as const;

app.put("/providers/:id/crm-status", async (c) => {
  const id = c.req.param("id");
  const { status } = await parseBody(
    c,
    z.object({ status: z.enum(CRM_STATUSES) }),
  );
  const res = await c.env.DB.prepare(
    `UPDATE providers SET crm_status = ?1 WHERE id = ?2`,
  )
    .bind(status, id)
    .run();
  if (!res.meta.changes) throw notFound("Provider not found.");
  await audit(c, {
    action: "provider.crm_status",
    targetType: "provider",
    targetId: id,
    meta: { status },
  });
  return c.json({ ok: true });
});

/* ------------------------- provider contacts (CRM) ---------------------- */

const contactInput = z.object({
  businessName: z.string().trim().max(160).nullable().optional(),
  email: z.string().trim().email().max(200).nullable().optional().or(z.literal("")),
  phone: z.string().trim().max(60).nullable().optional(),
  website: z.string().trim().url().max(300).nullable().optional().or(z.literal("")),
  contactPage: z.string().trim().url().max(300).nullable().optional().or(z.literal("")),
  address: z.string().trim().max(300).nullable().optional(),
  contactPerson: z.string().trim().max(160).nullable().optional(),
  role: z.string().trim().max(120).nullable().optional(),
  preferredMethod: z.string().trim().max(40).nullable().optional(),
  notes: z.string().trim().max(4000).optional(),
  nextFollowUpAt: z.number().int().positive().nullable().optional(),
});
const clean = (v: unknown) => (v === "" ? null : (v ?? null));

app.post("/providers/:id/contacts", async (c) => {
  const providerId = c.req.param("id");
  const prov = await c.env.DB.prepare(`SELECT id FROM providers WHERE id = ?1`)
    .bind(providerId)
    .first();
  if (!prov) throw notFound("Provider not found.");
  const b = await parseBody(c, contactInput);
  const id = newId();
  const nowS = Math.floor(Date.now() / 1000);
  await c.env.DB.prepare(
    `INSERT INTO provider_contacts
       (id, provider_id, business_name, email, phone, website, contact_page,
        address, contact_person, role, preferred_method, notes,
        next_follow_up_at, created_at, updated_at)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?14)`,
  )
    .bind(
      id, providerId, clean(b.businessName), clean(b.email), clean(b.phone),
      clean(b.website), clean(b.contactPage), clean(b.address),
      clean(b.contactPerson), clean(b.role), clean(b.preferredMethod),
      b.notes ?? "", b.nextFollowUpAt ?? null, nowS,
    )
    .run();
  await audit(c, {
    action: "provider.contact_added",
    targetType: "provider",
    targetId: providerId,
    meta: { contactId: id },
  });
  return c.json({ id }, 201);
});

app.put("/contacts/:id", async (c) => {
  const id = c.req.param("id");
  const b = await parseBody(c, contactInput);
  const res = await c.env.DB.prepare(
    `UPDATE provider_contacts SET
       business_name=?1, email=?2, phone=?3, website=?4, contact_page=?5,
       address=?6, contact_person=?7, role=?8, preferred_method=?9,
       notes=?10, next_follow_up_at=?11, updated_at=?12
     WHERE id=?13`,
  )
    .bind(
      clean(b.businessName), clean(b.email), clean(b.phone), clean(b.website),
      clean(b.contactPage), clean(b.address), clean(b.contactPerson),
      clean(b.role), clean(b.preferredMethod), b.notes ?? "",
      b.nextFollowUpAt ?? null, Math.floor(Date.now() / 1000), id,
    )
    .run();
  if (!res.meta.changes) throw notFound("Contact not found.");
  await audit(c, { action: "provider.contact_updated", targetType: "provider_contact", targetId: id });
  return c.json({ ok: true });
});

app.delete("/contacts/:id", async (c) => {
  const id = c.req.param("id");
  await c.env.DB.prepare(`DELETE FROM provider_contacts WHERE id = ?1`)
    .bind(id)
    .run();
  await audit(c, { action: "provider.contact_deleted", targetType: "provider_contact", targetId: id });
  return c.json({ ok: true });
});

/* ---------------------- provider communications (CRM) ------------------- */

const commInput = z.object({
  contactId: z.string().max(40).nullable().optional(),
  kind: z.enum(["email", "call", "meeting", "note", "other"]).default("note"),
  occurredAt: z.number().int().positive().optional(),
  subject: z.string().trim().max(200).optional(),
  status: z.string().trim().max(60).optional(),
  notes: z.string().trim().max(8000).optional(),
});

app.post("/providers/:id/communications", async (c) => {
  const providerId = c.req.param("id");
  const prov = await c.env.DB.prepare(`SELECT id FROM providers WHERE id = ?1`)
    .bind(providerId)
    .first();
  if (!prov) throw notFound("Provider not found.");
  const b = await parseBody(c, commInput);
  const id = newId();
  const nowS = Math.floor(Date.now() / 1000);
  await c.env.DB.prepare(
    `INSERT INTO provider_communications
       (id, provider_id, contact_id, kind, occurred_at, subject, status, notes, created_by, created_at)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)`,
  )
    .bind(
      id, providerId, b.contactId ?? null, b.kind, b.occurredAt ?? nowS,
      b.subject ?? "", b.status ?? "", b.notes ?? "", c.get("adminUserId"), nowS,
    )
    .run();
  await audit(c, {
    action: "provider.communication_logged",
    targetType: "provider",
    targetId: providerId,
    meta: { kind: b.kind },
  });
  return c.json({ id }, 201);
});

app.delete("/communications/:id", async (c) => {
  const id = c.req.param("id");
  await c.env.DB.prepare(`DELETE FROM provider_communications WHERE id = ?1`)
    .bind(id)
    .run();
  await audit(c, { action: "provider.communication_deleted", targetType: "provider_communication", targetId: id });
  return c.json({ ok: true });
});

app.get("/providers/:id", async (c) => {
  const id = c.req.param("id");
  const p = await c.env.DB.prepare(`SELECT * FROM providers WHERE id = ?1`)
    .bind(id)
    .first<Record<string, unknown>>();
  if (!p) throw notFound("Provider not found.");

  const acts = await c.env.DB.prepare(
    `SELECT id, title, category_id AS category, city, status, active,
            price_type AS priceType, price_cents AS priceCents,
            last_verified_at AS lastVerifiedAt, booking_url AS bookingUrl,
            website_url AS websiteUrl
     FROM activities WHERE provider_id = ?1 ORDER BY title`,
  )
    .bind(id)
    .all<Record<string, unknown>>();

  const metrics = await activityMetrics(c.env, "WHERE a.provider_id = ?1", [id]);
  const perActivity = acts.results.map((a) => ({
    ...a,
    metrics: derive(metrics.get(a.id as string) ?? emptyMetric()),
  }));
  const totals = perActivity.reduce(
    (t, a) => {
      t.views += a.metrics.views;
      t.likes += a.metrics.likes + a.metrics.superlikes;
      t.passes += a.metrics.passes;
      t.matches += a.metrics.matches;
      t.plans += a.metrics.plans;
      t.bookingClicks += a.metrics.bookingClicks;
      return t;
    },
    { views: 0, likes: 0, passes: 0, matches: 0, plans: 0, bookingClicks: 0 },
  );

  const contacts = await c.env.DB.prepare(
    `SELECT id, business_name AS businessName, email, phone, website,
            contact_page AS contactPage, address, contact_person AS contactPerson,
            role, preferred_method AS preferredMethod, notes,
            next_follow_up_at AS nextFollowUpAt, updated_at AS updatedAt
     FROM provider_contacts WHERE provider_id = ?1 ORDER BY created_at`,
  )
    .bind(id)
    .all();

  const comms = await c.env.DB.prepare(
    `SELECT co.id, co.contact_id AS contactId, co.kind, co.occurred_at AS occurredAt,
            co.subject, co.status, co.notes, u.email AS byEmail
     FROM provider_communications co LEFT JOIN users u ON u.id = co.created_by
     WHERE co.provider_id = ?1 ORDER BY co.occurred_at DESC LIMIT 100`,
  )
    .bind(id)
    .all();

  const lastContactAt = comms.results[0]?.occurredAt ?? null;
  const nextFollowUp = (contacts.results as { nextFollowUpAt: number | null }[])
    .map((x) => x.nextFollowUpAt)
    .filter((x): x is number => x != null)
    .sort((a, b) => a - b)[0] ?? null;

  return c.json({
    provider: p,
    activities: perActivity,
    totals,
    contacts: contacts.results,
    communications: comms.results,
    lastContactAt,
    nextFollowUp,
  });
});

/* -------------------------------- funnel -------------------------------- */
/**
 * Cohort funnel: users who signed up in the range, then how many of *those*
 * users reached each later step (≥1 matching event). Conversion is measured
 * against the signup count; drop-off against the previous step.
 */
app.get("/funnel", async (c) => {
  const r = parseRange(new URL(c.req.url).searchParams);
  const cohort = await c.env.DB.prepare(
    `SELECT id FROM users WHERE created_at >= ?1 AND created_at < ?2`,
  )
    .bind(r.from, r.to)
    .all<{ id: string }>();
  const ids = cohort.results.map((x) => x.id);
  const signups = ids.length;

  const STEPS: { key: string; label: string; events: string[] }[] = [
    { key: "signup", label: "Signed up", events: [] },
    { key: "group", label: "In a group", events: ["group_created", "group_joined"] },
    { key: "swipe", label: "Started swiping", events: ["swiping_started"] },
    { key: "like", label: "First like", events: ["activity_liked", "activity_superliked"] },
    { key: "match", label: "Activity match", events: ["activity_matched"] },
    { key: "date_start", label: "Date matching", events: ["date_match_started"] },
    { key: "date_done", label: "Date matched", events: ["date_matched"] },
    { key: "plan", label: "Plan created", events: ["plan_created"] },
    { key: "booking", label: "Booking click", events: ["booking_clicked"] },
  ];

  const counts: Record<string, number> = { signup: signups };
  if (signups > 0) {
    const placeholders = ids.map((_, i) => `?${i + 1}`).join(",");
    for (const s of STEPS) {
      if (s.key === "signup") continue;
      const evPlaceholders = s.events
        .map((_, i) => `?${ids.length + i + 1}`)
        .join(",");
      const row = await c.env.DB.prepare(
        `SELECT COUNT(DISTINCT user_id) AS n FROM analytics_events
         WHERE user_id IN (${placeholders})
           AND name IN (${evPlaceholders})`,
      )
        .bind(...ids, ...s.events)
        .first<{ n: number }>();
      counts[s.key] = row?.n ?? 0;
    }
  } else {
    for (const s of STEPS) counts[s.key] = 0;
  }

  let prev = signups;
  const steps = STEPS.map((s) => {
    const n = counts[s.key] ?? 0;
    const conv = signups > 0 ? n / signups : null;
    const drop = prev > 0 ? (prev - n) / prev : null;
    const out = {
      key: s.key,
      label: s.label,
      count: n,
      conversion: conv,
      dropoff: s.key === "signup" ? null : drop,
    };
    prev = n;
    return out;
  });

  return c.json({
    range: { from: r.from, to: r.to, label: r.label },
    signups,
    steps,
    enough: signups >= 5,
  });
});

/* ------------------------------ retention ------------------------------ */
/**
 * Aggregate D1 / D7 / D30: of users whose (signup + N days) window has fully
 * elapsed, the share who produced any tracked event inside that window.
 */
app.get("/retention", async (c) => {
  const nowSec = Math.floor(Date.now() / 1000);
  const DAY = 86400;

  async function bucket(days: number) {
    const cutoff = nowSec - days * DAY;
    const eligible = await c.env.DB.prepare(
      `SELECT id, created_at FROM users WHERE created_at <= ?1`,
    )
      .bind(cutoff)
      .all<{ id: string; created_at: number }>();
    if (eligible.results.length === 0)
      return { eligible: 0, retained: 0, rate: null as number | null };

    const ids = eligible.results.map((u) => u.id);
    const byId = new Map(eligible.results.map((u) => [u.id, u.created_at]));
    const ph = ids.map((_, i) => `?${i + 1}`).join(",");
    const evs = await c.env.DB.prepare(
      `SELECT DISTINCT user_id, created_at FROM analytics_events
       WHERE user_id IN (${ph}) AND name != 'user_registered'`,
    )
      .bind(...ids)
      .all<{ user_id: string; created_at: number }>();

    const retainedSet = new Set<string>();
    for (const e of evs.results) {
      const signup = byId.get(e.user_id);
      if (signup == null) continue;
      const lo = signup + (days === 1 ? 0 : 1) * DAY;
      const hi = signup + days * DAY;
      if (e.created_at > signup && e.created_at >= lo && e.created_at <= hi)
        retainedSet.add(e.user_id);
    }
    return {
      eligible: ids.length,
      retained: retainedSet.size,
      rate: ids.length > 0 ? retainedSet.size / ids.length : null,
    };
  }

  const [d1, d7, d30] = await Promise.all([bucket(1), bucket(7), bucket(30)]);
  const enough = d1.eligible >= 10;
  return c.json({ d1, d7, d30, enough });
});

/* ------------------------------- errors ------------------------------- */

app.get("/errors", async (c) => {
  const url = new URL(c.req.url);
  const r = parseRange(url.searchParams);
  const rows = await c.env.DB.prepare(
    `SELECT props, created_at FROM analytics_events
     WHERE name IN ('server_error','client_error')
       AND created_at >= ?1 AND created_at < ?2
     ORDER BY created_at DESC LIMIT 2000`,
  )
    .bind(r.from, r.to)
    .all<{ props: string; created_at: number }>();

  const groups = new Map<
    string,
    {
      source: string;
      route: string;
      message: string;
      env: string;
      count: number;
      lastSeenAt: number;
      statuses: Set<number>;
    }
  >();
  for (const row of rows.results) {
    let p: Record<string, unknown> = {};
    try {
      p = JSON.parse(row.props) as Record<string, unknown>;
    } catch {
      /* skip */
    }
    const source = String(p.source ?? (p.route ? "backend" : "frontend"));
    const route = String(p.route ?? p.path ?? "—").slice(0, 120);
    const message = String(p.message ?? p.error ?? "unknown").slice(0, 200);
    const env = String(p.env ?? "—");
    const key = `${source}|${route}|${message}`;
    let g = groups.get(key);
    if (!g) {
      g = { source, route, message, env, count: 0, lastSeenAt: 0, statuses: new Set() };
      groups.set(key, g);
    }
    g.count++;
    g.lastSeenAt = Math.max(g.lastSeenAt, row.created_at);
    if (typeof p.status === "number") g.statuses.add(p.status);
  }

  const list = [...groups.values()]
    .map((g) => ({
      source: g.source,
      route: g.route,
      message: g.message,
      env: g.env,
      count: g.count,
      lastSeenAt: g.lastSeenAt,
      statuses: [...g.statuses],
    }))
    .sort((a, b) => b.lastSeenAt - a.lastSeenAt);

  return c.json({
    range: { from: r.from, to: r.to, label: r.label },
    total: rows.results.length,
    groups: list,
  });
});

/* ---------------------------- system health --------------------------- */

app.get("/system", async (c) => {
  const db = createDb(c.env);

  const timed = async (fn: () => Promise<unknown>) => {
    const t0 = Date.now();
    try {
      await fn();
      return { ok: true, ms: Date.now() - t0 };
    } catch {
      return { ok: false, ms: Date.now() - t0 };
    }
  };

  const dbCheck = await timed(() =>
    c.env.DB.prepare("SELECT 1").first(),
  );
  const kvCheck = await timed(() => c.env.KV.get("__cc_health"));

  const services = [
    {
      name: "Database (D1)",
      status: dbCheck.ok ? "operational" : "down",
      detail: `${dbCheck.ms} ms`,
      latencyMs: dbCheck.ms,
    },
    {
      name: "KV store",
      status: kvCheck.ok ? "operational" : "down",
      detail: `${kvCheck.ms} ms`,
      latencyMs: kvCheck.ms,
    },
    {
      name: "Encryption key",
      status: hasEncryptionKey(c.env) ? "operational" : "down",
      detail: hasEncryptionKey(c.env) ? "configured" : "ENCRYPTION_KEY missing",
    },
    {
      name: "Break-glass recovery",
      status: c.env.OWNER_RECOVERY_SECRET ? "operational" : "unknown",
      detail: c.env.OWNER_RECOVERY_SECRET ? "configured" : "not configured",
    },
    {
      name: "Email provider",
      status: c.env.EMAIL_API_KEY ? "operational" : "unknown",
      detail: c.env.EMAIL_API_KEY
        ? "API key set (delivery not probed)"
        : "not configured — dev logs only",
    },
    {
      name: "Object storage (R2)",
      status: c.env.MEDIA ? "operational" : "unknown",
      detail: c.env.MEDIA ? "bound" : "not enabled",
    },
  ];

  const tableNames = [
    "users",
    "groups",
    "group_members",
    "activities",
    "providers",
    "activity_votes",
    "matches",
    "plans",
    "messages",
    "analytics_events",
    "audit_log",
    "admin_sessions",
  ];
  const tables: { name: string; rows: number }[] = [];
  for (const t of tableNames) {
    const row = await c.env.DB.prepare(
      `SELECT COUNT(*) AS n FROM ${t}`,
    ).first<{ n: number }>();
    tables.push({ name: t, rows: row?.n ?? 0 });
  }

  let migrationsApplied = 0;
  try {
    const m = await c.env.DB.prepare(
      `SELECT COUNT(*) AS n FROM d1_migrations`,
    ).first<{ n: number }>();
    migrationsApplied = m?.n ?? 0;
  } catch {
    /* table name differs between wrangler versions — best effort */
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const evTotal = await db
    .select({ n: sql<number>`count(*)` })
    .from(analyticsEvents);
  const ev24 = await db
    .select({ n: sql<number>`count(*)` })
    .from(analyticsEvents)
    .where(gte(analyticsEvents.createdAt, nowSec - 86400));
  const evByName = await c.env.DB.prepare(
    `SELECT name, COUNT(*) AS n FROM analytics_events GROUP BY name ORDER BY n DESC`,
  ).all<{ name: string; n: number }>();

  return c.json({
    version: {
      env: c.env.APP_ENV,
      appUrl: c.env.APP_URL,
      buildId: c.env.BUILD_ID ?? "dev",
      serverTime: nowSec,
    },
    services,
    database: { tables, migrationsApplied },
    events: {
      total: evTotal.at(0)?.n ?? 0,
      last24h: ev24.at(0)?.n ?? 0,
      byName: evByName.results,
    },
  });
});

/* ------------------------------- audit log ------------------------------- */

app.get("/audit/actions", async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT DISTINCT action FROM audit_log ORDER BY action`,
  ).all<{ action: string }>();
  return c.json({ actions: rows.results.map((r) => r.action) });
});

app.get("/audit", async (c) => {
  const url = new URL(c.req.url);
  const { page, pageSize, offset } = listParams(url, ["created"], "created");
  const r = parseRange(url.searchParams);
  const action = url.searchParams.get("action") || "";
  const actor = url.searchParams.get("actor") || "";

  const where: string[] = ["l.created_at >= ?1 AND l.created_at < ?2"];
  const args: unknown[] = [r.from, r.to];
  if (action) {
    args.push(action);
    where.push(`l.action = ?${args.length}`);
  }
  if (actor) {
    args.push(`%${actor.toLowerCase()}%`, actor);
    where.push(
      `(l.actor_id = ?${args.length} OR lower(u.email_normalized) LIKE ?${args.length - 1})`,
    );
  }
  const whereSql = `WHERE ${where.join(" AND ")}`;

  const total = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM audit_log l LEFT JOIN users u ON u.id = l.actor_id ${whereSql}`,
  )
    .bind(...(args as never[]))
    .first<{ n: number }>();

  const rows = await c.env.DB.prepare(
    `SELECT l.id, l.actor_type AS actorType, l.actor_id AS actorId,
            u.email AS actorEmail, l.action, l.target_type AS targetType,
            l.target_id AS targetId, l.meta, l.ip, l.user_agent AS userAgent,
            l.created_at AS createdAt
     FROM audit_log l LEFT JOIN users u ON u.id = l.actor_id
     ${whereSql} ORDER BY l.created_at DESC LIMIT ${pageSize} OFFSET ${offset}`,
  )
    .bind(...(args as never[]))
    .all<Record<string, unknown>>();

  return c.json({
    rows: rows.results.map((r2) => ({
      ...r2,
      meta: safeParse(r2.meta as string),
    })),
    ...pageMeta(total?.n ?? 0, page, pageSize),
  });
});

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}

/* ------------------------------ feature flags ------------------------------ */

app.get("/flags", async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT f.key, f.enabled, f.description, f.updated_at AS updatedAt,
            u.email AS updatedByEmail
     FROM feature_flags f LEFT JOIN users u ON u.id = f.updated_by
     ORDER BY f.key`,
  ).all<{
    key: string;
    enabled: number;
    description: string;
    updatedAt: number;
    updatedByEmail: string | null;
  }>();
  return c.json({
    flags: rows.results.map((r) => ({
      key: r.key,
      enabled: !!r.enabled,
      description: r.description,
      updatedAt: r.updatedAt,
      updatedByEmail: r.updatedByEmail,
    })),
  });
});

const flagKey = z
  .string()
  .trim()
  .min(2)
  .max(60)
  .regex(/^[a-z0-9_]+$/, "lowercase letters, digits and underscores only");

app.put("/flags/:key", async (c) => {
  const key = flagKey.parse(c.req.param("key"));
  const body = await parseBody(
    c,
    z.object({
      enabled: z.boolean(),
      description: z.string().trim().max(200).optional(),
    }),
  );
  const nowS = Math.floor(Date.now() / 1000);
  await c.env.DB.prepare(
    `INSERT INTO feature_flags (key, enabled, description, updated_at, updated_by)
     VALUES (?1, ?2, COALESCE(?3, ''), ?4, ?5)
     ON CONFLICT(key) DO UPDATE SET
       enabled = ?2,
       description = COALESCE(?3, feature_flags.description),
       updated_at = ?4, updated_by = ?5`,
  )
    .bind(
      key,
      body.enabled ? 1 : 0,
      body.description ?? null,
      nowS,
      c.get("adminUserId"),
    )
    .run();
  await audit(c, {
    action: "flag.updated",
    targetType: "feature_flag",
    targetId: key,
    meta: { enabled: body.enabled },
  });
  return c.json({ ok: true });
});

app.delete("/flags/:key", async (c) => {
  const key = c.req.param("key");
  await c.env.DB.prepare(`DELETE FROM feature_flags WHERE key = ?1`)
    .bind(key)
    .run();
  await audit(c, {
    action: "flag.deleted",
    targetType: "feature_flag",
    targetId: key,
  });
  return c.json({ ok: true });
});

/* -------------------------------- settings ------------------------------- */

const SETTABLE = new Set<string>([
  SETTINGS.maintenanceMode,
  SETTINGS.maintenanceMessage,
]);

app.get("/settings", async (c) => {
  const [maint, msg] = await Promise.all([
    getSetting(c.env, SETTINGS.maintenanceMode),
    getSetting(c.env, SETTINGS.maintenanceMessage),
  ]);
  return c.json({
    maintenanceMode: maint === "1",
    maintenanceMessage: msg ?? "",
    encryptionConfigured: hasEncryptionKey(c.env),
    recoveryConfigured: !!c.env.OWNER_RECOVERY_SECRET,
    emailConfigured: !!c.env.EMAIL_API_KEY,
  });
});

app.put("/settings", async (c) => {
  const body = await parseBody(
    c,
    z.object({
      key: z.string(),
      value: z.string().max(500),
    }),
  );
  if (!SETTABLE.has(body.key)) throw badRequest("That setting is not writable.");
  // maintenance mode is boolean-ish
  const value =
    body.key === SETTINGS.maintenanceMode
      ? body.value === "1" || body.value === "true"
        ? "1"
        : "0"
      : body.value;
  await setSetting(c.env, body.key, value, c.get("adminUserId"));
  await audit(c, {
    action:
      body.key === SETTINGS.maintenanceMode
        ? value === "1"
          ? "maintenance.enabled"
          : "maintenance.disabled"
        : "settings.updated",
    targetType: "setting",
    targetId: body.key,
    meta: body.key === SETTINGS.maintenanceMode ? { value } : {},
  });
  return c.json({ ok: true });
});

export default app;
