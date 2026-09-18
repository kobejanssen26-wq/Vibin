import type { AvailabilityStatus } from "@shared/types";

/**
 * Honest, consistent wording for how confident VIBIN actually is about one
 * specific date/time (§25 of the availability spec) — never says
 * "available" unless a real booking source confirmed it. VIBIN has no live
 * booking-API integration today, so in practice only "opening_hours_only"
 * and "unknown" are ever produced; the rest are modelled for when a real
 * integration exists, so this component already renders them correctly.
 */
const COPY: Record<AvailabilityStatus, { text: string; tone: string } | null> = {
  confirmed_available: { text: "Available", tone: "text-lime-700" },
  confirmed_unavailable: { text: "Unavailable", tone: "text-danger-600" },
  alternative_available: { text: "Alternative times available", tone: "text-amber-700" },
  opening_hours_only: { text: "Open at this time — not a confirmed booking", tone: "text-navy-400" },
  unknown: { text: "Availability not confirmed with the provider", tone: "text-navy-300" },
  booking_not_supported: { text: "Booking online isn't supported here", tone: "text-navy-300" },
  sold_out: { text: "Sold out", tone: "text-danger-600" },
};

export function AvailabilityNote({
  status,
  className = "",
}: {
  status: AvailabilityStatus;
  className?: string;
}) {
  const copy = COPY[status];
  if (!copy) return null;
  return <p className={`text-xs font-medium ${copy.tone} ${className}`}>{copy.text}</p>;
}
