import { DescriptionCredit } from "./DescriptionCredit";
import { useEffect } from "react";
import type { ActivityDTO } from "@shared/types";
import { CATEGORY_ICON } from "@shared/constants";
import { track } from "../lib/track";
import { formatDuration } from "../lib/format";
import { useLang } from "../lib/i18n";
import {
  IconClose,
  IconMapPin,
  IconClock,
  IconTag,
  IconUsers,
  IconInfo,
  IconExternal,
  IconShare,
} from "./icons";

/**
 * Tap-to-expand detail sheet (§21/§22 of the activity-intelligence spec) —
 * "enough information to decide whether to look further", then a clear path
 * to the real, official destination. Every outbound action routes through the
 * server-side /api/go/ redirect so a click is measured reliably; the label on
 * each button reflects only a URL that activity actually has (never a fake
 * "Tickets" button pointing nowhere).
 */
export function ActivityExpanded({
  activity: a,
  groupId,
  onClose,
}: {
  activity: ActivityDTO;
  /** for click/share attribution — omit outside a group context */
  groupId?: string;
  onClose: () => void;
}) {
  const { t } = useLang();
  useEffect(() => {
    track({
      name: "activity_expanded",
      groupId,
      activityId: a.id,
      dedupeKey: `${groupId ?? "solo"}:${a.id}:expand`,
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a.id]);

  const goHref = (kind: "website" | "booking" | "ticket") =>
    `/api/go/activity/${a.id}?kind=${kind}&src=expanded_card${
      groupId ? `&groupId=${encodeURIComponent(groupId)}` : ""
    }`;

  const primary = a.ticketUrl
    ? { kind: "ticket" as const, label: t("activityExpanded.tickets") }
    : a.bookingUrl
      ? { kind: "booking" as const, label: t("activityExpanded.bookNow") }
      : a.websiteUrl
        ? { kind: "website" as const, label: t("activityExpanded.visitWebsite") }
        : null;
  const secondaryWebsite =
    primary?.kind !== "website" && a.websiteUrl ? true : false;

  // No website/booking/ticket link on file at all — fall back to a Google
  // Maps search on this activity's own real coordinates (or name + location
  // as text) so there's still a real way to find and contact the place,
  // rather than a dead end. Never a fabricated business-specific URL.
  const mapsQuery = a.lat != null && a.lng != null
    ? `${a.lat},${a.lng}`
    : [a.provider ?? a.title, a.address ?? a.locationLabel].filter(Boolean).join(", ");
  const mapsHref = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery)}`;

  const share = async () => {
    track({ name: "activity_shared", groupId, activityId: a.id });
    const shareData = { title: a.title, text: a.description.slice(0, 140) };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch {
        /* cancelled */
      }
    } else if (navigator.clipboard) {
      await navigator.clipboard.writeText(a.title).catch(() => {});
    }
  };

  const openingDays = Object.entries(a.openingHours).filter(([, v]) => v);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-navy/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="activity-expanded-title"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="card-raised flex max-h-[92vh] w-full max-w-md animate-slide-up flex-col overflow-hidden rounded-b-none sm:rounded-b-3xl">
        <div className="relative h-56 shrink-0 w-full overflow-hidden">
          {a.imageUrl ? (
            <img
              src={a.imageUrl}
              alt={a.title}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="grid h-full w-full place-items-center bg-vibin-blue">
              <span className="text-5xl">{CATEGORY_ICON[a.category] ?? "✨"}</span>
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-navy/70 to-transparent" />
          <button
            type="button"
            onClick={onClose}
            aria-label={t("activityExpanded.close")}
            className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-navy/55 text-white backdrop-blur-sm"
          >
            <IconClose size={18} />
          </button>
          <span className="chip absolute left-3 top-3 border-white/20 bg-white/90 backdrop-blur">
            {a.categoryIcon} {a.categoryLabel}
          </span>
          {a.imageAttribution && (
            <span
              className="absolute bottom-2 right-3 max-w-[70%] truncate rounded bg-navy/45 px-1.5 py-0.5 text-[10px] font-medium text-white/80"
              title={a.imageAttribution}
            >
              {a.imageAttribution}
            </span>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <h2 id="activity-expanded-title" className="text-xl font-extrabold leading-tight text-navy">
            {a.title}
          </h2>
          {a.provider && (
            <p className="mt-0.5 text-sm text-navy-400">
              {t("activity.at")} {a.provider}
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-1.5 text-[13px] font-semibold">
            <span className="rounded-full bg-brand-50 px-2.5 py-1 text-brand-700">
              {a.priceLabel}
            </span>
            {a.durationMin ? (
              <span className="rounded-full bg-paper-soft px-2.5 py-1 text-navy-600">
                {formatDuration(a.durationMin)}
              </span>
            ) : null}
            {a.indoorOutdoor ? (
              <span className="rounded-full bg-paper-soft px-2.5 py-1 text-navy-600">
                {a.indoorOutdoor === "indoor"
                  ? t("activity.indoor")
                  : a.indoorOutdoor === "outdoor"
                    ? t("activity.outdoor")
                    : t("activity.indoorOutdoor")}
              </span>
            ) : null}
            {a.minAge ? (
              <span className="rounded-full bg-paper-soft px-2.5 py-1 text-navy-600">
                {a.minAge}+
              </span>
            ) : null}
          </div>

          {a.fullDescription && (
            <p className="mt-3 text-sm leading-relaxed text-navy-600">
              {a.fullDescription}
            </p>
          )}
          <DescriptionCredit credit={a.descriptionCredit} />

          <div className="mt-4 space-y-2 border-t border-paper-line pt-3 text-sm">
            <Row icon={<IconMapPin size={16} />}>
              {a.locationLabel}
              {a.distanceKm != null ? ` · ${a.distanceKm} km` : ""}
            </Row>
            {(a.minParticipants || a.maxParticipants) && (
              <Row icon={<IconUsers size={16} />}>
                {a.minParticipants && a.maxParticipants
                  ? t("activityExpanded.peopleRange", {
                      min: a.minParticipants,
                      max: a.maxParticipants,
                    })
                  : a.maxParticipants
                    ? t("activityExpanded.peopleUpTo", { max: a.maxParticipants })
                    : t("activityExpanded.peopleFrom", { min: a.minParticipants! })}
              </Row>
            )}
            {a.accessibility && (
              <Row icon={<IconInfo size={16} />}>{a.accessibility}</Row>
            )}
            {openingDays.length > 0 && (
              <Row icon={<IconClock size={16} />}>
                {openingDays.map(([d, h]) => `${d} ${h}`).join(" · ")}
              </Row>
            )}
            {a.tags.length > 0 && (
              <Row icon={<IconTag size={16} />}>{a.tags.slice(0, 6).join(", ")}</Row>
            )}
          </div>

          <p className="mt-4 text-xs text-navy-400">{a.availabilityNote}</p>
        </div>

        <div className="flex shrink-0 gap-2 border-t border-paper-line p-3">
          {primary ? (
            <a
              href={goHref(primary.kind)}
              target="_blank"
              rel="noreferrer"
              className="btn-primary flex-1"
            >
              <IconExternal size={16} />
              {primary.label}
            </a>
          ) : (
            <a
              href={mapsHref}
              target="_blank"
              rel="noreferrer"
              className="btn-primary flex-1"
              onClick={() =>
                track({
                  name: "activity_maps_fallback_clicked",
                  groupId,
                  activityId: a.id,
                })
              }
            >
              <IconMapPin size={16} />
              {t("activityExpanded.findOnMaps")}
            </a>
          )}
          {secondaryWebsite && (
            <a
              href={goHref("website")}
              target="_blank"
              rel="noreferrer"
              className="btn-outline"
              aria-label={t("activityExpanded.visitWebsiteAria", { title: a.title })}
            >
              <IconExternal size={16} />
            </a>
          )}
          <button
            type="button"
            onClick={share}
            className="btn-outline"
            aria-label={t("activityExpanded.shareAria", { title: a.title })}
          >
            <IconShare size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 text-navy-600">
      <span className="mt-0.5 shrink-0 text-navy-400">{icon}</span>
      <span className="min-w-0">{children}</span>
    </p>
  );
}
