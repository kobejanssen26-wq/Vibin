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
import { and, gte, lt, sql, eq, ne, inArray } from "drizzle-orm";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import type { Env, Vars } from "../env";
import { createDb } from "../db/client";
import {
  activities,
  activityVotes,
  analyticsEvents,
  groups,
  matches,
  plans,
  reports,
  users,
} from "../db/schema";
import { parseRange, pctDelta } from "../lib/range";
import { hasEncryptionKey } from "../lib/crypto-box";
import { notFound } from "../lib/errors";

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
    recentSwipes: recentSwipes.results,
    timeline: timeline.results,
  });
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

export default app;
