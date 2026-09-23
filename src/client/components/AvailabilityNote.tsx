import type { AvailabilityStatus } from "@shared/types";
import { useLang, type Key } from "../lib/i18n";

/**
 * Honest, consistent wording for how confident VIBIN actually is about one
 * specific date/time (§25 of the availability spec) — never says
 * "available" unless a real booking source confirmed it. VIBIN has no live
 * booking-API integration today, so in practice only "opening_hours_only"
 * and "unknown" are ever produced; the rest are modelled for when a real
 * integration exists, so this component already renders them correctly.
 */
const TONE: Record<AvailabilityStatus, string | null> = {
  confirmed_available: "text-lime-700",
  confirmed_unavailable: "text-danger-600",
  alternative_available: "text-amber-700",
  opening_hours_only: "text-navy-400",
  unknown: "text-navy-300",
  booking_not_supported: "text-navy-300",
  sold_out: "text-danger-600",
};

export function AvailabilityNote({
  status,
  className = "",
}: {
  status: AvailabilityStatus;
  className?: string;
}) {
  const { t } = useLang();
  const tone = TONE[status];
  if (!tone) return null;
  return (
    <p className={`text-xs font-medium ${tone} ${className}`}>
      {t(`availability.${status}` as Key)}
    </p>
  );
}
