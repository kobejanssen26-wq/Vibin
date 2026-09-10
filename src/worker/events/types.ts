/**
 * Ingestion-layer types for the live-events pipeline.
 *
 *   fetch (adapter) -> RawEvent[]
 *        -> normalize -> NormalizedEvent
 *        -> geocode   -> + lat/lng
 *        -> dedupe    -> + dedupeHash, match existing
 *        -> upsert    -> events table
 *
 * An adapter only has to produce `RawEvent`s from its source; everything after
 * that is shared and source-agnostic.
 */
import type { EventKind, EventPriceType, EventStatus } from "@shared/types";
import type { EventSourceRow } from "../db/schema";
import type { Env } from "../env";

/** Loosely-typed event as it comes off a feed — all fields optional/strings. */
export interface RawEvent {
  /** the source's stable id for this event (required for re-sync) */
  externalId: string;
  title: string;
  description?: string | null;
  kind?: string | null;
  category?: string | null;
  subcategory?: string | null;
  venueName?: string | null;
  address?: string | null;
  city?: string | null;
  lat?: number | null;
  lng?: number | null;
  /** ISO 8601, or unix seconds/millis */
  startsAt: string | number;
  endsAt?: string | number | null;
  allDay?: boolean;
  status?: string | null;
  priceType?: string | null;
  priceMinCents?: number | null;
  priceMaxCents?: number | null;
  currency?: string | null;
  url?: string | null;
  ticketUrl?: string | null;
  imageUrl?: string | null;
  imageAttribution?: string | null;
  tags?: string[] | null;
}

/** After normalize(): typed, clamped, safe to write. lat/lng added by geocode(). */
export interface NormalizedEvent {
  externalId: string;
  title: string;
  description: string;
  kind: EventKind;
  categoryId: string | null;
  subcategory: string | null;
  venueName: string | null;
  address: string | null;
  city: string | null;
  lat: number | null; // *1e6
  lng: number | null; // *1e6
  startsAt: number; // unix seconds
  endsAt: number | null;
  allDay: boolean;
  status: EventStatus;
  priceType: EventPriceType;
  priceMinCents: number | null;
  priceMaxCents: number | null;
  currency: string;
  url: string | null;
  ticketUrl: string | null;
  imageUrl: string | null;
  imageSource: string | null;
  imageAttribution: string | null;
  tags: string[];
}

export interface SourceRunResult {
  ok: boolean;
  added: number;
  updated: number;
  skipped: number;
  errors: number;
  message: string;
}

/** A concrete feed. `fetchRaw` is the only source-specific part. */
export interface EventSourceAdapter {
  kind: EventSourceRow["kind"];
  /**
   * Pull the current events from the source. Throw `SourceNotConfigured` when
   * the source needs credentials/config that aren't present — the pipeline
   * records that cleanly instead of treating it as a hard error.
   */
  fetchRaw(env: Env, source: EventSourceRow): Promise<RawEvent[]>;
}

export class SourceNotConfigured extends Error {
  constructor(what: string) {
    super(`event source not configured: ${what}`);
    this.name = "SourceNotConfigured";
  }
}
