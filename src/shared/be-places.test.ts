import { describe, it, expect } from "vitest";
import { resolvePlace } from "./be-places";

describe("resolvePlace", () => {
  it("resolves a plain city name", () => {
    expect(resolvePlace("Antwerpen")).toEqual({ lat: 51.2194, lng: 4.4025 });
  });

  it("is case- and accent-insensitive and ignores a country suffix", () => {
    expect(resolvePlace("  gent , BE ")).toEqual(resolvePlace("Gent"));
    expect(resolvePlace("Liège")).toEqual(resolvePlace("liege"));
  });

  it("accepts French / Dutch name variants", () => {
    expect(resolvePlace("Bruxelles")).toEqual(resolvePlace("Brussel"));
    expect(resolvePlace("Bruges")).toEqual(resolvePlace("Brugge"));
  });

  it("resolves '<postcode> <town>' to the town, not just the bucket", () => {
    expect(resolvePlace("2000 Antwerpen")).toEqual(resolvePlace("Antwerpen"));
  });

  it("resolves a bare postcode to its province bucket", () => {
    const p = resolvePlace("9000");
    expect(p).not.toBeNull();
    expect(p!.lat).toBeCloseTo(51.05, 1);
  });

  it("returns null for an unknown place", () => {
    expect(resolvePlace("Narnia")).toBeNull();
    expect(resolvePlace("")).toBeNull();
    expect(resolvePlace(null)).toBeNull();
  });
});
