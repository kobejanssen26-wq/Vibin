import { describe, it, expect } from "vitest";
import { resolvePlace, knownPlaceCount, allPlaces } from "./be-places";

/** Local great-circle distance — keeps this test free of any worker imports. */
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

describe("resolvePlace", () => {
  it("covers every Belgian municipality plus sections (~2700 localities)", () => {
    expect(knownPlaceCount()).toBeGreaterThan(2500);
  });

  it("resolves a plain city name to a plausible Belgian coordinate", () => {
    const a = resolvePlace("Antwerpen")!;
    expect(a).not.toBeNull();
    expect(a.lat).toBeCloseTo(51.22, 1);
    expect(a.lng).toBeCloseTo(4.4, 1);
  });

  it("resolves small towns and village sections the old list missed", () => {
    for (const town of [
      "Hoogstraten",
      "Minderhout",
      "Meer",
      "Wortel",
      "Wuustwezel",
      "Rijkevorsel",
      "Merksplas",
      "Baarle-Hertog",
      "Wijnegem",
    ]) {
      const p = resolvePlace(town);
      expect(p, town).not.toBeNull();
      // all of these sit in the northern Antwerp Kempen
      expect(p!.lat, town).toBeGreaterThan(51.2);
      expect(p!.lat, town).toBeLessThan(51.55);
    }
  });

  it("is case- and accent-insensitive and ignores a country suffix", () => {
    expect(resolvePlace("  gent , BE ")).toEqual(resolvePlace("Gent"));
    expect(resolvePlace("Liège")).toEqual(resolvePlace("luik"));
  });

  it("accepts French / Dutch / English name variants", () => {
    expect(resolvePlace("Bruxelles")).toEqual(resolvePlace("Brussel"));
    expect(resolvePlace("Antwerp")).toEqual(resolvePlace("Antwerpen"));
    expect(resolvePlace("Bergen")).toEqual(resolvePlace("Mons"));
    expect(resolvePlace("Namen")).toEqual(resolvePlace("Namur"));
  });

  it("resolves an exact postcode and '<postcode> <town>'", () => {
    expect(resolvePlace("2320")).toEqual(resolvePlace("Hoogstraten"));
    expect(resolvePlace("2320 Meer")).not.toBeNull();
  });

  it("falls back to a province bucket for an unknown bare postcode", () => {
    const p = resolvePlace("9999");
    expect(p).not.toBeNull();
    expect(p!.lat).toBeCloseTo(51.05, 0);
  });

  it("returns null for an unknown place", () => {
    expect(resolvePlace("Narnia")).toBeNull();
    expect(resolvePlace("")).toBeNull();
    expect(resolvePlace(null)).toBeNull();
  });
});

describe("radius-bug regression — Hoogstraten + 10 km", () => {
  const hoogstraten = resolvePlace("Hoogstraten")!;
  const brussels = resolvePlace("Brussel")!;
  const antwerpCentre = resolvePlace("Antwerpen")!;
  const wortel = resolvePlace("Wortel")!;

  it("Brussels is far outside a 10 km circle around Hoogstraten", () => {
    const d = haversineKm(
      hoogstraten.lat,
      hoogstraten.lng,
      brussels.lat,
      brussels.lng,
    );
    expect(d).toBeGreaterThan(60);
  });

  it("Antwerp city centre is outside 10 km but inside 50 km", () => {
    const d = haversineKm(
      hoogstraten.lat,
      hoogstraten.lng,
      antwerpCentre.lat,
      antwerpCentre.lng,
    );
    expect(d).toBeGreaterThan(10);
    expect(d).toBeLessThan(50);
  });

  it("a neighbouring section (Wortel) is well inside 10 km", () => {
    const d = haversineKm(
      hoogstraten.lat,
      hoogstraten.lng,
      wortel.lat,
      wortel.lng,
    );
    expect(d).toBeLessThan(10);
  });
});

describe("allPlaces", () => {
  it("returns name + coordinate rows for the coverage report", () => {
    const all = allPlaces();
    expect(all.length).toBe(knownPlaceCount());
    expect(all.every((p) => p.name && Number.isFinite(p.lat) && Number.isFinite(p.lng))).toBe(true);
  });
});
