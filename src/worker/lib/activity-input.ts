import { z } from "zod";
import type { Env } from "../env";
import { ACTIVITY_CATEGORIES } from "@shared/constants";

export const ADMIN_PROVIDER_ID = "prov_admin";

/**
 * Activities created by hand (single-form or CSV import) need a providerId,
 * but nothing in this app's real data ever has providers.kind = "seed" — the
 * seed pipeline's own rows are both kind "dataset" (prov_web / prov_osm), so
 * looking one up by kind="seed" always failed with a confusing "run the seed
 * first" error even right after seeding. This creates (idempotently) one
 * fixed provider row for manually-added content instead of depending on the
 * seed pipeline's provider set at all.
 */
export async function ensureAdminProvider(env: Env): Promise<string> {
  await env.DB.prepare(
    `INSERT INTO providers (id, name, kind, enabled, config, created_at)
     VALUES (?1, 'Added manually (Command Center)', 'dataset', 1, '{}', ?2)
     ON CONFLICT(id) DO NOTHING`,
  )
    .bind(ADMIN_PROVIDER_ID, Math.floor(Date.now() / 1000))
    .run();
  return ADMIN_PROVIDER_ID;
}

/**
 * The one schema for what a valid activity looks like — used by the admin
 * create/edit form (admin.ts) AND the CSV import pipeline (admin-import.ts),
 * so a row that passes CSV validation is guaranteed to be exactly as valid as
 * one entered by hand. Do not fork this: add a field here once, both paths
 * pick it up.
 */
export const urlOrNull = z.string().url().max(500).nullable().default(null);

export const activityInput = z.object({
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
  // day -> free-text hours ("9:00-18:00"), e.g. { mon: "9:00-18:00" }. Missing
  // days simply aren't shown — never filled in with a guess.
  openingHours: z.record(z.string(), z.string().max(60)).default({}),
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

export type ActivityInput = z.infer<typeof activityInput>;

export const scaleLatLng = (v: number | null | undefined) =>
  v == null ? (v === null ? null : undefined) : Math.round(v * 1e6);
