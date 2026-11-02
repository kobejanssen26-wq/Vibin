/**
 * The one place that turns a validated `activityInput` into a catalogue row (plus its audit
 * row). Used by the classic admin form (`POST /activities`) and the Owner Swipe Manager, so a
 * hand-added activity goes through exactly the same validation and verification logic.
 */
import type { Env } from "../env";
import { createDb } from "../db/client";
import { activities } from "../db/schema";
import { newId } from "./id";
import { allowedStatus, assessActivity, type Assessment } from "./activity-quality";
import { ensureAdminProvider, scaleLatLng, type ActivityInput } from "./activity-input";
import { likeEscape, reliableUrlKey, titleKey, urlKey } from "./owner-swipe";

/** The quality verdict for a not-yet-existing activity (same rule as the CSV import). */
export function assessInput(body: ActivityInput): Assessment {
  return assessActivity({
    title: body.title,
    provider: body.provider,
    category_id: body.categoryId,
    subcategory: body.subcategory,
    source: "web",
    description: body.description,
    website_url: body.websiteUrl,
  });
}

export async function insertAdminActivity(
  env: Env,
  body: ActivityInput,
  verdict: Assessment,
): Promise<{ id: string; status: string }> {
  const db = createDb(env);
  const providerId = await ensureAdminProvider(env);
  const now = Math.floor(Date.now() / 1000);
  const id = newId();
  // "verified" needs the basics to exist; everything else starts as needs_review.
  const status = (allowedStatus(body.status, body) ?? "needs_review") as typeof body.status;
  await db.insert(activities).values({
    id,
    providerId,
    externalId: `admin-${id}`,
    ...body,
    status,
    lat: scaleLatLng(body.lat) ?? null,
    lng: scaleLatLng(body.lng) ?? null,
    tags: JSON.stringify(body.tags),
    openingHours: JSON.stringify(body.openingHours),
    lastVerifiedAt: status === "verified" ? now : null,
    active: body.active ? 1 : 0,
    createdAt: now,
    updatedAt: now,
  });
  // Every active record gets an audit row; without evidence it can never start out "approved".
  await env.DB.prepare(
    `INSERT OR IGNORE INTO activity_audits (activity_id, outcome, rule, reason, confidence, issues, hidden, source, audited_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, 'rules', ?7)`,
  )
    .bind(
      id,
      verdict.outcome === "exclude" ? "manual" : verdict.outcome,
      verdict.rule,
      verdict.reason,
      verdict.confidence,
      JSON.stringify(verdict.issues),
      now,
    )
    .run();
  return { id, status };
}

/** Existing rows (active or not) that look like this activity, and earlier owner-deleted matches. */
export async function findLookalikes(env: Env, a: { title: string; city: string | null; websiteUrl: string | null; providerWebsite: string | null }) {
  const tKey = titleKey(a.title, a.city);
  const uKey = reliableUrlKey(a.websiteUrl) ?? reliableUrlKey(a.providerWebsite);
  const duplicates: { id: string; title: string; city: string | null; active: boolean; reason: string }[] = [];
  const deleted: { id: string; title: string; reason: string }[] = [];

  const byTitle = await env.DB.prepare(
    `SELECT id, title, city, active FROM activities WHERE lower(trim(title)) = lower(trim(?1)) AND lower(trim(coalesce(city, ''))) = lower(trim(?2)) LIMIT 5`,
  ).bind(a.title, a.city ?? "").all<{ id: string; title: string; city: string | null; active: number }>();
  for (const r of byTitle.results) duplicates.push({ id: r.id, title: r.title, city: r.city, active: !!r.active, reason: "Zelfde naam en plaats" });

  if (uKey) {
    const host = uKey.split("/")[0]!;
    const byUrl = await env.DB.prepare(
      `SELECT id, title, city, active, website_url, provider_website FROM activities
        WHERE lower(coalesce(website_url, '')) LIKE ?1 ESCAPE '\\' OR lower(coalesce(provider_website, '')) LIKE ?1 ESCAPE '\\' LIMIT 40`,
    ).bind(`%${likeEscape(host)}%`).all<{ id: string; title: string; city: string | null; active: number; website_url: string | null; provider_website: string | null }>();
    for (const r of byUrl.results) {
      const same = urlKey(r.website_url) === uKey || urlKey(r.provider_website) === uKey;
      if (same && !duplicates.some((d) => d.id === r.id)) duplicates.push({ id: r.id, title: r.title, city: r.city, active: !!r.active, reason: "Zelfde website" });
    }
  }
  const del = await env.DB.prepare(
    `SELECT d.activity_id AS id, coalesce(a.title, json_extract(d.note, '$.title'), '(onbekend)') AS title, d.title_key AS tk, d.url_key AS uk
       FROM owner_activity_decisions d LEFT JOIN activities a ON a.id = d.activity_id
      WHERE d.decision IN ('delete', 'purged') AND ((?1 IS NOT NULL AND d.title_key = ?1) OR (?2 IS NOT NULL AND d.url_key = ?2)) LIMIT 5`,
  ).bind(tKey, uKey).all<{ id: string; title: string; tk: string | null; uk: string | null }>();
  for (const r of del.results) deleted.push({ id: r.id, title: r.title, reason: r.tk === tKey ? "Eerder verwijderd: zelfde naam en plaats" : "Eerder verwijderd: zelfde website" });
  return { duplicates, deleted };
}
