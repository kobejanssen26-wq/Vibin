import type { EventDTO } from "@shared/types";
import type { EventRow } from "../db/schema";

const FRESHNESS_NOTE =
  "Event details come from third-party sources and can change — check the organiser before you go.";

function euro(cents: number): string {
  return cents % 100 === 0 ? `€${cents / 100}` : `€${(cents / 100).toFixed(2)}`;
}

function priceLabel(e: EventRow): string {
  if (e.priceType === "free") return "Free";
  if (e.priceMinCents != null && e.priceMaxCents != null && e.priceMaxCents !== e.priceMinCents)
    return `${euro(e.priceMinCents)}–${euro(e.priceMaxCents)}`;
  if (e.priceMinCents != null) return `From ${euro(e.priceMinCents)}`;
  if (e.priceType === "paid") return "Ticketed";
  return "Price information unavailable";
}

/** Short, human "when" using the viewer's request time as "now". */
function whenLabel(e: EventRow, now: number): string {
  if (e.status === "cancelled") return "Cancelled";
  if (e.status === "postponed") return "Postponed";
  if (e.status === "live") return "Live now";
  if (e.status === "completed") return "Ended";

  const delta = e.startsAt - now;
  const day = 86_400;
  const d = new Date(e.startsAt * 1000);
  const hhmm = `${String(d.getUTCHours()).padStart(2, "0")}:${String(
    d.getUTCMinutes(),
  ).padStart(2, "0")}`;

  if (delta < 0) return "Started";
  if (delta < 3600) return `In ${Math.max(1, Math.round(delta / 60))} min`;
  if (delta < 12 * 3600) return `In ${Math.round(delta / 3600)} h`;
  if (delta < day) return e.allDay ? "Today" : `Today ${hhmm}`;
  if (delta < 2 * day) return e.allDay ? "Tomorrow" : `Tomorrow ${hhmm}`;
  if (delta < 7 * day) return `In ${Math.round(delta / day)} days`;
  if (delta < 14 * day) return "Next week";
  return `In ${Math.round(delta / day)} days`;
}

export function toEventDTO(
  e: EventRow,
  distanceKm: number | null = null,
  now: number = Math.floor(Date.now() / 1000),
): EventDTO {
  let tags: string[] = [];
  try {
    const v = JSON.parse(e.tags);
    if (Array.isArray(v)) tags = v.map(String);
  } catch {
    /* keep [] */
  }
  return {
    id: e.id,
    title: e.title,
    description: e.description,
    kind: e.kind,
    category: (e.categoryId as EventDTO["category"]) ?? null,
    subcategory: e.subcategory,
    venueName: e.venueName,
    address: e.address,
    city: e.city,
    lat: e.lat != null ? e.lat / 1e6 : null,
    lng: e.lng != null ? e.lng / 1e6 : null,
    distanceKm: distanceKm != null ? Math.round(distanceKm * 10) / 10 : null,
    startsAt: e.startsAt,
    endsAt: e.endsAt,
    allDay: e.allDay === 1,
    timezone: e.timezone,
    whenLabel: whenLabel(e, now),
    status: e.status,
    priceType: e.priceType,
    priceMinCents: e.priceMinCents,
    priceMaxCents: e.priceMaxCents,
    currency: e.currency,
    priceLabel: priceLabel(e),
    url: e.url,
    ticketUrl: e.ticketUrl,
    imageUrl: e.imageUrl,
    imageSource: e.imageSource,
    imageAttribution: e.imageAttribution,
    tags,
    source: e.source,
    sourceUrl: e.sourceUrl,
    verificationStatus: e.verificationStatus,
    lastSyncedAt: e.lastSyncedAt,
    freshnessNote: FRESHNESS_NOTE,
  };
}
