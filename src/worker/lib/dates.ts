/**
 * Date helpers for VIBIN. All times are stored as unix epoch SECONDS.
 * Wall-clock resolution is done in Europe/Brussels (VIBIN's launch market),
 * DST-aware via Intl. No external date library.
 */
import type { DateMode, TimeBand } from "@shared/constants";

const TZ = "Europe/Brussels";

function zoneOffsetSeconds(at: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const p = dtf.formatToParts(at).reduce<Record<string, string>>((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  const asUTC = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour === "24" ? "0" : p.hour),
    Number(p.minute),
    Number(p.second),
  );
  return Math.round((asUTC - at.getTime()) / 1000);
}

/** Convert a Brussels wall-clock time to epoch seconds. */
export function wallClockToEpoch(
  y: number,
  m: number,
  d: number,
  hh: number,
  mm: number,
): number {
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const off = zoneOffsetSeconds(new Date(guess));
  return Math.floor(guess / 1000) - off;
}

export function brusselsParts(epochSec: number) {
  const dtf = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const p = dtf
    .formatToParts(new Date(epochSec * 1000))
    .reduce<Record<string, string>>((acc, part) => {
      acc[part.type] = part.value;
      return acc;
    }, {});
  return {
    weekday: p.weekday ?? "",
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour),
    minute: Number(p.minute),
  };
}

const TIME_BAND_HOUR: Record<Exclude<TimeBand, "specific" | "unknown">, number> = {
  morning: 10,
  afternoon: 14,
  evening: 19,
  night: 22,
};

export function resolveTimeHour(band: TimeBand, specific: string | null): number {
  if (band === "specific" && specific) {
    const [h] = specific.split(":");
    return Number(h) || 19;
  }
  if (band === "unknown" || band === "specific") return 19;
  return TIME_BAND_HOUR[band];
}

/**
 * Resolve a group's known date settings to a concrete start time.
 * Returns null when the group genuinely doesn't know yet (dateMode "unknown").
 */
export function resolveKnownStart(
  dateMode: DateMode,
  dateSpecific: number | null,
  timeBand: TimeBand,
  timeSpecific: string | null,
  nowSec = Math.floor(Date.now() / 1000),
): number | null {
  if (dateMode === "unknown") return null;

  const hour = resolveTimeHour(timeBand, timeSpecific);
  const minute =
    timeBand === "specific" && timeSpecific
      ? Number(timeSpecific.split(":")[1] ?? "0")
      : 0;

  if (dateMode === "specific" && dateSpecific) {
    const dp = brusselsParts(dateSpecific);
    return wallClockToEpoch(dp.year, dp.month, dp.day, hour, minute);
  }

  const today = brusselsParts(nowSec);
  const base = new Date(
    Date.UTC(today.year, today.month - 1, today.day, 12, 0, 0),
  );
  const dow = base.getUTCDay(); // 0 Sun .. 6 Sat

  const addDays = (n: number) => {
    const d = new Date(base.getTime() + n * 86400_000);
    return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
  };

  let target: { y: number; m: number; d: number };
  switch (dateMode) {
    case "tonight":
      target = { y: today.year, m: today.month, d: today.day };
      break;
    case "tomorrow":
      target = ((x) => ({ y: x.y, m: x.m, d: x.d }))(addDays(1));
      break;
    case "this_weekend": {
      const daysUntilSat = (6 - dow + 7) % 7 || (dow === 6 ? 0 : 7);
      target = addDays(dow === 0 ? 0 : daysUntilSat);
      break;
    }
    case "this_week":
      target = addDays(2);
      break;
    case "this_month":
      target = addDays(10);
      break;
    case "vacation":
      target = addDays(14);
      break;
    default:
      target = { y: today.year, m: today.month, d: today.day };
  }
  return wallClockToEpoch(target.y, target.m, target.d, hour, minute);
}

/**
 * Generate realistic date/time options for the second matching phase.
 * Produces the next Fri/Sat/Sat/Sun spread of evenings + afternoons.
 */
export function generateDateOptions(
  nowSec = Math.floor(Date.now() / 1000),
): { startsAt: number; label: string }[] {
  const today = brusselsParts(nowSec);
  const base = new Date(
    Date.UTC(today.year, today.month - 1, today.day, 12, 0, 0),
  );
  const dow = base.getUTCDay();

  const nextDow = (want: number, minAhead = 1) => {
    let delta = (want - dow + 7) % 7;
    if (delta < minAhead) delta += 7;
    const d = new Date(base.getTime() + delta * 86400_000);
    return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
  };

  const fri = nextDow(5);
  const sat = nextDow(6);
  const sun = nextDow(0);

  const mk = (
    day: { y: number; m: number; d: number },
    hh: number,
    label: string,
  ) => ({ startsAt: wallClockToEpoch(day.y, day.m, day.d, hh, 0), label });

  return [
    mk(fri, 19, "Friday 19:00"),
    mk(sat, 14, "Saturday 14:00"),
    mk(sat, 19, "Saturday 19:00"),
    mk(sun, 15, "Sunday 15:00"),
  ].sort((a, b) => a.startsAt - b.startsAt);
}

export function formatWhen(epochSec: number | null): string {
  if (!epochSec) return "Date to be decided";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(epochSec * 1000));
}

/* --- Calendar links --- */

function icsStamp(epochSec: number): string {
  return (
    new Date(epochSec * 1000)
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}Z$/, "Z")
  );
}

export function googleCalendarUrl(opts: {
  title: string;
  details: string;
  location: string;
  startSec: number;
  durationMin: number;
}): string {
  const end = opts.startSec + opts.durationMin * 60;
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: opts.title,
    details: opts.details,
    location: opts.location,
    dates: `${icsStamp(opts.startSec)}/${icsStamp(end)}`,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function buildIcs(opts: {
  uid: string;
  title: string;
  description: string;
  location: string;
  startSec: number;
  durationMin: number;
  url?: string | null;
}): string {
  const end = opts.startSec + opts.durationMin * 60;
  const esc = (s: string) =>
    s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//VIBIN//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${opts.uid}@vibin.be`,
    `DTSTAMP:${icsStamp(Math.floor(Date.now() / 1000))}`,
    `DTSTART:${icsStamp(opts.startSec)}`,
    `DTEND:${icsStamp(end)}`,
    `SUMMARY:${esc(opts.title)}`,
    `DESCRIPTION:${esc(opts.description)}`,
    `LOCATION:${esc(opts.location)}`,
    opts.url ? `URL:${esc(opts.url)}` : "",
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");
}
