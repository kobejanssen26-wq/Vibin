#!/usr/bin/env node
/**
 * EXPANSION helper. Candidates whose address the discovery agent could not read
 * off the site are re-tried against the pages the crawler already recorded:
 * an address is accepted only if a street + number + 4-digit postcode + city
 * appears verbatim in that venue's own crawled text and the city matches the
 * candidate's city. Nothing is guessed; no match means the row stays unplaced.
 *
 *   node scripts/expansion/rescue-addresses.mjs [runDir]
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const RUN = path.resolve(ROOT, process.argv[2] ?? "data/expansion/run");
const ENR = path.join(RUN, "data/enrichment");
const cands = JSON.parse(fs.readFileSync(path.join(RUN, "candidates.json"), "utf8"));
const report = JSON.parse(fs.readFileSync(path.join(RUN, "insert-report.json"), "utf8"));
const targets = new Set(report.skipped.filter((s) => /could not place/.test(s.why)).map((s) => s.id));

const read = (f) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
const texts = new Map();
const add = (id, t) => texts.set(id, (texts.get(id) ?? "") + " ¦ " + t);
for (const r of read(path.join(ENR, "crawl.jsonl"))) add(r.id, [r.text, ...(r.hoursText ?? [])].filter(Boolean).join(" "));
for (const r of read(path.join(ENR, "crawl2.jsonl"))) for (const p of r.pages ?? []) add(r.id, p.text ?? "");

const strip = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const STREET = "(?:[A-ZÀ-Ý][\\p{L}'’.\\-]*\\s){0,3}?(?:[\\p{L}'’.\\-]*(?:straat|laan|weg|plein|dreef|steenweg|baan|kaai|dijk|markt|hof|lei|pad|singel|vest|park)|(?:Rue|Avenue|Chaussée|Chemin|Place|Boulevard|Route|Allée|Impasse|Quai|Sentier|Grand-Rue|Rue)\\s[\\p{L}'’.\\- ]{2,40}?)";
const RE = new RegExp(
  `(${STREET})[\\s,.:\\-–]*?(\\d{1,4}\\s?[a-zA-Z]?)[\\s,.\\-–]+(?:B[\\s-])?(\\d{4})\\s+([A-ZÀ-Ý][\\p{L}'’\\-]+(?:[\\s-][A-ZÀ-Ý]?[\\p{L}'’\\-]+){0,3})`,
  "gu",
);

const out = {};
for (const id of targets) {
  const c = cands[id];
  const text = (texts.get(id) ?? "").replace(/\s+/g, " ");
  let best = null;
  for (const m of text.matchAll(RE)) {
    const [, street, no, pc, city] = m;
    const cityN = strip(city);
    const candN = strip(c.city);
    if (!(cityN.includes(candN) || candN.includes(cityN.split(/[\s-]/)[0]))) continue;
    best = { address: `${street.trim()} ${no.trim()}, ${pc} ${city.trim()}`, postcode: pc };
    break;
  }
  if (best) out[id] = best;
}
fs.writeFileSync(path.join(RUN, "rescued-addresses.json"), JSON.stringify(out, null, 1));
console.log(`targets ${targets.size}, addresses found in the venue's own crawled text: ${Object.keys(out).length}`);
for (const [id, a] of Object.entries(out)) console.log(`  ${id.replace("act_", "")}: ${a.address}`);
