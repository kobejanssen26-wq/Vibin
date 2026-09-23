import { afterEach, describe, expect, it } from "vitest";
import { DICTIONARIES, setActiveLang, translate } from "./i18n";
import { localizeServerText } from "./server-text";
import { formatDuration, localizeNote, localizePrice, relativeTime } from "./format";

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort();

afterEach(() => setActiveLang("en"));

describe("dictionaries", () => {
  it.each(["nl", "fr"] as const)("%s keeps exactly the placeholders of its English key", (lang) => {
    const en = DICTIONARIES.en as Record<string, string>;
    const dict = DICTIONARIES[lang] as Record<string, string>;
    const bad = Object.keys(dict).filter(
      (k) => !(k in en) || placeholders(dict[k]!).join() !== placeholders(en[k]!).join(),
    );
    expect(bad).toEqual([]);
  });

  it("Dutch covers every English key", () => {
    const BRAND_ONLY = ["footer.vibin"]; // the wordmark is identical in every language
    const missing = Object.keys(DICTIONARIES.en).filter(
      (k) => !(k in DICTIONARIES.nl) && !BRAND_ONLY.includes(k),
    );
    expect(missing).toEqual([]);
  });

  it("falls back to English for a key a language lacks", () => {
    setActiveLang("fr");
    expect(translate("swipe.pass")).toBe("Pass");
  });
});

// Exact strings the worker writes — see engine-run.ts, groups.ts, invites.ts,
// votes.ts, messages.ts, dates.ts, admin-support.ts.
const SERVER_SAMPLES = [
  'Group "Team BBQ" created. Invite your crew!',
  "Swiping has started — 40 activities in the deck. Everyone needs to like the same one for it to match. 🔥",
  "Someone left the group.",
  "Sam joined the group. 👋",
  "🔥 Everyone matched on Museum of Illusions!",
  "🎉 It's a plan! Museum of Illusions is locked in.",
  "📅 Museum of Illusions is closed at your usual time — pick a real time below.",
  "📅 Now let's find a date for Museum of Illusions — vote on the options.",
  "📅 Everyone agreed on Sat, 18 Oct 14:30! It's a plan. 🎉",
  "A new date option was added: Sat, 18 Oct 14:30",
  "The swipe session was restarted — everyone can vote again.",
  "It's a plan — Museum of Illusions!",
  "Everyone's going. Open the plan for details.",
  "Date voting started for Museum of Illusions",
  "Say which times work for you.",
  "Date locked: Sat, 18 Oct 14:30",
  "Museum of Illusions is fully planned.",
  "VIBIN support replied",
  "Swiping started in Team BBQ",
  "Open VIBIN and start swiping.",
  "Sam joined Team BBQ",
  "Sam in the group chat",
];

describe("localizeServerText", () => {
  it("is the identity in English", () => {
    for (const s of SERVER_SAMPLES) expect(localizeServerText(s)).toBe(s);
  });

  it("translates every known worker template in Dutch, keeping the dynamic parts", () => {
    setActiveLang("nl");
    for (const s of SERVER_SAMPLES) {
      const out = localizeServerText(s);
      expect(out, s).not.toBe(s);
      expect(out, s).not.toMatch(/[{}]/);
    }
    expect(localizeServerText("🔥 Everyone matched on Museum of Illusions!")).toContain("Museum of Illusions");
    expect(localizeServerText("Swiping has started — 40 activities in the deck. Everyone needs to like the same one for it to match. 🔥")).toContain("40");
  });

  it("leaves unknown text untouched", () => {
    setActiveLang("nl");
    expect(localizeServerText("hey, anyone free saturday?")).toBe("hey, anyone free saturday?");
  });
});

describe("format helpers", () => {
  it("localizes the worker's price templates", () => {
    setActiveLang("nl");
    expect(localizePrice("Free")).toBe("Gratis");
    expect(localizePrice("€13 / person")).toBe("€13 / persoon");
    expect(localizePrice("From €0–10 / person")).toBe("Vanaf €0–10 / persoon");
    expect(localizePrice("Approx. €10–25 / person")).toBe("Ca. €10–25 / persoon");
    expect(localizePrice("€12 p.p.")).toBe("€12 p.p.");
    expect(localizePrice("Price information unavailable")).toBe("Prijs niet beschikbaar");
  });

  it("is the identity in English", () => {
    for (const p of ["Free", "€13 / person", "From €0–10 / person", "Approx. €10–25 / person", "€12 p.p.", "Group price"])
      expect(localizePrice(p)).toBe(p);
  });

  it("translates only the known availability disclaimer", () => {
    setActiveLang("nl");
    expect(localizeNote("Activity information is provided for planning. Prices and availability can change — check with the provider before you book.")).toMatch(/plannen/);
    expect(localizeNote("Some other note")).toBe("Some other note");
  });

  it("formats durations and relative time per language", () => {
    expect(formatDuration(90)).toBe("1 h 30 min");
    setActiveLang("nl");
    expect(formatDuration(90)).toBe("1 u 30 min");
    expect(relativeTime(Date.now() / 1000 - 5)).toBe("zonet");
  });
});
