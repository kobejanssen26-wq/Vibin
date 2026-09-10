/**
 * Builds the ordered activity deck for a group from its settings. Materialised
 * into group_activity_pool once, when swiping starts, so every member — including
 * late joiners — swipes the same cards in the same order, and undo is stable.
 */
import { and, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";
import type { DB } from "../db/client";
import { activities } from "../db/schema";
import { LIMITS } from "@shared/constants";
import type { Activity, GroupSettings } from "../db/schema";

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
 * Latitude/longitude delta (in *1e6 integer units, matching the DB) that bounds
 * a `radiusKm` circle around `latE6`. Used as a cheap SQL pre-filter before the
 * exact haversine pass. A 2 km margin is added so nothing on the edge is lost to
 * rounding.
 */
function boundingBoxE6(latE6: number, radiusKm: number) {
  const lat = latE6 / 1e6;
  const km = radiusKm + 2;
  const dLat = km / 111.32;
  const dLng = km / (111.32 * Math.max(0.01, Math.cos((lat * Math.PI) / 180)));
  return {
    dLatE6: Math.ceil(dLat * 1e6),
    dLngE6: Math.ceil(dLng * 1e6),
  };
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

export async function buildDeck(
  db: DB,
  settings: GroupSettings,
): Promise<string[]> {
  const bands = BUDGET_TO_BANDS[settings.budgetBand] ?? BUDGET_TO_BANDS.any!;
  const cats: string[] = settings.allActivities
    ? []
    : (JSON.parse(settings.categories) as string[]);

  const hasRadius = settings.lat != null && settings.lng != null;

  const where = [
    eq(activities.active, 1),
    // only surface activities that are current — never "outdated" or "inactive"
    ne(activities.status, "outdated"),
    ne(activities.status, "inactive"),
    inArray(activities.priceBand, bands as Activity["priceBand"][]),
    ...(cats.length ? [inArray(activities.categoryId, cats)] : []),
  ];

  if (hasRadius) {
    // Cheap bounding-box pre-filter at the DB. NULL lat/lng fail these
    // comparisons, so unplaceable activities are excluded once a radius is set —
    // an activity with no coordinates can't be shown to be "within X km".
    const { dLatE6, dLngE6 } = boundingBoxE6(settings.lat!, settings.radiusKm);
    where.push(
      gte(activities.lat, settings.lat! - dLatE6),
      lte(activities.lat, settings.lat! + dLatE6),
      gte(activities.lng, settings.lng! - dLngE6),
      lte(activities.lng, settings.lng! + dLngE6),
    );
  }

  // Pull a generous candidate set, then (when a radius is set) keep only the
  // rows actually inside the circle, shuffle, and take the deck. Without a
  // radius, RANDOM() ordering + a 3× cap is enough.
  const cap = hasRadius
    ? Math.max(LIMITS.deckSize * 8, 400)
    : LIMITS.deckSize * 3;

  let rows = await db
    .select()
    .from(activities)
    .where(and(...where))
    .orderBy(sql`RANDOM()`)
    .limit(cap);

  if (hasRadius) {
    const glat = settings.lat! / 1e6;
    const glng = settings.lng! / 1e6;
    rows = shuffle(
      rows.filter(
        (a) =>
          a.lat != null &&
          a.lng != null &&
          haversineKm(glat, glng, a.lat / 1e6, a.lng / 1e6) <=
            settings.radiusKm,
      ),
    );
  }

  return rows.slice(0, LIMITS.deckSize).map((a) => a.id);
}
