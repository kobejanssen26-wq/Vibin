#!/usr/bin/env node
/**
 * EXPANSION helper. Turns source-validated exact prices (validated.json, from
 * the same verbatim-in-source checks as descriptions) into guarded UPDATEs for
 * rows already inserted. Only rows that still have no researched price are
 * touched, and the "price needs review" flag is cleared for them.
 *
 *   node scripts/expansion/make-price-updates.mjs [runDir]   ->  data/expansion/fix/prices.sql
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const RUN = path.resolve(ROOT, process.argv[2] ?? "data/expansion/run");
const validated = JSON.parse(fs.readFileSync(path.join(RUN, "data/enrichment/validated.json"), "utf8")).accepted;
const now = Math.floor(Date.now() / 1000);
const q = (v) => `'${String(v).replace(/'/g, "''")}'`;
const band = (cents) => {
  const e = cents / 100;
  return e <= 10 ? "0_10" : e <= 25 ? "10_25" : e <= 50 ? "25_50" : e <= 100 ? "50_100" : "100_plus";
};
const seen = new Set();
const out = [];
for (const a of validated) {
  if (!a.price || seen.has(a.id)) continue;
  seen.add(a.id);
  const min = Math.round(a.price.min * 100);
  const max = Math.round(a.price.max * 100);
  out.push(
    `UPDATE activities SET price_type=${q(min === max ? "per_person" : "from_per_person")}, price_band=${q(band(min))}, price_min_cents=${min}, price_max_cents=${max}, price_unit_note=${q(a.price.unit)}, price_confidence='exact', price_source_url=${q(a.price.url ?? "")}, price_checked_at=${now}, needs_review_fields='[]' WHERE id=${q(a.id)} AND source='web' AND price_min_cents IS NULL;`,
  );
}
fs.mkdirSync(path.join(ROOT, "data/expansion/fix"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "data/expansion/fix/prices.sql"), out.join("\n") + "\n");
console.log(`price updates: ${out.length}`);
