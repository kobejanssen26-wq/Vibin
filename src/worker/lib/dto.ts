import { CATEGORY_ICON, CATEGORY_LABEL } from "@shared/constants";
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

/**
 * Price label that never turns a group price into a per-person price (§16).
 */
function priceLabel(a: Activity): string {
  const eur = (c: number) => (c % 100 === 0 ? `€${c / 100}` : `€${(c / 100).toFixed(2)}`);
  switch (a.priceType) {
    case "free":
      return "Free";
    case "varies":
      return "Price varies";
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
        : `${PRICE_BAND_LABEL[a.priceBand] ?? "Price varies"} / person`;
  }
}

function safeJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function toActivityDTO(
  a: Activity,
  extraImages: string[] = [],
  distanceKm: number | null = null,
): ActivityDTO {
  const images = [a.imageUrl, ...extraImages].filter(
    (x): x is string => typeof x === "string" && x.length > 0,
  );
  return {
    id: a.id,
    title: a.title,
    description: a.description,
    category: a.categoryId as ActivityDTO["category"],
    subcategory: a.subcategory,
    categoryLabel: CATEGORY_LABEL[a.categoryId] ?? "Other",
    categoryIcon: CATEGORY_ICON[a.categoryId] ?? "✨",
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
    imageAttribution: a.imageAttribution,
    tags: safeJson<string[]>(a.tags, []),
    source: a.source,
    sourceUrl: a.sourceUrl,
    lastVerifiedAt: a.lastVerifiedAt,
    status: a.status,
    monetizationType: a.monetizationType,
    availabilityNote:
      "Activity information is provided for planning. Prices and availability can change — check with the provider before you book.",
  };
}
