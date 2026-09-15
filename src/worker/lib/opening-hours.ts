/**
 * A pragmatic parser for the OSM `opening_hours` micro-syntax
 * (https://wiki.openstreetmap.org/wiki/Key:opening_hours).
 *
 * The full spec is large (month ranges, public/school holidays, "+" open-
 * ended times, relative-to-Easter rules, week numbers...). Rather than guess
 * at the exotic cases, this parser handles the common, unambiguous core —
 * day ranges, comma-separated day/time lists, multiple time spans per day,
 * "off" — and returns `null` for anything it isn't confident about. A null
 * result means "unknown", not "closed": callers must not treat it as closed.
 *
 * This is the difference between real data and invented data: every hour
 * this parser returns came from an actual OSM opening_hours tag. What it
 * can't parse, it leaves unknown rather than guessing.
 */

export type DayKey = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";
export const DAY_KEYS: DayKey[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** One or more "HH:MM-HH:MM" spans per day, comma-joined for display (matches
 *  the existing ActivityDTO.openingHours: Record<string,string> shape). */
export type ParsedHours = Partial<Record<DayKey, string>>;

interface TimeSpan {
  startMin: number; // minutes since local midnight
  endMin: number; // may exceed 1440 for a span crossing midnight (e.g. 23:00-01:00 -> 1380-1500)
}

const DAY_ALIASES: Record<string, DayKey> = {
  mo: "Mon",
  tu: "Tue",
  we: "Wed",
  th: "Thu",
  fr: "Fri",
  sa: "Sat",
  su: "Sun",
};
const DAY_ORDER: DayKey[] = DAY_KEYS;

/** Tokens this parser refuses to guess at — bail out to "unknown" instead. */
const UNSUPPORTED = /\b(PH|SH|easter|week|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i;

function parseDayRange(token: string): DayKey[] | null {
  const parts = token.split(",").map((s) => s.trim());
  const days: DayKey[] = [];
  for (const part of parts) {
    const range = part.match(/^([A-Za-z]{2})-([A-Za-z]{2})$/);
    if (range) {
      const from = DAY_ALIASES[range[1]!.toLowerCase()];
      const to = DAY_ALIASES[range[2]!.toLowerCase()];
      if (!from || !to) return null;
      const fi = DAY_ORDER.indexOf(from);
      const ti = DAY_ORDER.indexOf(to);
      if (fi === -1 || ti === -1) return null;
      if (fi <= ti) {
        for (let i = fi; i <= ti; i++) days.push(DAY_ORDER[i]!);
      } else {
        // wraps the week, e.g. Sa-Mo
        for (let i = fi; i < 7; i++) days.push(DAY_ORDER[i]!);
        for (let i = 0; i <= ti; i++) days.push(DAY_ORDER[i]!);
      }
      continue;
    }
    const single = DAY_ALIASES[part.toLowerCase()];
    if (!single) return null;
    days.push(single);
  }
  return days.length ? days : null;
}

function parseTimeSpans(token: string): TimeSpan[] | null {
  const parts = token.split(",").map((s) => s.trim());
  const spans: TimeSpan[] = [];
  for (const part of parts) {
    // normalise the en-dash some sources use
    const norm = part.replace(/–/g, "-");
    const m = norm.match(/^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const startMin = Number(m[1]) * 60 + Number(m[2]);
    let endMin = Number(m[3]) * 60 + Number(m[4]);
    if (endMin <= startMin) endMin += 1440; // crosses midnight
    if (startMin < 0 || startMin >= 1440) return null;
    spans.push({ startMin, endMin });
  }
  return spans.length ? spans : null;
}

/**
 * Parse an OSM opening_hours string into per-day time spans. Returns null if
 * any rule in the string uses syntax this parser doesn't confidently handle
 * (rather than silently dropping just that rule and reporting a partial —
 * possibly wrong — schedule).
 */
export function parseOpeningHours(raw: string): Partial<Record<DayKey, TimeSpan[]>> | null {
  const spec = raw.trim();
  if (!spec || spec.toLowerCase() === "24/7") {
    return spec.toLowerCase() === "24/7"
      ? Object.fromEntries(DAY_ORDER.map((d) => [d, [{ startMin: 0, endMin: 1440 }]]))
      : null;
  }
  if (UNSUPPORTED.test(spec)) return null;

  const result: Partial<Record<DayKey, TimeSpan[]>> = {};
  const rules = spec.split(";").map((s) => s.trim()).filter(Boolean);
  for (const rule of rules) {
    if (rule.includes("+")) return null; // open-ended time, can't resolve to a span
    const isOff = /\boff\b/i.test(rule);
    const withoutOff = rule.replace(/\boff\b/i, "").trim();

    // "Mo-Fr 09:00-18:00,19:00-22:00" or bare "09:00-18:00" (applies every day)
    const m = withoutOff.match(/^([A-Za-z,\-\s]+?)\s+([\d:,\-–\s]+)$/);
    let dayToken: string | null;
    let timeToken: string | null;
    if (m) {
      dayToken = m[1]!.trim();
      timeToken = m[2]!.trim();
    } else if (/^[\d:,\-–\s]+$/.test(withoutOff) && withoutOff) {
      dayToken = null; // every day
      timeToken = withoutOff;
    } else if (isOff && /^[A-Za-z,\-\s]+$/.test(withoutOff)) {
      dayToken = withoutOff;
      timeToken = null;
    } else {
      return null;
    }

    const days = dayToken ? parseDayRange(dayToken) : DAY_ORDER.slice();
    if (!days) return null;

    if (isOff) {
      for (const d of days) delete result[d];
      continue;
    }
    if (!timeToken) return null;
    const spans = parseTimeSpans(timeToken);
    if (!spans) return null;
    for (const d of days) {
      result[d] = [...(result[d] ?? []), ...spans];
    }
  }
  return result;
}

/** Render parsed hours into the display shape already used by the client
 *  (ActivityDTO.openingHours: Record<DayKey, "HH:MM-HH:MM, HH:MM-HH:MM">). A
 *  span's end is shown as its original wall-clock time even when it crosses
 *  midnight (e.g. 13:00-01:00 stays "13:00-01:00", not "13:00-25:00"). */
export function toDisplayHours(
  parsed: Partial<Record<DayKey, TimeSpan[]>>,
): ParsedHours {
  const out: ParsedHours = {};
  for (const day of DAY_ORDER) {
    const spans = parsed[day];
    if (!spans || spans.length === 0) continue;
    out[day] = spans.map((s) => `${fmt(s.startMin)}-${fmt(s.endMin)}`).join(", ");
  }
  return out;
}

function fmt(totalMin: number): string {
  const wrapped = totalMin % 1440;
  const h = Math.floor(wrapped / 60);
  const min = wrapped % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/**
 * The reverse of toDisplayHours — turns what's actually stored in
 * activities.opening_hours (the simple "HH:MM-HH:MM, HH:MM-HH:MM" display
 * shape) back into spans for isOpenAt(), without re-parsing OSM syntax at
 * request time. Malformed entries are skipped rather than guessed.
 */
export function parseDisplayHours(
  display: Partial<Record<string, string>>,
): Partial<Record<DayKey, TimeSpan[]>> {
  const out: Partial<Record<DayKey, TimeSpan[]>> = {};
  for (const day of DAY_ORDER) {
    const value = display[day];
    if (!value) continue;
    const spans = parseTimeSpans(value);
    if (spans) out[day] = spans;
  }
  return out;
}

/**
 * True only when activities.opening_hours (the raw stored JSON text) is
 * known AND confirms the venue is closed at this timestamp. False for both
 * "confirmed open" and "unknown" — callers that need to distinguish those
 * should use isOpenAt directly. Convenience for the common "is it safe to
 * commit to this time" check without each caller re-doing the JSON.parse +
 * parseDisplayHours dance.
 */
export function isKnownClosed(openingHoursJson: string | null | undefined, unixSeconds: number): boolean {
  if (!openingHoursJson) return false;
  let display: Partial<Record<string, string>> = {};
  try {
    display = JSON.parse(openingHoursJson);
  } catch {
    return false;
  }
  if (Object.keys(display).length === 0) return false;
  return isOpenAt(parseDisplayHours(display), unixSeconds) === false;
}

/**
 * Is the activity open at this unix timestamp, per its parsed hours?
 * Returns null (unknown) rather than guessing when hours weren't parseable —
 * callers must treat null as "can't verify", never as "closed".
 */
export function isOpenAt(
  parsed: Partial<Record<DayKey, TimeSpan[]>> | null,
  unixSeconds: number,
  tz = "Europe/Brussels",
): boolean | null {
  if (!parsed) return null;
  const local = toLocalParts(unixSeconds, tz);
  const minutesOfDay = local.hour * 60 + local.minute;
  const today = DAY_ORDER[local.weekday];
  const yesterday = DAY_ORDER[(local.weekday + 6) % 7];

  // spans on "today" that haven't started past midnight from yesterday
  const todaySpans = parsed[today!] ?? [];
  for (const s of todaySpans) {
    if (minutesOfDay >= s.startMin && minutesOfDay < s.endMin) return true;
  }
  // a span from yesterday that crosses midnight into today
  const yesterdaySpans = parsed[yesterday!] ?? [];
  for (const s of yesterdaySpans) {
    if (s.endMin > 1440 && minutesOfDay < s.endMin - 1440) return true;
  }
  return todaySpans.length || yesterdaySpans.length ? false : null;
}

/** The DayKey a timestamp falls on in the given timezone (defaults to
 *  Europe/Brussels) — for labelling, not for the open/closed decision
 *  itself (isOpenAt already handles the timezone internally). */
export function localDayKey(unixSeconds: number, tz = "Europe/Brussels"): DayKey {
  return DAY_ORDER[toLocalParts(unixSeconds, tz).weekday]!;
}

/** Europe/Brussels-aware local time parts for a unix timestamp, using Intl
 *  (handles CET/CEST automatically) rather than a fixed UTC offset. */
function toLocalParts(
  unixSeconds: number,
  tz: string,
): { weekday: number; hour: number; minute: number } {
  const d = new Date(unixSeconds * 1000);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const weekdayMap: Record<string, number> = {
    Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6,
  };
  return {
    weekday: weekdayMap[get("weekday")] ?? 0,
    hour: Number(get("hour")) % 24,
    minute: Number(get("minute")),
  };
}
