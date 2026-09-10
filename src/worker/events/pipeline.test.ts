import { describe, it, expect } from "vitest";
import { normalizeEvent, mapKind } from "./normalize";
import { dedupeHash } from "./dedupe";
import type { RawEvent } from "./types";

const base: RawEvent = {
  externalId: "x1",
  title: "Antwerp FC vs Club Brugge",
  startsAt: "2026-10-10T18:45:00Z",
  city: "Antwerpen",
  kind: "voetbal",
};

describe("normalizeEvent", () => {
  it("maps free-text kind, parses the date, geocodes the city", () => {
    const n = normalizeEvent(base)!;
    expect(n).not.toBeNull();
    expect(n.kind).toBe("sports");
    expect(n.categoryId).toBe("sport");
    expect(n.startsAt).toBe(Math.floor(Date.parse(base.startsAt as string) / 1000));
    // Antwerpen ~ 51.22, 4.40 (stored *1e6)
    expect(n.lat! / 1e6).toBeCloseTo(51.22, 1);
    expect(n.lng! / 1e6).toBeCloseTo(4.4, 1);
  });

  it("accepts unix seconds and unix millis", () => {
    expect(normalizeEvent({ ...base, startsAt: 1_800_000_000 })!.startsAt).toBe(1_800_000_000);
    expect(normalizeEvent({ ...base, startsAt: 1_800_000_000_000 })!.startsAt).toBe(1_800_000_000);
  });

  it("rejects an event with no title or no start", () => {
    expect(normalizeEvent({ ...base, title: "  " })).toBeNull();
    expect(normalizeEvent({ ...base, startsAt: "not a date" })).toBeNull();
  });

  it("never invents a price — unknown stays unknown", () => {
    expect(normalizeEvent(base)!.priceType).toBe("unknown");
    expect(normalizeEvent({ ...base, priceMinCents: 0 })!.priceType).toBe("free");
    expect(normalizeEvent({ ...base, priceMinCents: 1500 })!.priceType).toBe("paid");
  });

  it("mapKind falls back to 'other' for anything unrecognised", () => {
    expect(mapKind("kerstmarkt")).toBe("seasonal");
    expect(mapKind("concert")).toBe("music");
    expect(mapKind("blorp")).toBe("other");
    expect(mapKind(null)).toBe("other");
  });
});

describe("dedupeHash", () => {
  it("collapses cosmetic title differences for the same match + day + city", () => {
    const day = Math.floor(Date.parse("2026-10-10T18:45:00Z") / 1000);
    const a = dedupeHash("Antwerp vs Club Brugge", day, "Antwerpen");
    const b = dedupeHash("Antwerp - Club Brugge", day + 900, "antwerpen");
    const c = dedupeHash("Club Brugge vs Antwerp", day, "Antwerpen");
    expect(a).toBe(b);
    expect(a).toBe(c); // team order doesn't matter
  });

  it("separates different days or different cities", () => {
    const day = 1_800_000_000;
    expect(dedupeHash("X festival", day, "Gent")).not.toBe(
      dedupeHash("X festival", day + 86_400, "Gent"),
    );
    expect(dedupeHash("X festival", day, "Gent")).not.toBe(
      dedupeHash("X festival", day, "Brugge"),
    );
  });
});
