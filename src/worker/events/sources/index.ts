/**
 * Adapter registry. `manual` has no fetch (rows are admin-entered). `ics` and
 * `rss` work today with just an operator-supplied feed URL. The API kinds are
 * scaffolded but intentionally inert until an operator supplies credentials —
 * they throw `SourceNotConfigured`, which the pipeline records as a clean
 * "skipped, not configured" rather than an error.
 *
 * OWNER ACTION to enable a live API feed:
 *   1. obtain an API key / licence for the provider (sports data, ticketing,
 *      council open-data calendar) — respect their ToS + rate limits
 *   2. store the key as a Worker secret, put its name + endpoint in the source's
 *      `config` JSON, and set `enabled = 1`
 *   3. implement `fetchRaw` for that adapter below (endpoint-specific mapping)
 */
import type { EventSourceRow } from "../../db/schema";
import type { Env } from "../../env";
import {
  SourceNotConfigured,
  type EventSourceAdapter,
  type RawEvent,
} from "../types";
import { icsAdapter } from "./ics";

const manualAdapter: EventSourceAdapter = {
  kind: "manual",
  async fetchRaw(): Promise<RawEvent[]> {
    // Manual events are created/edited directly in the Command Center.
    return [];
  },
};

const rssAdapter: EventSourceAdapter = {
  kind: "rss",
  async fetchRaw(_env: Env, source: EventSourceRow): Promise<RawEvent[]> {
    const cfg = safeJson(source.config);
    const url = typeof cfg.url === "string" ? cfg.url : null;
    if (!url) throw new SourceNotConfigured(`${source.name}: no "url" in config`);
    const res = await fetch(url, {
      headers: { "user-agent": "VIBIN/1.0 (+https://vibin.be)" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`RSS ${url} -> HTTP ${res.status}`);
    const xml = await res.text();
    const items = [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map((m) => m[0]);
    const pick = (block: string, tag: string) =>
      block
        .match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "i"))?.[1]
        ?.replace(/<!\[CDATA\[|\]\]>/g, "")
        .trim() ?? null;
    const out: RawEvent[] = [];
    for (const it of items) {
      const title = pick(it, "title");
      const date = pick(it, "pubDate") ?? pick(it, "dc:date");
      if (!title || !date) continue;
      out.push({
        externalId: (pick(it, "guid") ?? pick(it, "link") ?? title).slice(0, 200),
        title,
        description: pick(it, "description"),
        city: typeof cfg.city === "string" ? cfg.city : null,
        kind: typeof cfg.kind === "string" ? cfg.kind : null,
        startsAt: date,
        url: pick(it, "link"),
      });
    }
    return out;
  },
};

/** Scaffold for a licensed sports-fixtures API. See OWNER ACTION above. */
const sportsApiAdapter: EventSourceAdapter = {
  kind: "sports_api",
  async fetchRaw(_env: Env, source: EventSourceRow): Promise<RawEvent[]> {
    throw new SourceNotConfigured(
      `${source.name}: sports_api needs a provider key + endpoint mapping`,
    );
  },
};

/** Scaffold for a ticketing / event-platform feed. See OWNER ACTION above. */
const ticketFeedAdapter: EventSourceAdapter = {
  kind: "ticket_feed",
  async fetchRaw(_env: Env, source: EventSourceRow): Promise<RawEvent[]> {
    throw new SourceNotConfigured(
      `${source.name}: ticket_feed needs an API key + licensed endpoint`,
    );
  },
};

/** Scaffold for a council open-data event calendar (JSON API rather than ICS). */
const cityCalendarAdapter: EventSourceAdapter = {
  kind: "city_calendar",
  async fetchRaw(_env: Env, source: EventSourceRow): Promise<RawEvent[]> {
    throw new SourceNotConfigured(
      `${source.name}: city_calendar needs the council's open-data endpoint in config`,
    );
  },
};

const ADAPTERS: Record<EventSourceRow["kind"], EventSourceAdapter> = {
  manual: manualAdapter,
  ics: icsAdapter,
  rss: rssAdapter,
  sports_api: sportsApiAdapter,
  ticket_feed: ticketFeedAdapter,
  city_calendar: cityCalendarAdapter,
};

export function adapterFor(kind: EventSourceRow["kind"]): EventSourceAdapter {
  return ADAPTERS[kind] ?? manualAdapter;
}

function safeJson(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}
