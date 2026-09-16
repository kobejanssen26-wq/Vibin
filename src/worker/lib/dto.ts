import { CATEGORY_ICON, CATEGORY_LABEL, SUBCATEGORY_ICON } from "@shared/constants";
import type {
  ActivityDTO,
  GroupMemberDTO,
  PublicUser,
} from "@shared/types";
import type { Activity, GroupMember, Profile } from "../db/schema";

export function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export function avatarUrl(avatarKey: string | null): string | null {
  return avatarKey ? `/api/media/${encodeURIComponent(avatarKey)}` : null;
}

export function toPublicUser(p: {
  userId: string;
  displayName: string;
  avatarKey: string | null;
}): PublicUser {
  return {
    id: p.userId,
    displayName: p.displayName,
    avatarUrl: avatarUrl(p.avatarKey),
    initials: initialsFrom(p.displayName),
  };
}

export function toGroupMemberDTO(
  m: GroupMember,
  profile: Pick<Profile, "displayName" | "avatarKey">,
  currentUserId: string,
): GroupMemberDTO {
  return {
    id: m.userId,
    displayName: profile.displayName,
    avatarUrl: avatarUrl(profile.avatarKey),
    initials: initialsFrom(profile.displayName),
    role: m.role,
    status: m.status,
    joinedAt: m.joinedAt,
    isYou: m.userId === currentUserId,
  };
}

const PRICE_BAND_LABEL: Record<string, string> = {
  free: "Free",
  "0_10": "€0–10",
  "10_25": "€10–25",
  "25_50": "€25–50",
  "50_100": "€50–100",
  "100_plus": "€100+",
};

const eur = (c: number) => (c % 100 === 0 ? `€${c / 100}` : `€${(c / 100).toFixed(2)}`);

/**
 * Price label that never turns a group price into a per-person price (§16).
 * Prefers a researched min/max range (from the enrichment pipeline, §10-14)
 * over the coarse price band — and is honest about an estimate rather than
 * presenting it as an exact official price (§13).
 */
function priceLabel(a: Activity): string {
  if (a.priceType === "free") return "Free";

  if (a.priceMinCents != null) {
    const unit = a.priceUnitNote ? ` ${a.priceUnitNote}` : " p.p.";
    const prefix = a.priceConfidence === "estimate" ? "Approx. " : "";
    const range =
      a.priceMaxCents != null && a.priceMaxCents !== a.priceMinCents
        ? `${eur(a.priceMinCents)}–${eur(a.priceMaxCents)}`
        : eur(a.priceMinCents);
    return `${prefix}${range}${unit}`;
  }

  switch (a.priceType) {
    case "varies":
      // A "varies"-typed row with a "free" band is a data inconsistency
      // (should have been priceType "free"), not a real estimate — don't
      // say "Approx. Free".
      if (a.priceBand === "free") return "Free";
      // priceBand is otherwise a deliberately-curated per-category estimate
      // (e.g. tennis -> 10-25 EUR), not a per-venue verified price — say so
      // honestly as "Approx." rather than presenting it as exact (§13), but
      // it's real, chosen data, not an invented number.
      return PRICE_BAND_LABEL[a.priceBand]
        ? `Approx. ${PRICE_BAND_LABEL[a.priceBand]} / person`
        : "Price information unavailable";
    case "per_group":
      return a.priceCents != null ? `${eur(a.priceCents)} / group` : "Group price";
    case "from_per_person":
      return a.priceCents != null
        ? `From ${eur(a.priceCents)} / person`
        : `From ${PRICE_BAND_LABEL[a.priceBand]} / person`;
    case "per_person":
    default:
      return a.priceCents != null
        ? `${eur(a.priceCents)} / person`
        : `${PRICE_BAND_LABEL[a.priceBand] ?? "Price information unavailable"} / person`;
  }
}

function safeJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/**
 * Legacy OSM-import descriptions bake in an internal provenance sentence
 * ("From OpenStreetMap — not yet verified by VIBIN.") and sometimes the raw
 * `opening_hours` micro-syntax ("Listed hours: Mo-Fr 09:00-18:00."). Neither
 * belongs on a user-facing card (§1/§2) — but the underlying `description`
 * column is left untouched (admin/debugging still sees the raw value);
 * this only affects what toActivityDTO() hands to the client.
 */
const OSM_PROVENANCE_RE =
  /\s*From OpenStreetMap\s*[—-]\s*not yet verified by VIBIN\.?/gi;
const OSM_HOURS_RE = /\s*Listed hours:[^.]*\.?/gi;

/**
 * User-facing description: prefer real enrichment-pipeline copy
 * (`shortDescription`) when it exists; otherwise strip known internal
 * jargon from the raw import text; otherwise fall back to a minimal,
 * honest, fact-only line built from real structured fields — never an
 * invented sentence (§9, §36).
 */
function displayDescription(a: Activity): string {
  if (a.shortDescription) return a.shortDescription;
  const cleaned = (a.description || "")
    .replace(OSM_PROVENANCE_RE, "")
    .replace(OSM_HOURS_RE, "")
    .trim();
  if (cleaned) return cleaned;
  const what = a.subcategory || CATEGORY_LABEL[a.categoryId] || "Activity";
  return a.city ? `${what} in ${a.city}.` : `${what}.`;
}

/**
 * Tag values that are internal pipeline/moderation state, not a decision-
 * making fact a user would understand (§6/§38) — e.g. "osm", "needs-review".
 * Indoor/outdoor values are dropped too since that's already its own pill
 * (activity.indoorOutdoor) and would otherwise show twice.
 */
const INTERNAL_TAGS = new Set([
  "osm",
  "web",
  "admin",
  "needs-review",
  "unverified",
  "imported",
  "generated",
  "source",
  "both",
  "indoor",
  "outdoor",
]);

function displayTags(raw: string[]): string[] {
  return raw
    .filter((t) => !INTERNAL_TAGS.has(t.toLowerCase()))
    .map((t) =>
      t.toLowerCase().startsWith("cuisine:")
        ? t.slice("cuisine:".length).replace(/[-_]/g, " ").trim()
        : t,
    )
    .map((t) => (t ? t[0]!.toUpperCase() + t.slice(1) : t))
    .filter(Boolean);
}

/**
 * Strip internal-pipeline wording from a photo credit without inventing a
 * fancier source than what's actually known (§20). Unsplash's license does
 * not require on-image attribution, so — unlike Wikimedia Commons, which
 * does — a generic "Photo via Unsplash" label is suppressed entirely
 * rather than reworded: it reads like a database credit to a user and adds
 * nothing they need to know.
 */
function displayImageAttribution(raw: string | null, imageSource: string | null): string | null {
  if (!raw) return null;
  if (imageSource === "Unsplash") return null;
  const cleaned = raw
    .replace(/\s*[—-]\s*via OpenStreetMap\s*$/i, "")
    .replace(/^Photo via OpenStreetMap contributor$/i, "Photo: community contributor");
  return cleaned.trim() || null;
}

export function toActivityDTO(
  a: Activity,
  extraImages: string[] = [],
  distanceKm: number | null = null,
): ActivityDTO {
  const images = [a.imageUrl, ...extraImages].filter(
    (x): x is string => typeof x === "string" && x.length > 0,
  );
  const shortDesc = displayDescription(a);
  return {
    id: a.id,
    title: a.title,
    description: shortDesc,
    fullDescription: a.fullDescription || shortDesc,
    category: a.categoryId as ActivityDTO["category"],
    subcategory: a.subcategory,
    // Prefer the specific subcategory as the primary badge (§5 — "Tennis"
    // beats "Sport"); the broad category remains available separately for
    // filtering and as the icon fallback when the subcategory isn't mapped.
    categoryLabel: a.subcategory || CATEGORY_LABEL[a.categoryId] || "Other",
    categoryIcon:
      (a.subcategory && SUBCATEGORY_ICON[a.subcategory]) ||
      CATEGORY_ICON[a.categoryId] ||
      "✨",
    provider: a.provider,
    providerWebsite: a.providerWebsite,
    locationLabel: a.locationLabel,
    address: a.address,
    city: a.city,
    country: a.country,
    lat: a.lat != null ? a.lat / 1e6 : null,
    lng: a.lng != null ? a.lng / 1e6 : null,
    distanceKm: distanceKm != null ? Math.round(distanceKm * 10) / 10 : null,
    priceCents: a.priceCents,
    priceType: a.priceType,
    priceBand: a.priceBand,
    priceLabel: priceLabel(a),
    priceIsEstimate: a.priceConfidence === "estimate" || (a.priceType === "varies" && a.priceMinCents == null),
    currency: a.currency,
    durationMin: a.durationMin,
    minParticipants: a.minParticipants,
    maxParticipants: a.maxParticipants,
    minAge: a.minAge,
    indoorOutdoor: a.indoorOutdoor ?? null,
    accessibility: a.accessibility,
    openingHours: safeJson<Record<string, string>>(a.openingHours, {}),
    websiteUrl: a.websiteUrl,
    bookingUrl: a.bookingUrl,
    ticketUrl: a.ticketUrl,
    imageUrl: a.imageUrl,
    images,
    imageSource: a.imageSource,
    imageAttribution: displayImageAttribution(a.imageAttribution, a.imageSource),
    tags: displayTags(safeJson<string[]>(a.tags, [])).slice(0, 5),
    source: a.source,
    sourceUrl: a.sourceUrl,
    lastVerifiedAt: a.lastVerifiedAt,
    status: a.status,
    monetizationType: a.monetizationType,
    availabilityNote:
      "Activity information is provided for planning. Prices and availability can change — check with the provider before you book.",
  };
}
