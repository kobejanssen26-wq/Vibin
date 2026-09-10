/**
 * RawEvent -> NormalizedEvent: trims, clamps, maps free-text kind/category onto
 * our enums, parses whatever date shape the feed used, and geocodes the city
 * through the offline Belgian resolver when the feed gave no coordinates.
 *
 * Anything it can't determine becomes null / "unknown" — never a guess.
 */
import type { EventKind, EventPriceType, EventStatus } from "@shared/types";
import { resolvePlace } from "../lib/be-places";
import type { NormalizedEvent, RawEvent } from "./types";

const KINDS: EventKind[] = [
  "sports",
  "music",
  "culture",
  "market",
  "festival",
  "seasonal",
  "food",
  "family",
  "community",
  "nightlife",
  "other",
];

/** free-text -> EventKind */
const KIND_ALIASES: Record<string, EventKind> = {
  sport: "sports",
  sports: "sports",
  voetbal: "sports",
  football: "sports",
  basketbal: "sports",
  basketball: "sports",
  wielrennen: "sports",
  cycling: "sports",
  tennis: "sports",
  match: "sports",
  wedstrijd: "sports",
  concert: "music",
  concerten: "music",
  muziek: "music",
  music: "music",
  gig: "music",
  dj: "music",
  festival: "festival",
  festivals: "festival",
  museum: "culture",
  expo: "culture",
  tentoonstelling: "culture",
  exhibition: "culture",
  theater: "culture",
  theatre: "culture",
  comedy: "culture",
  cinema: "culture",
  kunst: "culture",
  art: "culture",
  markt: "market",
  market: "market",
  braderie: "market",
  rommelmarkt: "market",
  "flea market": "market",
  jaarmarkt: "market",
  kerstmarkt: "seasonal",
  "christmas market": "seasonal",
  halloween: "seasonal",
  kermis: "seasonal",
  vuurwerk: "seasonal",
  food: "food",
  "food festival": "food",
  tasting: "food",
  kids: "family",
  familie: "family",
  family: "family",
  workshop: "family",
  dorpsfeest: "community",
  buurtfeest: "community",
  community: "community",
  club: "nightlife",
  nightlife: "nightlife",
  party: "nightlife",
  fuif: "nightlife",
};

/** EventKind -> our activity-category slug, for filter parity with activities. */
const KIND_TO_CATEGORY: Record<EventKind, string | null> = {
  sports: "sport",
  music: "entertainment",
  culture: "culture",
  market: "other",
  festival: "entertainment",
  seasonal: "other",
  food: "food_drinks",
  family: "other",
  community: "other",
  nightlife: "nightlife",
  other: null,
};

const STATUSES: EventStatus[] = [
  "upcoming",
  "live",
  "completed",
  "cancelled",
  "postponed",
  "sold_out",
  "unknown",
];

const PRICE_TYPES: EventPriceType[] = ["free", "paid", "varies", "unknown"];

function toEpochSeconds(v: string | number | null | undefined): number | null {
  if (v == null) return null;
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return null;
    return v > 1e12 ? Math.floor(v / 1000) : Math.floor(v);
  }
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : Math.floor(t / 1000);
}

const clampStr = (s: string | null | undefined, max: number): string | null => {
  const t = (s ?? "").trim();
  return t ? t.slice(0, max) : null;
};

export function mapKind(raw: string | null | undefined): EventKind {
  const k = (raw ?? "").trim().toLowerCase();
  if (!k) return "other";
  if (KINDS.includes(k as EventKind)) return k as EventKind;
  return KIND_ALIASES[k] ?? "other";
}

export function normalizeEvent(raw: RawEvent): NormalizedEvent | null {
  const title = clampStr(raw.title, 200);
  const startsAt = toEpochSeconds(raw.startsAt);
  if (!title || startsAt == null) return null; // unusable without a name + start

  const kind = mapKind(raw.kind ?? raw.category);
  const city = clampStr(raw.city, 80);

  let lat: number | null = null;
  let lng: number | null = null;
  if (typeof raw.lat === "number" && typeof raw.lng === "number") {
    lat = Math.round(raw.lat * 1e6);
    lng = Math.round(raw.lng * 1e6);
  } else if (city) {
    const hit = resolvePlace(city);
    if (hit) {
      lat = Math.round(hit.lat * 1e6);
      lng = Math.round(hit.lng * 1e6);
    }
  }

  const status = STATUSES.includes((raw.status ?? "") as EventStatus)
    ? (raw.status as EventStatus)
    : "upcoming";
  const priceType = PRICE_TYPES.includes((raw.priceType ?? "") as EventPriceType)
    ? (raw.priceType as EventPriceType)
    : raw.priceMinCents === 0
      ? "free"
      : raw.priceMinCents != null
        ? "paid"
        : "unknown";

  return {
    externalId: raw.externalId,
    title,
    description: clampStr(raw.description, 2000) ?? "",
    kind,
    categoryId: KIND_TO_CATEGORY[kind],
    subcategory: clampStr(raw.subcategory, 80),
    venueName: clampStr(raw.venueName, 160),
    address: clampStr(raw.address, 240),
    city,
    lat,
    lng,
    startsAt,
    endsAt: toEpochSeconds(raw.endsAt),
    allDay: Boolean(raw.allDay),
    status,
    priceType,
    priceMinCents:
      typeof raw.priceMinCents === "number" && raw.priceMinCents >= 0
        ? Math.round(raw.priceMinCents)
        : null,
    priceMaxCents:
      typeof raw.priceMaxCents === "number" && raw.priceMaxCents >= 0
        ? Math.round(raw.priceMaxCents)
        : null,
    currency: clampStr(raw.currency, 3)?.toUpperCase() ?? "EUR",
    url: clampStr(raw.url, 500),
    ticketUrl: clampStr(raw.ticketUrl, 500),
    imageUrl: clampStr(raw.imageUrl, 500),
    imageSource: raw.imageUrl ? "provider" : null,
    imageAttribution: clampStr(raw.imageAttribution, 200),
    tags: Array.isArray(raw.tags)
      ? raw.tags.map((t) => String(t).trim().slice(0, 40)).filter(Boolean).slice(0, 12)
      : [],
  };
}
