/**
 * VALIDATION stage. Reads the writer's output (data/enrichment/out/*.json)
 * next to the fact packets it was written from (data/enrichment/batches/*.json)
 * and accepts a description / cuisine / opening hours ONLY if it can be traced
 * back to the recorded source text. Everything else is dropped — a venue with
 * no accepted description simply keeps showing none.
 *
 *   npx tsx scripts/enrich/validate.ts
 */
import fs from "node:fs";
import path from "node:path";
import { parseOpeningHours, toDisplayHours } from "../../src/worker/lib/opening-hours";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const read = (dir: string) =>
  fs
    .readdirSync(path.join(ROOT, dir))
    .filter((f) => /^batch-\d+\.json$/.test(f))
    .flatMap((f) => JSON.parse(fs.readFileSync(path.join(ROOT, dir, f), "utf8").replace(/^﻿/, "")) as any[]);

const packets = new Map<string, any>(read("data/enrichment/batches").map((p) => [p.id, p]));
const outputs: any[] = read("data/enrichment/out");

const BANNED = [
  /perfect for/i, /great (place|spot|choice)/i, /\bideal for\b/i, /fun for/i, /\benjoy/i, /\bexperience\b/i,
  /amazing/i, /fantastic/i, /wonderful/i, /unforgettable/i, /memorable/i, /hidden gem/i, /look no further/i,
  /whether you/i, /welcome to/i, /spend time with (friends|family)/i, /relaxed (setting|atmosphere)/i,
  /something for everyone/i, /\bcoz(y|ier)\b/i, /\bgezellig/i, /\bboasts\b/i, /nestled/i, /\bvibrant\b/i,
  /\bdelight/i, /\bworld-class\b/i, /\bstate-of-the-art\b/i, /\btop-notch\b/i,
];
const ALLOWED_CAPS = new Set(
  "Belgium Belgian Flemish Dutch French English German Italian Spanish Japanese Chinese Thai Indian Greek Mexican Turkish Lebanese Asian European Mediterranean American Brussels Antwerp Ghent Bruges Leuven Liège Namur Mechelen Hasselt Monday Tuesday Wednesday Thursday Friday Saturday Sunday January February March April May June July August September October November December Christmas Easter Halloween Belgian-style America Americas Europe Europe's Flanders Wallonia Zeeland Roman Romans World War The Museum Primitives Great Middle Ages Renaissance Baroque Gothic Art Nouveau Deco Second First Cold Ardennes Meuse Scheldt Rhine North Sea Kempen Campine Limburg".split(" "),
);
const SEASONAL = /seizoen|saison|season|zomer|winter|été|hiver|vakantie|vacances|holiday|feestdag|jours f[ée]ri[ée]s|op afspraak|sur rendez-vous|by appointment|afhankelijk|selon|depending|variable|maand/i;

const words = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s'-]/gu, " ").split(/\s+/).filter(Boolean);
const sourceText = (p: any) =>
  [p.siteTitle, p.meta, p.og, p.ld?.description, (p.ld?.servesCuisine || []).join(" "), (p.headings || []).join(" "), p.text, (p.hoursText || []).join(" ")]
    .filter(Boolean)
    .join(" ");

function hasRun(desc: string[], src: string[], n: number): boolean {
  const grams = new Set<string>();
  for (let i = 0; i + n <= src.length; i++) grams.add(src.slice(i, i + n).join(" "));
  for (let i = 0; i + n <= desc.length; i++) if (grams.has(desc.slice(i, i + n).join(" "))) return true;
  return false;
}

function timesIn(text: string): Set<number> {
  const s = new Set<number>();
  for (const m of text.matchAll(/\b(\d{1,2})\s?(?:[:h.u]\s?(\d{2})?)\b/gi)) {
    const h = Number(m[1]);
    const mi = m[2] ? Number(m[2]) : 0;
    if (h <= 24 && mi < 60) s.add(h * 60 + mi);
  }
  return s;
}

const accepted: any[] = [];
const rejected: { id: string; reasons: string[] }[] = [];
const reasonCount: Record<string, number> = {};
const bump = (r: string) => (reasonCount[r] = (reasonCount[r] || 0) + 1);

const staged: { id: string; description: string; cuisine: string | null; hours: string | null; hoursDisplay: Record<string, string> | null }[] = [];

for (const o of outputs) {
  const p = packets.get(o.id);
  if (!p) continue;
  const src = sourceText(p);
  const srcWords = words(src);
  const srcLower = src.toLowerCase();
  const reasons: string[] = [];
  let description: string | null = typeof o.description === "string" ? o.description.trim() : null;

  if (description) {
    const w = words(description);
    if (w.length < 20 || w.length > 55) reasons.push(`length-${w.length < 20 ? "short" : "long"}`);
    if (BANNED.some((re) => re.test(description!))) reasons.push("banned-phrase");
    const sentences = description.split(/(?<=[.!?])s+/).filter(Boolean);
    if (sentences.length > 2 || sentences.some((s) => words(s).length < 6)) reasons.push("sentence-shape");
    if (/(currently|current|now|new|newly|latest|upcoming|this (year|season|summer|winter)|until|20[12]d)/i.test(description)) reasons.push("time-sensitive");
    if (/[!]|\byou(r)?\b/i.test(description)) reasons.push("tone");
    if (/\p{Extended_Pictographic}/u.test(description)) reasons.push("emoji");
    const nums = description.match(/\d[\d.,:]*/g) || [];
    if (nums.some((n) => !srcLower.includes(n.replace(/[.,:]$/, "").toLowerCase()))) reasons.push("number-not-in-source");
    if (/^\s*[\p{L} &'-]{2,30}\s+in\s+[\p{L} '-]{2,30}\.?\s*$/u.test(description)) reasons.push("type-plus-city");
    if (hasRun(w, srcWords, 7)) reasons.push("copies-source");
    const unknownCaps = (description.match(/(?<=[a-z,;:] )[A-Z][\p{L}'-]{2,}/gu) || []).filter(
      (c) => !ALLOWED_CAPS.has(c) && !srcLower.includes(c.toLowerCase()) && !(p.name || "").toLowerCase().includes(c.toLowerCase()),
    );
    if (unknownCaps.length >= 1) reasons.push(`unknown-proper-noun:${unknownCaps[0]}`);
    // Identity check: a venue of a distinctive type whose crawled page never mentions that
    // kind of thing (a mini-golf whose "own site" only talks about a bistro) is most likely a
    // page about a different entity — don't describe the venue from it.
    const t = String(p.type || "").toLowerCase();
    const TYPE_WORDS: [RegExp, RegExp][] = [
      [/golf/, /golf/], [/bowling/, /bowl/], [/museum/, /mus[eé]e?|museum/], [/brewery/, /brouwerij|brasserie|brewery|bier|bière|beer|brew|abbaye|abdij|geuze|gueuze|lambic|cidre|distill/],
      [/\bzoo\b/, /zoo|dier|animal|animaux|boerderij|ferme|farm/], [/cinema/, /cin[eé]|film|bioscoop/], [/escape/, /escape/], [/kart/, /kart/],
      [/climb|boulder/, /klim|boulder|climb|escalad|grimp|bloc|varappe/], [/trampoline/, /trampo|jump/], [/laser/, /laser/],
      [/swimming/, /zwem|piscine|swim|pool|bad\b/], [/theat/, /theat|théât|theater|toneel|spectacle|voorstelling/],
      [/library/, /biblio|library|bibliotheek/], [/gallery/, /galer|gallery|kunst|\bart\b|art\b/], [/castle/, /kasteel|château|chateau|castle|burcht|burg|fort|slot|schloss/],
      [/chocolate/, /chocol|praline|cacao/],
    ];
    if (TYPE_WORDS.some(([tre, sre]) => tre.test(t) && !sre.test(srcLower))) reasons.push("type-not-in-source");
  } else description = null;

  let cuisine: string | null = null;
  if (typeof o.cuisine === "string" && /^[a-z][a-z \-]{2,24}$/.test(o.cuisine.trim())) {
    const c = o.cuisine.trim();
    // cuisine word must be in the source (allow Dutch/French for common ones)
    const alias: Record<string, string[]> = {
      italian: ["ital"], french: ["frans", "français", "francais", "french"], belgian: ["belg"], japanese: ["japan"],
      chinese: ["chin"], vegan: ["vegan", "veggie"], vegetarian: ["vegetar"], pancakes: ["pannenkoek", "crêpe", "crepe", "pancake"],
      brasserie: ["brasserie"], sushi: ["sushi"], pizza: ["pizza"], steakhouse: ["steak"], seafood: ["zeevruchten", "fruits de mer", "seafood", "vis"],
    };
    const keys = [c, ...(alias[c] || [])];
    if (keys.some((k) => srcLower.includes(k))) cuisine = c;
  }

  let hours: string | null = null;
  let hoursDisplay: Record<string, string> | null = null;
  if (typeof o.hours === "string" && o.hours.trim() && p.hoursText?.length) {
    const ht = p.hoursText.join(" ");
    const parsed = parseOpeningHours(o.hours.trim());
    const disp = parsed ? toDisplayHours(parsed) : null;
    if (parsed && disp && Object.keys(disp).length >= 1 && !/24\/7/.test(o.hours) && !SEASONAL.test(ht)) {
      const known = timesIn(ht);
      const outTimes = [...o.hours.matchAll(/(\d{2}):(\d{2})/g)].map((m) => Number(m[1]) * 60 + Number(m[2]));
      const okTimes = outTimes.length > 0 && outTimes.every((t) => known.has(t) || t === 0 || t === 24 * 60);
      if (okTimes) {
        hours = o.hours.trim();
        hoursDisplay = disp as Record<string, string>;
      }
    }
  }

  if (reasons.length) {
    reasons.forEach((r) => bump(r.split(":")[0]!));
    rejected.push({ id: o.id, reasons });
    description = null;
  }
  if (description || cuisine || hours) staged.push({ id: o.id, description: description ?? "", cuisine, hours, hoursDisplay });
}

// ---- cross-venue template detection (the "swap test", mechanically) ---------
const withDesc = staged.filter((s) => s.description);
const prefixes = new Map<string, number>();
for (const s of withDesc) {
  const k = words(s.description).slice(0, 4).join(" ");
  prefixes.set(k, (prefixes.get(k) || 0) + 1);
}
const overused = new Set([...prefixes].filter(([, n]) => n > 6).map(([k]) => k));
const seenSets: Set<string>[] = [];
for (const s of staged) {
  if (!s.description) continue;
  const w = words(s.description);
  if (overused.has(w.slice(0, 4).join(" "))) {
    rejected.push({ id: s.id, reasons: ["template-prefix"] });
    bump("template-prefix");
    s.description = "";
    continue;
  }
  const set = new Set(w.filter((x) => x.length > 3));
  const dup = seenSets.some((o) => {
    let inter = 0;
    for (const x of set) if (o.has(x)) inter++;
    return inter / Math.max(1, Math.min(set.size, o.size)) > 0.7;
  });
  if (dup) {
    rejected.push({ id: s.id, reasons: ["near-duplicate"] });
    bump("near-duplicate");
    s.description = "";
    continue;
  }
  seenSets.push(set);
}

for (const s of staged) if (s.description || s.cuisine || s.hours) accepted.push(s);
fs.writeFileSync(path.join(ROOT, "data/enrichment/validated.json"), JSON.stringify({ accepted, rejected }, null, 1));

console.log(`writer outputs: ${outputs.length}, non-null descriptions offered: ${outputs.filter((o) => o.description).length}`);
console.log(`accepted descriptions: ${accepted.filter((a) => a.description).length}`);
console.log(`accepted cuisine: ${accepted.filter((a) => a.cuisine).length}, accepted hours: ${accepted.filter((a) => a.hours).length}`);
console.log("rejection reasons:", reasonCount);
console.log("most common openings:", [...prefixes].sort((a, b) => b[1] - a[1]).slice(0, 6));
