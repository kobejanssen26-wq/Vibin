#!/usr/bin/env node
/**
 * Build the fact packets the writer stage works from — one compact JSON
 * object per venue whose own site was reachable and said something concrete.
 * Writes data/enrichment/batches/batch-NNN.json (BATCH items each).
 *
 *   node scripts/enrich/prepare.mjs [--crawl path] [--batch 80]
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const args = process.argv.slice(2);
const argVal = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const crawlPath = argVal("--crawl", path.join(ROOT, "data/enrichment/crawl.jsonl"));
const BATCH = Number(argVal("--batch", 80));

const acts = new Map(JSON.parse(fs.readFileSync(path.join(ROOT, "data/enrichment/prod-activities.json"), "utf8"))[0].results.map((r) => [r.id, r]));
const crawl = fs.readFileSync(crawlPath, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));

const items = [];
for (const r of crawl) {
  if (!r.ok || r.parked || r.closedSignal) continue;
  const a = acts.get(r.id);
  if (!a || a.enriched) continue; // the hand-researched ones stay as they are
  // rows that already carry real prose (curated activities) are left alone
  const boiler = /From OpenStreetMap|not yet verified/i.test(a.description || "") || !(a.description || "").trim();
  if (!boiler) continue;
  const ld = r.jsonld?.find((e) => e.description || e.servesCuisine?.length || e.priceRange) ?? r.jsonld?.[0];
  // a real self-description on the site, or hours text worth extracting — pages
  // that only expose navigation text yield nothing checkable
  const hasSubstance = r.metaDescription || r.ogDescription || ld?.description || r.hoursText?.length;
  if (!hasSubstance) continue;
  items.push({
    id: r.id,
    name: a.title,
    type: a.subcategory || a.category_id,
    city: a.city,
    lang: r.lang,
    siteTitle: r.title,
    meta: r.metaDescription,
    og: r.ogDescription && r.ogDescription !== r.metaDescription ? r.ogDescription : null,
    ld: ld ? { description: ld.description, servesCuisine: ld.servesCuisine, priceRange: ld.priceRange } : null,
    headings: r.headings,
    text: (r.metaDescription || r.ogDescription || ld?.description ? (r.text || "").slice(0, 600) : (r.text || "").slice(0, 1200)),
    hoursText: r.hoursText || [],
  });
}

const dir = path.join(ROOT, "data/enrichment/batches");
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
for (let i = 0; i * BATCH < items.length; i++) {
  fs.writeFileSync(path.join(dir, `batch-${String(i).padStart(3, "0")}.json`), JSON.stringify(items.slice(i * BATCH, (i + 1) * BATCH)));
}
console.log(`fact packets: ${items.length} → ${Math.ceil(items.length / BATCH)} batches of ${BATCH}`);
