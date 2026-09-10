/**
 * The ingestion pipeline:  fetch -> normalize -> geocode -> dedupe -> upsert.
 *
 * Guarantees:
 *  - idempotent: re-running a source updates rows in place, never duplicates
 *  - manual rows (source = "manual") are never overwritten by a feed
 *  - admin-edited fields (events.lockedFields) survive re-sync
 *  - a "verified" row is never silently downgraded by an automatic run
 *  - nothing is invented: unknown price/venue/coords stay null
 */
import { and, eq, isNull, or } from "drizzle-orm";
import type { DB } from "../db/client";
import { events, type EventSourceRow } from "../db/schema";
import type { Env } from "../env";
import { newId } from "../lib/id";
import { dedupeHash } from "./dedupe";
import { normalizeEvent } from "./normalize";
import { adapterFor } from "./sources";
import { SourceNotConfigured, type NormalizedEvent, type SourceRunResult } from "./types";

/** Fields an automatic run is allowed to write (everything except identity + admin state). */
const SYNCABLE = [
  "title",
  "description",
  "kind",
  "categoryId",
  "subcategory",
  "venueName",
  "address",
  "city",
  "lat",
  "lng",
  "startsAt",
  "endsAt",
  "allDay",
  "status",
  "priceType",
  "priceMinCents",
  "priceMaxCents",
  "currency",
  "url",
  "ticketUrl",
  "imageUrl",
  "imageSource",
  "imageAttribution",
  "tags",
] as const;

export async function runSource(
  db: DB,
  env: Env,
  source: EventSourceRow,
): Promise<SourceRunResult> {
  const res: SourceRunResult = {
    ok: true,
    added: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
    message: "",
  };

  let raw;
  try {
    raw = await adapterFor(source.kind).fetchRaw(env, source);
  } catch (e) {
    if (e instanceof SourceNotConfigured) {
      return { ...res, ok: false, message: e.message };
    }
    return {
      ...res,
      ok: false,
      errors: 1,
      message: e instanceof Error ? e.message.slice(0, 300) : "fetch failed",
    };
  }

  const now = Math.floor(Date.now() / 1000);
  for (const r of raw) {
    let norm: NormalizedEvent | null;
    try {
      norm = normalizeEvent(r);
    } catch {
      res.errors++;
      continue;
    }
    if (!norm) {
      res.skipped++;
      continue;
    }
    // drop events that already finished more than a day ago — no value carrying them
    if (norm.startsAt < now - 86_400 && (norm.endsAt ?? norm.startsAt) < now - 86_400) {
      res.skipped++;
      continue;
    }

    const hash = dedupeHash(norm.title, norm.startsAt, norm.city);

    const existing = await db
      .select()
      .from(events)
      .where(
        or(
          and(
            eq(events.sourceId, source.id),
            norm.externalId
              ? eq(events.externalId, norm.externalId)
              : isNull(events.externalId),
          ),
          eq(events.dedupeHash, hash),
        ),
      )
      .limit(1);

    if (existing.length === 0) {
      await db.insert(events).values({
        id: newId(),
        sourceId: source.id,
        externalId: norm.externalId || null,
        dedupeHash: hash,
        title: norm.title,
        description: norm.description,
        kind: norm.kind,
        categoryId: norm.categoryId,
        subcategory: norm.subcategory,
        venueName: norm.venueName,
        address: norm.address,
        city: norm.city,
        lat: norm.lat,
        lng: norm.lng,
        startsAt: norm.startsAt,
        endsAt: norm.endsAt,
        allDay: norm.allDay ? 1 : 0,
        status: norm.status,
        priceType: norm.priceType,
        priceMinCents: norm.priceMinCents,
        priceMaxCents: norm.priceMaxCents,
        currency: norm.currency,
        url: norm.url,
        ticketUrl: norm.ticketUrl,
        imageUrl: norm.imageUrl,
        imageSource: norm.imageSource,
        imageAttribution: norm.imageAttribution,
        tags: JSON.stringify(norm.tags),
        source: source.name.slice(0, 80),
        sourceUrl: norm.url,
        verificationStatus:
          source.trust === "third_party" ? "unverified" : "needs_review",
        lockedFields: "[]",
        lastSyncedAt: now,
        nextSyncAt: now + source.syncEveryMin * 60,
        active: 1,
        createdAt: now,
        updatedAt: now,
      });
      res.added++;
      continue;
    }

    const row = existing[0]!;
    // a human-curated manual row is authoritative — a feed never rewrites it
    if (row.source === "manual" && source.kind !== "manual") {
      res.skipped++;
      continue;
    }
    const locked = new Set<string>(safeArr(row.lockedFields));
    const patch: Record<string, unknown> = { lastSyncedAt: now, updatedAt: now };
    const syncable: Record<string, unknown> = {
      title: norm.title,
      description: norm.description,
      kind: norm.kind,
      categoryId: norm.categoryId,
      subcategory: norm.subcategory,
      venueName: norm.venueName,
      address: norm.address,
      city: norm.city,
      lat: norm.lat,
      lng: norm.lng,
      startsAt: norm.startsAt,
      endsAt: norm.endsAt,
      allDay: norm.allDay ? 1 : 0,
      status: norm.status,
      priceType: norm.priceType,
      priceMinCents: norm.priceMinCents,
      priceMaxCents: norm.priceMaxCents,
      currency: norm.currency,
      url: norm.url,
      ticketUrl: norm.ticketUrl,
      imageUrl: norm.imageUrl,
      imageSource: norm.imageSource,
      imageAttribution: norm.imageAttribution,
      tags: JSON.stringify(norm.tags),
    };
    for (const k of SYNCABLE) {
      if (locked.has(k)) continue;
      // never auto-flip a verified row back into an unverified-looking state
      if (k === "status" && row.verificationStatus === "verified") continue;
      patch[k] = syncable[k];
    }
    // keep the strongest dedupe linkage + external id we know
    if (!row.externalId && norm.externalId) patch.externalId = norm.externalId;
    if (!row.sourceId) patch.sourceId = source.id;

    await db.update(events).set(patch).where(eq(events.id, row.id));
    res.updated++;
  }

  res.message =
    `${res.added} added, ${res.updated} updated, ${res.skipped} skipped` +
    (res.errors ? `, ${res.errors} errors` : "");
  return res;
}

function safeArr(raw: string): string[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}
