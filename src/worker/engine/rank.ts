/**
 * Recommendation ranking for the swipe deck.
 *
 * IMPORTANT — what this does and does NOT do:
 *   - It RANKS the activities that already passed the HARD filters (radius,
 *     budget, category, active). It never removes an activity from eligibility.
 *   - A "pass" lowers similar items' score; it never hides a category. Passed-
 *     similar items keep a floor and resurface via the exploration term, because
 *     preferences change.
 *   - It has NO effect on match logic. Unanimous-like still decides a match; the
 *     ranker only changes the order cards are shown in.
 *   - Pure arithmetic. No LLM, no model server. Fast enough to score a few
 *     hundred candidates per request.
 *
 * Signals: this user's votes across ALL their groups (personal taste) + this
 * group's votes from every member (group taste, recency-weighted).
 */
import type { Activity } from "../db/schema";

export type VoteValue = "like" | "nope" | "superlike";

export interface VoteSignalRow {
  value: VoteValue;
  updatedAt: number; // unix seconds
  categoryId: string | null;
  subcategory: string | null;
  tags: string; // JSON array
}

export interface RankOptions {
  /** group's chosen point, for the distance term (null → term skipped) */
  origin: { lat: number; lng: number } | null;
  radiusKm: number;
  /** active members — for the group-size fit term */
  groupSize: number;
  /** now, injectable for tests */
  now?: number;
}

export interface RankContext {
  personal: AffinityModel;
  group: AffinityModel;
  opts: Required<RankOptions>;
}

export interface ScoreBreakdown {
  distance: number;
  personalCategory: number;
  personalSubcategory: number;
  groupCategory: number;
  groupSubcategory: number;
  similarityToLiked: number;
  similarityToPassed: number;
  groupSizeFit: number;
  freshness: number;
  exploration: number;
  total: number;
}

/* --------------------------- tuning weights --------------------------- */
export const WEIGHTS = {
  distance: 1.6,
  personalCategory: 1.1,
  personalSubcategory: 1.3,
  groupCategory: 1.4,
  groupSubcategory: 1.2,
  similarityToLiked: 1.0,
  similarityToPassed: -1.1,
  groupSizeFit: 1.5,
  freshness: 0.35,
  exploration: 0.5,
} as const;

const RECENCY_HALFLIFE_DAYS = 45;
const DAY = 86_400;

function recencyWeight(ageSec: number): number {
  return Math.pow(0.5, Math.max(0, ageSec) / (RECENCY_HALFLIFE_DAYS * DAY));
}
function signalOf(v: VoteValue): number {
  return v === "nope" ? -1 : v === "superlike" ? 1.6 : 1;
}
const parseTags = (raw: string): string[] => {
  try {
    const a = JSON.parse(raw);
    return Array.isArray(a) ? a.map(String) : [];
  } catch {
    return [];
  }
};

/* --------------------------- affinity model -------------------------- */
interface AffinityModel {
  category: Map<string, { sig: number; w: number }>;
  subcategory: Map<string, { sig: number; w: number }>;
  /** weighted tag profile of LIKED items */
  likedTags: Map<string, number>;
  /** weighted tag profile of PASSED items */
  passedTags: Map<string, number>;
  /** subcategories the person/group has interacted with at all (for exploration) */
  touchedSubcats: Set<string>;
  totalWeight: number;
}

function buildAffinity(rows: VoteSignalRow[], now: number): AffinityModel {
  const m: AffinityModel = {
    category: new Map(),
    subcategory: new Map(),
    likedTags: new Map(),
    passedTags: new Map(),
    touchedSubcats: new Set(),
    totalWeight: 0,
  };
  for (const r of rows) {
    const w = recencyWeight(now - r.updatedAt);
    const s = signalOf(r.value) * w;
    m.totalWeight += w;
    if (r.categoryId) bump(m.category, r.categoryId, s, w);
    if (r.subcategory) {
      bump(m.subcategory, r.subcategory, s, w);
      m.touchedSubcats.add(r.subcategory);
    }
    const profile = r.value === "nope" ? m.passedTags : m.likedTags;
    const mag = r.value === "nope" ? w : signalOf(r.value) * w;
    for (const t of parseTags(r.tags)) {
      profile.set(t, (profile.get(t) ?? 0) + mag);
    }
  }
  return m;
}
function bump(
  map: Map<string, { sig: number; w: number }>,
  key: string,
  sig: number,
  w: number,
) {
  const cur = map.get(key) ?? { sig: 0, w: 0 };
  cur.sig += sig;
  cur.w += w;
  map.set(key, cur);
}

/**
 * Affinity in ~[-1, 1] with a confidence shrink: few observations → close to 0.
 */
function affinity(
  map: Map<string, { sig: number; w: number }>,
  key: string | null,
): number {
  if (!key) return 0;
  const e = map.get(key);
  if (!e || e.w === 0) return 0;
  const raw = e.sig / e.w; // mean signal, ~[-1, 1.6]
  const confidence = e.w / (e.w + 2); // shrink toward 0 until ~2 weighted votes
  return Math.max(-1, Math.min(1, raw)) * confidence;
}

function tagSimilarity(profile: Map<string, number>, tags: string[]): number {
  if (profile.size === 0 || tags.length === 0) return 0;
  let max = 0;
  for (const v of profile.values()) max = Math.max(max, v);
  if (max === 0) return 0;
  let hit = 0;
  for (const t of tags) hit += (profile.get(t) ?? 0) / max;
  return Math.min(1, hit / Math.sqrt(tags.length));
}

/* ----------------------------- public API --------------------------- */
export function buildRankContext(
  personalRows: VoteSignalRow[],
  groupRows: VoteSignalRow[],
  options: RankOptions,
): RankContext {
  const now = options.now ?? Math.floor(Date.now() / 1000);
  return {
    personal: buildAffinity(personalRows, now),
    group: buildAffinity(groupRows, now),
    opts: {
      origin: options.origin,
      radiusKm: options.radiusKm,
      groupSize: Math.max(1, options.groupSize),
      now,
    },
  };
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
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

export function scoreActivity(a: Activity, ctx: RankContext): ScoreBreakdown {
  const { opts } = ctx;
  const tags = parseTags(a.tags);

  // distance: 1 at the origin, 0 at the radius edge (skipped without a point)
  let distance = 0;
  if (opts.origin && a.lat != null && a.lng != null) {
    const d = haversineKm(opts.origin.lat, opts.origin.lng, a.lat / 1e6, a.lng / 1e6);
    distance = Math.max(0, 1 - d / Math.max(1, opts.radiusKm));
  }

  const personalCategory = affinity(ctx.personal.category, a.categoryId);
  const personalSubcategory = affinity(ctx.personal.subcategory, a.subcategory);
  const groupCategory = affinity(ctx.group.category, a.categoryId);
  const groupSubcategory = affinity(ctx.group.subcategory, a.subcategory);

  const simLiked =
    tagSimilarity(ctx.personal.likedTags, tags) * 0.6 +
    tagSimilarity(ctx.group.likedTags, tags) * 0.4;
  const simPassed =
    tagSimilarity(ctx.personal.passedTags, tags) * 0.6 +
    tagSimilarity(ctx.group.passedTags, tags) * 0.4;

  // group-size fit: 1 inside [min,max], decaying outside; unknown capacity → 0.6
  let groupSizeFit = 0.6;
  const g = opts.groupSize;
  const min = a.minParticipants;
  const max = a.maxParticipants;
  if (min != null || max != null) {
    if ((min == null || g >= min) && (max == null || g <= max)) groupSizeFit = 1;
    else if (max != null && g > max) groupSizeFit = Math.max(0, 1 - (g - max) / max);
    else if (min != null && g < min) groupSizeFit = Math.max(0.2, g / min);
  }

  // freshness: newer catalogue rows get a small nudge so imports get discovered
  const ageDays = (opts.now - a.createdAt) / DAY;
  const freshness = Math.max(0, 1 - ageDays / 120);

  // exploration: a subcategory nobody in the context has touched yet + jitter
  const untouched =
    a.subcategory &&
    !ctx.personal.touchedSubcats.has(a.subcategory) &&
    !ctx.group.touchedSubcats.has(a.subcategory)
      ? 1
      : 0;
  const exploration = untouched * 0.7 + Math.random() * 0.3;

  const total =
    WEIGHTS.distance * distance +
    WEIGHTS.personalCategory * personalCategory +
    WEIGHTS.personalSubcategory * personalSubcategory +
    WEIGHTS.groupCategory * groupCategory +
    WEIGHTS.groupSubcategory * groupSubcategory +
    WEIGHTS.similarityToLiked * simLiked +
    WEIGHTS.similarityToPassed * simPassed +
    WEIGHTS.groupSizeFit * groupSizeFit +
    WEIGHTS.freshness * freshness +
    WEIGHTS.exploration * exploration;

  return {
    distance,
    personalCategory,
    personalSubcategory,
    groupCategory,
    groupSubcategory,
    similarityToLiked: simLiked,
    similarityToPassed: simPassed,
    groupSizeFit,
    freshness,
    exploration,
    total,
  };
}

/**
 * Rank + greedily diversify: sort by score, then walk the list keeping a running
 * penalty on a subcategory once it has appeared twice recently, so the deck
 * isn't "ten bowling alleys in a row". Returns activity ids in deck order.
 */
export function rankActivities(
  candidates: Activity[],
  ctx: RankContext,
  limit: number,
): { id: string; score: number }[] {
  const scored = candidates.map((a) => ({
    a,
    s: scoreActivity(a, ctx).total,
  }));
  scored.sort((x, y) => y.s - x.s);

  const out: { id: string; score: number }[] = [];
  const recentSubcat: string[] = [];
  const deferred: typeof scored = [];

  for (const item of scored) {
    if (out.length >= limit) break;
    const sub = item.a.subcategory ?? "_";
    const recentCount = recentSubcat.slice(-6).filter((s) => s === sub).length;
    if (recentCount >= 2 && deferred.length < limit) {
      deferred.push(item);
      continue;
    }
    out.push({ id: item.a.id, score: Math.round(item.s * 1000) / 1000 });
    recentSubcat.push(sub);
  }
  // top up from deferred (diversity-penalised) if we're short
  for (const item of deferred) {
    if (out.length >= limit) break;
    out.push({ id: item.a.id, score: Math.round(item.s * 1000) / 1000 });
  }
  return out;
}
