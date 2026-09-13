import type { ActivityInput } from "./activity-input";

/**
 * One shared column list drives the CSV template, the import parser and the
 * export — so "download template" and "export" always produce something the
 * import can read back, and a new activity field never has to be added in
 * three places.
 */
export interface ActivityCsvColumn {
  key: keyof ActivityInput;
  header: string;
  /** Convert one trimmed CSV cell into the raw value activityInput expects
   *  (still unvalidated — zod does the real validation afterwards). */
  parse: (raw: string) => unknown;
  /** Render a stored activity field back into a CSV cell string. */
  format: (v: unknown) => string;
}

const emptyToNull = (s: string): string | null => (s === "" ? null : s);
const numOrNull = (s: string): number | null | typeof NaN => (s === "" ? null : Number(s));
const numOrUndef = (s: string): number | undefined => (s === "" ? undefined : Number(s));
const strOrUndef = (s: string): string | undefined => (s === "" ? undefined : s);
const toBool = (s: string): boolean => ["1", "true", "yes", "y"].includes(s.toLowerCase());
const toTags = (s: string): string[] =>
  s === "" ? [] : s.split(";").map((x) => x.trim()).filter(Boolean);

const str = (v: unknown) => (v == null ? "" : String(v));
const boolStr = (v: unknown) => (v ? "true" : "false");
const tagsStr = (v: unknown) => (Array.isArray(v) ? v.join(";") : "");

// "mon:9:00-18:00;tue:9:00-18:00" <-> { mon: "9:00-18:00", tue: "9:00-18:00" }
const parseHours = (s: string): Record<string, string> => {
  const out: Record<string, string> = {};
  if (!s) return out;
  for (const part of s.split(";")) {
    const i = part.indexOf(":");
    if (i <= 0) continue;
    const day = part.slice(0, i).trim().toLowerCase();
    const hours = part.slice(i + 1).trim();
    if (day && hours) out[day] = hours;
  }
  return out;
};
const hoursStr = (v: unknown) =>
  v && typeof v === "object"
    ? Object.entries(v as Record<string, string>)
        .filter(([, val]) => val)
        .map(([k, val]) => `${k}:${val}`)
        .join(";")
    : "";

export const ACTIVITY_CSV_COLUMNS: ActivityCsvColumn[] = [
  { key: "title", header: "title", parse: (s) => s, format: str },
  { key: "description", header: "description", parse: (s) => s, format: str },
  { key: "categoryId", header: "category", parse: (s) => s, format: str },
  { key: "subcategory", header: "subcategory", parse: emptyToNull, format: str },
  { key: "provider", header: "provider", parse: emptyToNull, format: str },
  { key: "providerWebsite", header: "provider_website", parse: emptyToNull, format: str },
  { key: "locationLabel", header: "location_label", parse: (s) => s, format: str },
  { key: "address", header: "address", parse: emptyToNull, format: str },
  { key: "city", header: "city", parse: emptyToNull, format: str },
  { key: "country", header: "country", parse: (s) => s || "BE", format: str },
  { key: "lat", header: "latitude", parse: numOrNull, format: str },
  { key: "lng", header: "longitude", parse: numOrNull, format: str },
  { key: "priceCents", header: "price_cents", parse: numOrNull, format: str },
  { key: "priceType", header: "price_type", parse: strOrUndef, format: str },
  { key: "priceBand", header: "price_band", parse: (s) => s, format: str },
  { key: "durationMin", header: "duration_min", parse: numOrNull, format: str },
  { key: "minParticipants", header: "min_participants", parse: numOrNull, format: str },
  { key: "maxParticipants", header: "max_participants", parse: numOrNull, format: str },
  { key: "minAge", header: "min_age", parse: numOrNull, format: str },
  { key: "indoorOutdoor", header: "indoor_outdoor", parse: emptyToNull, format: str },
  { key: "accessibility", header: "accessibility", parse: emptyToNull, format: str },
  { key: "openingHours", header: "opening_hours", parse: parseHours, format: hoursStr },
  { key: "websiteUrl", header: "website_url", parse: emptyToNull, format: str },
  { key: "bookingUrl", header: "booking_url", parse: emptyToNull, format: str },
  { key: "ticketUrl", header: "ticket_url", parse: emptyToNull, format: str },
  { key: "imageUrl", header: "image_url", parse: emptyToNull, format: str },
  { key: "imageSource", header: "image_source", parse: emptyToNull, format: str },
  { key: "imageAttribution", header: "image_attribution", parse: emptyToNull, format: str },
  { key: "tags", header: "tags", parse: toTags, format: tagsStr },
  { key: "source", header: "source", parse: (s) => s || "admin", format: str },
  { key: "sourceUrl", header: "source_url", parse: emptyToNull, format: str },
  { key: "status", header: "verification_status", parse: strOrUndef, format: str },
  { key: "active", header: "active", parse: toBool, format: boolStr },
  { key: "monetizationType", header: "monetization_type", parse: strOrUndef, format: str },
  { key: "affiliateUrl", header: "affiliate_url", parse: emptyToNull, format: str },
  { key: "affiliateNetwork", header: "affiliate_network", parse: emptyToNull, format: str },
  { key: "commissionType", header: "commission_type", parse: strOrUndef, format: str },
  { key: "commissionRate", header: "commission_rate", parse: numOrUndef, format: str },
  { key: "commissionCurrency", header: "commission_currency", parse: emptyToNull, format: str },
];

/** Columns a NEW activity truly cannot do without — checked against the CSV
 *  header before any row is parsed, so a missing column fails fast with one
 *  clear message instead of thousands of confusing per-row errors. */
export const REQUIRED_CSV_HEADERS = ["title", "category", "location_label", "price_band"];

export const IMPORT_TEMPLATE_HEADERS = ["id", ...ACTIVITY_CSV_COLUMNS.map((c) => c.header)];

export const EXPORT_HEADERS = [
  "id",
  ...ACTIVITY_CSV_COLUMNS.map((c) => c.header),
  "source_verified_at",
  "created_at",
  "updated_at",
];
