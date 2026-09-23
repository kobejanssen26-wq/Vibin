import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { SectionHead } from "./ui";
import { useLang } from "../lib/i18n";
import { localizePrice } from "../lib/format";
import { EVENT_KIND_ICON } from "@shared/constants";
import type { EventDTO, GroupSettingsDTO } from "@shared/types";

/**
 * "What's on nearby" — upcoming/live events around the group's chosen location,
 * pulled from /live-events/nearby. Renders nothing until there is at least one
 * event (the catalogue is empty until an owner connects a feed or adds events),
 * so it never shows an empty shell.
 */
export function NearbyEvents({ settings }: { settings: GroupSettingsDTO | null }) {
  const { t } = useLang();
  const [events, setEvents] = useState<EventDTO[] | null>(null);
  const lat = settings?.lat ?? null;
  const lng = settings?.lng ?? null;
  const radiusKm = settings?.radiusKm ?? 25;

  useEffect(() => {
    if (lat == null || lng == null) {
      setEvents(null);
      return;
    }
    let alive = true;
    api<{ events: EventDTO[] }>(
      `/live-events/nearby?lat=${lat}&lng=${lng}&radiusKm=${radiusKm}`,
    )
      .then((r) => alive && setEvents(r.events))
      .catch(() => alive && setEvents([]));
    return () => {
      alive = false;
    };
  }, [lat, lng, radiusKm]);

  if (!events || events.length === 0) return null;

  return (
    <section>
      <SectionHead label={t("nearby.title")} count={`${events.length}`} />
      <div className="hairline">
        {events.slice(0, 8).map((e) => {
          const body = (
            <div className="flex items-center gap-3 p-3.5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-500/10 text-lg">
                {EVENT_KIND_ICON[e.kind] ?? "✨"}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{e.title}</p>
                <p className="truncate text-xs text-navy-400">
                  {e.whenLabel}
                  {e.venueName || e.city ? ` · ${e.venueName ?? e.city}` : ""}
                  {e.distanceKm != null ? ` · ${e.distanceKm} km` : ""}
                  {e.priceLabel ? ` · ${localizePrice(e.priceLabel)}` : ""}
                </p>
              </div>
              {e.status === "live" && (
                <span className="shrink-0 rounded-full bg-lime-100 px-2 py-0.5 text-[11px] font-semibold text-lime-800">
                  {t("nearby.live")}
                </span>
              )}
            </div>
          );
          return e.url ? (
            <a
              key={e.id}
              href={e.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block transition-colors hover:bg-paper-soft"
            >
              {body}
            </a>
          ) : (
            <div key={e.id}>{body}</div>
          );
        })}
      </div>
      <p className="mt-1.5 px-1 text-[11px] text-navy-400">
        {t("nearby.disclaimer")}
      </p>
    </section>
  );
}
