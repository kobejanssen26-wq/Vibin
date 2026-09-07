/**
 * Builds the ordered activity deck for a group from its settings. Materialised
 * into group_activity_pool once, when swiping starts, so every member — including
 * late joiners — swipes the same cards in the same order, and undo is stable.
 */
import { and, eq, inArray, ne, sql } from "drizzle-orm";
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

const BUDGET_TO_BANDS: Record<string, string[]> = {
  any: ["free", "0_10", "10_25", "25_50", "50_100", "100_plus"],
  free: ["free"],
  "0_10": ["free", "0_10"],
  "10_25": ["free", "0_10", "10_25"],
  "25_50": ["free", "0_10", "10_25", "25_50"],
  "50_100": ["free", "0_10", "10_25", "25_50", "50_100"],
  "100_plus": ["free", "0_10", "10_25", "25_50", "50_100", "100_plus"],
};

export async function buildDeck(
  db: DB,
  settings: GroupSettings,
): Promise<string[]> {
  const bands = BUDGET_TO_BANDS[settings.budgetBand] ?? BUDGET_TO_BANDS.any!;
  const cats: string[] = settings.allActivities
    ? []
    : (JSON.parse(settings.categories) as string[]);

  const where = [
    eq(activities.active, 1),
    // only surface activities that are current — never "outdated" or "inactive"
    ne(activities.status, "outdated"),
    ne(activities.status, "inactive"),
    inArray(activities.priceBand, bands as Activity["priceBand"][]),
    ...(cats.length ? [inArray(activities.categoryId, cats)] : []),
  ];

  let rows = await db
    .select()
    .from(activities)
    .where(and(...where))
    .orderBy(sql`RANDOM()`)
    .limit(LIMITS.deckSize * 3);

  // Radius filter (in JS — dataset is small; move to a spatial index later).
  if (settings.lat != null && settings.lng != null) {
    const glat = settings.lat / 1e6;
    const glng = settings.lng / 1e6;
    rows = rows.filter((a) => {
      if (a.lat == null || a.lng == null) return true; // keep unlocated
      return (
        haversineKm(glat, glng, a.lat / 1e6, a.lng / 1e6) <= settings.radiusKm
      );
    });
  }

  return rows.slice(0, LIMITS.deckSize).map((a) => a.id);
}
