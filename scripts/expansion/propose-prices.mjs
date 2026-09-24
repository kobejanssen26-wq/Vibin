#!/usr/bin/env node
/**
 * PRICE RESEARCH helper. From the fact packets (priceText = short passages around
 * every euro amount on ONE page of the venue's own site), propose a price only
 * when a single regular ADULT / standard entry amount is stated and nothing on
 * that page contradicts it (a second, different adult amount = several products,
 * so no proposal). "From"/"vanaf"/"à partir de" prices are never proposed.
 * The proposals are then reviewed by a person before they become validator input.
 *
 *   node scripts/expansion/propose-prices.mjs [runDir]   ->  <runDir>/proposals.json
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const RUN = path.resolve(ROOT, process.argv[2] ?? "data/expansion/run-prices");
const dir = path.join(RUN, "data/enrichment/batches");

const LABEL = "(?:adult(?:e|en|s)?|volwassene[n]?|standaard(?:tarief|prijs)?|normaal(?: tarief| tarief)?|normal(?:e)?(?: prijs| tarif)?|plein tarif|tarif plein|prix normal|individuel(?:le)?|individueel|toegang|entr[ée]e(?: adulte)?|billet(?: adulte)?|full price|regular)";
const AMOUNT = "(?:€\\s?(\\d{1,3}(?:[.,]\\d{1,2})?)|(\\d{1,3}(?:[.,]\\d{1,2})?)\\s?(?:€|euro|eur)\\b)";
const RE = new RegExp(`${LABEL}\\W{0,3}[^€\\d\\n]{0,22}?${AMOUNT}`, "gi");
const FROM = /(?:from|vanaf|v\.a\.|à partir de|a partir de|dès|ab)\s*$/i;

const out = [];
for (const f of fs.readdirSync(dir).filter((x) => /^batch-1\d\d\.json$/.test(x)))
  for (const p of JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"))) {
    if (!p.priceText?.length) continue;
    const text = p.priceText.join(" ¦ ").replace(/\s+/g, " ");
    const found = new Map();
    for (const m of text.matchAll(RE)) {
      const raw = m[1] ?? m[2];
      const before = text.slice(Math.max(0, m.index - 25), m.index + m[0].length - raw.length);
      if (FROM.test(before.replace(/[€\s]+$/, ""))) continue;
      const amount = Number(raw.replace(",", "."));
      if (!(amount > 0 && amount <= 250)) continue;
      found.set(amount, m[0].slice(0, 90));
    }
    if (found.size !== 1) continue;
    const [amount, snippet] = [...found.entries()][0];
    out.push({ id: p.id, name: p.name, type: p.type, amount, snippet, url: p.priceUrl });
  }
fs.writeFileSync(path.join(RUN, "proposals.json"), JSON.stringify(out, null, 1));
console.log(`proposals: ${out.length}`);
