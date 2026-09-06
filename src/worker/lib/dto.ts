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
  "0_10": "€0–10 pp",
  "10_25": "€10–25 pp",
  "25_50": "€25–50 pp",
  "50_100": "€50–100 pp",
  "100_plus": "€100+ pp",
};

function priceLabel(a: Activity): string {
  if (a.priceCents != null) {
    const eur = a.priceCents / 100;
    return a.priceCents === 0
      ? "Free"
      : `€${eur % 1 === 0 ? eur.toFixed(0) : eur.toFixed(2)} pp`;
  }
  return PRICE_BAND_LABEL[a.priceBand] ?? "Price varies";
}

function safeJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function toActivityDTO(a: Activity, extraImages: string[] = []): ActivityDTO {
  const images = [a.imageUrl, ...extraImages].filter(
    (x): x is string => typeof x === "string" && x.length > 0,
  );
  return {
    id: a.id,
    title: a.title,
    description: a.description,
    category: a.categoryId as ActivityDTO["category"],
    categoryLabel: CATEGORY_LABEL[a.categoryId] ?? "Other",
    categoryIcon: CATEGORY_ICON[a.categoryId] ?? "✨",
    locationLabel: a.locationLabel,
    lat: a.lat != null ? a.lat / 1e6 : null,
    lng: a.lng != null ? a.lng / 1e6 : null,
    priceCents: a.priceCents,
    priceBand: a.priceBand,
    priceLabel: priceLabel(a),
    currency: a.currency,
    durationMin: a.durationMin,
    openingHours: safeJson<Record<string, string>>(a.openingHours, {}),
    websiteUrl: a.websiteUrl,
    bookingUrl: a.bookingUrl,
    ticketUrl: a.ticketUrl,
    minAge: a.minAge,
    imageUrl: a.imageUrl,
    images,
    tags: safeJson<string[]>(a.tags, []),
    source: a.source,
    availabilityNote:
      "Activity information only — check the provider for live availability and pricing before you book.",
  };
}
