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
  const [votes, matchRows, planRows, viewRows, bookRows, poolRows] =
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
    ]);

  const m = new Map<string, ActMetric>();
  const get = (id: string) => {
    let x = m.get(id);
    if (!x) {
      x = {
        likes: 0,
        passes: 0,
        superlikes: 0,
        matches: 0,
        plans: 0,
        views: 0,
        bookingClicks: 0,
        pooled: 0,
      };
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
}

function derive(x: ActMetric) {
  const swipes = x.likes + x.passes + x.superlikes;
  return {
    ...x,
    swipes,
    likeRate: swipes > 0 ? (x.likes + x.superlikes) / swipes : null,
    matchRate: x.pooled > 0 ? x.matches / x.pooled : null,
    planConversion: x.matches > 0 ? x.plans / x.matches : null,
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
    const m = derive(
      metrics.get(r.id as string) ?? {
        likes: 0,
        passes: 0,
        superlikes: 0,
        matches: 0,
        plans: 0,
        views: 0,
        bookingClicks: 0,
        pooled: 0,
      },
    );
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

app.get("/activities/:id", async (c) => {
  const id = c.req.param("id");
  const a = await c.env.DB.prepare(`SELECT * FROM activities WHERE id = ?1`)
    .bind(id)
    .first<Record<string, unknown>>();
  if (!a) throw notFound("Activity not found.");

  const metrics = derive(
    (await activityMetrics(c.env, "WHERE a.id = ?1", [id])).get(id) ?? {
      likes: 0,
      passes: 0,
      superlikes: 0,
      matches: 0,
      plans: 0,
      views: 0,
      bookingClicks: 0,
      pooled: 0,
    },
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

  return c.json({ activity: a, metrics, provider, matchedGroups: recentGroups.results, quality: q });
});

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
    mostPassed: rank("passes"),
  });
});

async function activityMetricsRanged(env: Env, from: number, to: number) {
  const b = (s: string) => env.DB.prepare(s).bind(from, to);
  const [votes, matchRows, planRows, viewRows, bookRows, poolRows] =
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
    ]);
  const m = new Map<string, ActMetric>();
  const g = (id: string) => {
    let x = m.get(id);
    if (!x) {
      x = { likes: 0, passes: 0, superlikes: 0, matches: 0, plans: 0, views: 0, bookingClicks: 0, pooled: 0 };
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
      x = { likes: 0, passes: 0, superlikes: 0, matches: 0, plans: 0, views: 0, bookingClicks: 0, pooled: 0 };
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
    `SELECT p.id, p.name, p.kind, p.enabled,
            (SELECT COUNT(*) FROM activities a WHERE a.provider_id = p.id) AS activity_count,
            (SELECT COUNT(*) FROM activities a WHERE a.provider_id = p.id AND a.status = 'verified') AS verified_count
     FROM providers p ORDER BY activity_count DESC`,
  ).all<{
    id: string;
    name: string;
    kind: string;
    enabled: number;
    activity_count: number;
    verified_count: number;
  }>();
  return c.json({
    rows: rows.results.map((r) => ({
      id: r.id,
      name: r.name,
      kind: r.kind,
      enabled: !!r.enabled,
      activityCount: r.activity_count,
      verifiedCount: r.verified_count,
    })),
  });
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
    metrics: derive(
      metrics.get(a.id as string) ?? {
        likes: 0, passes: 0, superlikes: 0, matches: 0, plans: 0,
        views: 0, bookingClicks: 0, pooled: 0,
      },
    ),
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

  return c.json({ provider: p, activities: perActivity, totals });
});

export default app;
