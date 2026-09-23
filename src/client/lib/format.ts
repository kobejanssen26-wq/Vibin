import { intlLocale, translate } from "./i18n";

const TZ = "Europe/Brussels";

export function formatWhen(epochSec: number | null): string {
  if (!epochSec) return translate("format.dateTbd");
  return new Intl.DateTimeFormat(intlLocale(), {
    timeZone: TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(epochSec * 1000));
}

export function formatDay(epochSec: number): string {
  return new Intl.DateTimeFormat(intlLocale(), {
    timeZone: TZ,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(epochSec * 1000));
}

export function formatTime(epochSec: number): string {
  return new Intl.DateTimeFormat(intlLocale(), {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(epochSec * 1000));
}

export function relativeTime(epochSec: number): string {
  const diff = Date.now() / 1000 - epochSec;
  if (diff < 60) return translate("format.justNow");
  if (diff < 3600) return translate("format.minutesAgo", { n: Math.floor(diff / 60) });
  if (diff < 86400) return translate("format.hoursAgo", { n: Math.floor(diff / 3600) });
  if (diff < 604800) return translate("format.daysAgo", { n: Math.floor(diff / 86400) });
  return formatDay(epochSec);
}

export function formatDuration(min: number): string {
  if (min < 60) return translate("format.durationMin", { min });
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? translate("format.durationHM", { h, m }) : translate("format.durationH", { h });
}

export function initials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (!p.length) return "?";
  if (p.length === 1) return p[0]!.slice(0, 2).toUpperCase();
  return (p[0]![0]! + p[p.length - 1]![0]!).toUpperCase();
}
