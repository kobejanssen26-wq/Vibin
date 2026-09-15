import { describe, expect, it } from "vitest";
import { isKnownClosed, isOpenAt, parseDisplayHours, parseOpeningHours, toDisplayHours } from "./opening-hours";

describe("parseOpeningHours", () => {
  it("parses a simple day-range + time-range spec", () => {
    const parsed = parseOpeningHours("Mo-Fr 09:00-18:00; Sa 10:00-16:00");
    expect(parsed).not.toBeNull();
    expect(toDisplayHours(parsed!)).toEqual({
      Mon: "09:00-18:00",
      Tue: "09:00-18:00",
      Wed: "09:00-18:00",
      Thu: "09:00-18:00",
      Fri: "09:00-18:00",
      Sat: "10:00-16:00",
    });
  });

  it("parses a midnight-crossing span and keeps the original wall-clock end time on display", () => {
    const parsed = parseOpeningHours("Mo-Sa 13:00-01:00; Su 13:00-00:00");
    expect(parsed).not.toBeNull();
    expect(toDisplayHours(parsed!).Mon).toBe("13:00-01:00");
    expect(toDisplayHours(parsed!).Sun).toBe("13:00-00:00");
  });

  it("applies an 'off' override after a broader day range", () => {
    const parsed = parseOpeningHours("Mo-Su 10:00-20:00; We off");
    expect(parsed).not.toBeNull();
    const display = toDisplayHours(parsed!);
    expect(display.Tue).toBe("10:00-20:00");
    expect(display.Wed).toBeUndefined();
    expect(display.Thu).toBe("10:00-20:00");
  });

  it("returns null for exotic syntax it doesn't confidently handle", () => {
    expect(parseOpeningHours("Mo-Fr 09:00-18:00; PH off")).toBeNull();
    expect(parseOpeningHours("Apr-Sep: Mo-Su 08:00-21:00")).toBeNull();
    expect(parseOpeningHours("Tu-Su 10:00+")).toBeNull();
  });

  it("recognises 24/7", () => {
    const parsed = parseOpeningHours("24/7");
    expect(parsed).not.toBeNull();
    expect(toDisplayHours(parsed!).Mon).toBe("00:00-00:00");
  });
});

describe("isOpenAt", () => {
  const bowling = parseOpeningHours("Mo-Sa 13:00-01:00; Su 13:00-00:00")!;

  it("is open on a Saturday evening", () => {
    const t = Math.floor(new Date("2026-09-19T20:00:00+02:00").getTime() / 1000); // Saturday
    expect(isOpenAt(bowling, t)).toBe(true);
  });

  it("is closed on a Saturday morning", () => {
    const t = Math.floor(new Date("2026-09-19T10:00:00+02:00").getTime() / 1000);
    expect(isOpenAt(bowling, t)).toBe(false);
  });

  it("is open just after midnight, carried over from the previous day's span crossing midnight", () => {
    const t = Math.floor(new Date("2026-09-20T00:30:00+02:00").getTime() / 1000); // Sunday 00:30, from Saturday's span
    expect(isOpenAt(bowling, t)).toBe(true);
  });

  it("returns null (unknown) rather than guessing when hours weren't parsed", () => {
    expect(isOpenAt(null, Math.floor(Date.now() / 1000))).toBeNull();
  });
});

describe("isKnownClosed", () => {
  it("is false when opening_hours is the default empty object", () => {
    expect(isKnownClosed("{}", Math.floor(Date.now() / 1000))).toBe(false);
  });

  it("is true only when the stored display hours confirm the venue is shut", () => {
    const json = JSON.stringify({ Mon: "09:00-18:00" });
    const monMorning = Math.floor(new Date("2026-09-14T10:00:00+02:00").getTime() / 1000); // Monday
    const monNight = Math.floor(new Date("2026-09-14T22:00:00+02:00").getTime() / 1000);
    expect(isKnownClosed(json, monMorning)).toBe(false);
    expect(isKnownClosed(json, monNight)).toBe(true);
  });

  it("never throws on malformed JSON, and treats it as unknown", () => {
    expect(isKnownClosed("not json", Math.floor(Date.now() / 1000))).toBe(false);
  });
});

describe("parseDisplayHours round-trip", () => {
  it("reconstructs spans from the stored display shape", () => {
    const original = parseOpeningHours("Tu-Sa 11:00-19:00")!;
    const display = toDisplayHours(original);
    const roundTripped = parseDisplayHours(display);
    expect(toDisplayHours(roundTripped)).toEqual(display);
  });
});
