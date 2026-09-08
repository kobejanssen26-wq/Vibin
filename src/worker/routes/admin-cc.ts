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

type Ctx = { Bindings: Env; Variables: Vars };
const app = new Hono<Ctx>();

/* --------------------------- small query helpers --------------------------- */

async function scalar(q: Promise<{ n: number }[]>): Promise<number> {
  return (await q).at(0)?.n ?? 0;
}
const COUNT = { n: sql<number>`count(*)` };

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

export default app;
