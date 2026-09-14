/**
 * Builds the group's activity deck from its settings. The deck is materialised
 * into `group_activity_pool` in batches: the first batch when swiping starts,
 * then more are appended (see routes/votes.ts `/swipe/extend`) as members near
 * the end, so it feels like one endless stack. Every member shares the same
 * pool in the same order, so undo is stable and a match still means "everyone
 * liked the same card".
 */
import { and, eq, gte, inArray, lte, ne, notInArray, sql } from "drizzle-orm";
import type { DB } from "../db/client";
import { activities, activityVotes, groupActivityPool } from "../db/schema";
import { LIMITS } from "@shared/constants";
import type { Activity, GroupSettings } from "../db/schema";
import { rankActivities, type RankContext } from "./rank";

/**
 * Personalization is a suggestion, not a decision: only this many leading
 * cards of a batch come from the ranker (highest-scored first); everything
 * else is a fair diverse shuffle of the remaining candidates. This keeps a
 * user's own taste history from dominating a whole new group's deck — it
 * nudges what shows up first, nothing more.
 */
const RANK_SUGGESTION_SLOTS = 3;

/** Straight-line distance in km between two WGS84 points. */
export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Lat/lng delta (in *1e6 integer units, matching the DB) that bounds a
 * `radiusKm` circle around `latE6`. Cheap SQL pre-filter before exact haversine;
 * a 2 km margin covers rounding at the edge.
 */
function boundingBoxE6(latE6: number, radiusKm: number) {
  const lat = latE6 / 1e6;
  const km = radiusKm + 2;
  const dLat = km / 111.32;
  const dLng = km / (111.32 * Math.max(0.01, Math.cos((lat * Math.PI) / 180)));
  return { dLatE6: Math.ceil(dLat * 1e6), dLngE6: Math.ceil(dLng * 1e6) };
}

const BUDGET_TO_BANDS: Record<string, string[]> = {
  any: ["free", "0_10", "10_25", "25_50", "50_100", "100_plus"],
  free: ["free"],
  "0_10": ["free", "0_10"],
  "10_25": ["free", "0_10", "10_25"],
  "25_50": ["free", "0_10", "10_25", "25_50"],
  "50_100": ["free", "0_10", "10_25", "25_50", "50_100"],
  "100_plus": ["free", "0_10", "10_25", "25_50", "50_100", "100_plus"],
};

/** Fisher–Yates — an unbiased in-place shuffle. */
function shuffle<T>(xs: T[]): T[] {
  for (let i = xs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [xs[i], xs[j]] = [xs[j]!, xs[i]!];
  }
  return xs;
}

/** The shared WHERE for "an activity this group could be shown", minus geo. */
function baseWhere(settings: GroupSettings) {
  const bands = BUDGET_TO_BANDS[settings.budgetBand] ?? BUDGET_TO_BANDS.any!;
  const cats: string[] = settings.allActivities
    ? []
    : (JSON.parse(settings.categories) as string[]);
  return [
    eq(activities.active, 1),
    ne(activities.status, "outdated"),
    ne(activities.status, "inactive"),
    inArray(activities.priceBand, bands as Activity["priceBand"][]),
    ...(cats.length ? [inArray(activities.categoryId, cats)] : []),
  ];
}

function geoWhere(settings: GroupSettings) {
  if (settings.lat == null || settings.lng == null) return [];
  const { dLatE6, dLngE6 } = boundingBoxE6(settings.lat, settings.radiusKm);
  return [
    gte(activities.lat, settings.lat - dLatE6),
    lte(activities.lat, settings.lat + dLatE6),
    gte(activities.lng, settings.lng - dLngE6),
    lte(activities.lng, settings.lng + dLngE6),
  ];
}

export interface DeckBatch {
  ids: string[];
  /** more eligible activities exist beyond what this group has already seen */
  hasMore: boolean;
}

/**
 * Exclude, via constant-size subqueries (never a big `NOT IN (?, ?, …)` — that
 * blows SQLite's parameter/expression limits once the pool grows), every
 * activity already in this group's pool or already voted on by anyone in it.
 */
function seenByGroup(db: DB, groupId: string) {
  return [
    notInArray(
      activities.id,
      db
        .select({ id: groupActivityPool.activityId })
        .from(groupActivityPool)
        .where(eq(groupActivityPool.groupId, groupId)),
    ),
    notInArray(
      activities.id,
      db
        .select({ id: activityVotes.activityId })
        .from(activityVotes)
        .where(eq(activityVotes.groupId, groupId)),
    ),
  ];
}

/**
 * The next slice of the deck for a group — never repeats a card the group has
 * already pooled or voted on. `limit` defaults to LIMITS.deckSize.
 *
 * With `opts.rank` the candidate pool is scored + diversified by the
 * recommendation engine (see rank.ts); ~15% of every batch stays pure-random so
 * the deck can't collapse into a filter bubble. Without it, the batch is a fair
 * shuffle of the eligible set (used before a group has any swipe history).
 */
export async function buildDeckBatch(
  db: DB,
  settings: GroupSettings,
  opts: { groupId?: string; limit?: number; rank?: RankContext | null } = {},
): Promise<DeckBatch> {
  const limit = opts.limit ?? LIMITS.deckSize;
  const hasRadius = settings.lat != null && settings.lng != null;

  const where = [
    ...baseWhere(settings),
    ...geoWhere(settings),
    ...(opts.groupId ? seenByGroup(db, opts.groupId) : []),
  ];

  // Pull a generous random candidate sample (bounded — fair to the whole
  // catalogue), then keep only what's truly inside the circle.
  const cap = hasRadius ? Math.max(limit * 12, 600) : Math.max(limit * 6, 300);
  let rows = await db
    .select()
    .from(activities)
    .where(and(...where))
    .orderBy(sql`RANDOM()`)
    .limit(cap);

  if (hasRadius) {
    const glat = settings.lat! / 1e6;
    const glng = settings.lng! / 1e6;
    rows = rows.filter(
      (a) =>
        a.lat != null &&
        a.lng != null &&
        haversineKm(glat, glng, a.lat / 1e6, a.lng / 1e6) <= settings.radiusKm,
    );
  }

  let ids: string[];
  if (opts.rank) {
    const suggestN = Math.min(rows.length, RANK_SUGGESTION_SLOTS);
    const suggested = rankActivities(rows, opts.rank, suggestN).map((r) => r.id);
    const taken = new Set(suggested);
    const rest = shuffle(rows.filter((a) => !taken.has(a.id)))
      .slice(0, limit - suggestN)
      .map((a) => a.id);
    ids = [...suggested, ...rest];
  } else {
    ids = shuffle(rows)
      .slice(0, limit)
      .map((a) => a.id);
  }

  // hasMore: is the eligible-not-excluded set larger than what we just took?
  // Counted over the bounding box (a superset of the circle) so it can slightly
  // over-report near the edge — harmless: the next batch simply comes back
  // empty and flips hasMore to false.
  let hasMore = false;
  if (ids.length === limit) {
    const countRows = await db
      .select({ n: sql<number>`count(*)` })
      .from(activities)
      .where(and(...where));
    hasMore = (countRows[0]?.n ?? 0) > ids.length;
  }

  return { ids, hasMore };
}

/** First batch, used when swiping starts. */
export async function buildDeck(
  db: DB,
  settings: GroupSettings,
  groupId?: string,
  rank?: RankContext | null,
): Promise<string[]> {
  return (await buildDeckBatch(db, settings, { groupId, rank })).ids;
}

/**
 * Eligible activities for a group's current filters (hard filters + exact
 * radius), NOT excluding what's been pooled/voted. Used by the admin
 * rank-explain tool to show scoring over the real candidate set.
 */
export async function eligibleCandidates(
  db: DB,
  settings: GroupSettings,
  cap = 200,
): Promise<Activity[]> {
  const rows = await db
    .select()
    .from(activities)
    .where(and(...baseWhere(settings), ...geoWhere(settings)))
    .orderBy(sql`RANDOM()`)
    .limit(cap);
  if (settings.lat == null || settings.lng == null) return rows;
  const glat = settings.lat / 1e6;
  const glng = settings.lng / 1e6;
  return rows.filter(
    (a) =>
      a.lat != null &&
      a.lng != null &&
      haversineKm(glat, glng, a.lat / 1e6, a.lng / 1e6) <= settings.radiusKm,
  );
}

/**
 * How many activities match the filters that this group hasn't pooled/voted on
 * yet. Counted over the bounding box, so with a radius it's an upper bound —
 * good enough to decide "can the client ask for another batch?".
 */
export async function countEligibleActivities(
  db: DB,
  settings: GroupSettings,
  groupId: string,
): Promise<number> {
  const where = [
    ...baseWhere(settings),
    ...geoWhere(settings),
    ...seenByGroup(db, groupId),
  ];
  const rows = await db
    .select({ n: sql<number>`count(*)` })
    .from(activities)
    .where(and(...where));
  return rows[0]?.n ?? 0;
}
