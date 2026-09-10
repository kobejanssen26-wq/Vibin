/**
 * iCalendar (.ics) adapter. Works with any operator- or council-published
 * calendar feed — config is just `{ "url": "https://…/events.ics", "city": "…" }`.
 * No API key. We only fetch a URL the operator configured, so there's no
 * scraping / ToS question.
 */
import type { EventSourceRow } from "../../db/schema";
import type { Env } from "../../env";
import { SourceNotConfigured, type EventSourceAdapter, type RawEvent } from "../types";

interface IcsConfig {
  url?: string;
  city?: string;
  /** optional default event kind for this feed */
  kind?: string;
}

/** Unfold RFC-5545 long lines (continuation lines start with a space/tab). */
function unfold(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\n[ \t]/g, "")
    .split("\n");
}

function unescape(v: string): string {
  return v
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

/** DTSTART / DTEND -> ISO string. Handles `YYYYMMDD` and `YYYYMMDDTHHMMSSZ`. */
function icsDate(raw: string): { iso: string; allDay: boolean } | null {
  const v = raw.trim();
  const dOnly = v.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (dOnly) return { iso: `${dOnly[1]}-${dOnly[2]}-${dOnly[3]}T00:00:00`, allDay: true };
  const dt = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (dt) {
    return {
      iso: `${dt[1]}-${dt[2]}-${dt[3]}T${dt[4]}:${dt[5]}:${dt[6]}${dt[7] ? "Z" : ""}`,
      allDay: false,
    };
  }
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : { iso: new Date(t).toISOString(), allDay: false };
}

export const icsAdapter: EventSourceAdapter = {
  kind: "ics",
  async fetchRaw(env: Env, source: EventSourceRow): Promise<RawEvent[]> {
    const cfg = safeConfig(source.config);
    if (!cfg.url) throw new SourceNotConfigured(`${source.name}: no "url" in config`);

    const res = await fetch(cfg.url, {
      headers: { "user-agent": "VIBIN/1.0 (+https://vibin.be)" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`ICS ${cfg.url} -> HTTP ${res.status}`);
    const lines = unfold(await res.text());

    const out: RawEvent[] = [];
    let cur: Record<string, string> | null = null;
    for (const line of lines) {
      if (line === "BEGIN:VEVENT") cur = {};
      else if (line === "END:VEVENT") {
        if (cur) pushEvent(out, cur, cfg);
        cur = null;
      } else if (cur) {
        const i = line.indexOf(":");
        if (i < 0) continue;
        const key = line.slice(0, i).split(";")[0]!.toUpperCase();
        cur[key] = line.slice(i + 1);
      }
    }
    return out;
  },
};

function pushEvent(out: RawEvent[], v: Record<string, string>, cfg: IcsConfig) {
  const start = v.DTSTART ? icsDate(v.DTSTART) : null;
  if (!v.SUMMARY || !start) return;
  const end = v.DTEND ? icsDate(v.DTEND) : null;
  out.push({
    externalId: (v.UID || `${v.SUMMARY}-${v.DTSTART}`).slice(0, 200),
    title: unescape(v.SUMMARY),
    description: v.DESCRIPTION ? unescape(v.DESCRIPTION) : null,
    kind: cfg.kind ?? null,
    venueName: v.LOCATION ? unescape(v.LOCATION) : null,
    address: v.LOCATION ? unescape(v.LOCATION) : null,
    city: cfg.city ?? null,
    startsAt: start.iso,
    endsAt: end?.iso ?? null,
    allDay: start.allDay,
    url: v.URL || null,
    status:
      v.STATUS === "CANCELLED"
        ? "cancelled"
        : v.STATUS === "TENTATIVE"
          ? "postponed"
          : null,
  });
}

function safeConfig(raw: string): IcsConfig {
  try {
    return JSON.parse(raw) as IcsConfig;
  } catch {
    return {};
  }
}
