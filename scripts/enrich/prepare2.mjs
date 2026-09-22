#!/usr/bin/env node
/**
 * Build round-2 fact packets from crawl2.jsonl (inner pages) merged with the
 * homepage facts already recorded in crawl.jsonl. Writes batch-100.json … next
 * to the round-1 batches (the validator reads every batch-<n>.json).
 *
 *   node scripts/enrich/prepare2.mjs [--batch 50]
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const args = process.argv.slice(2);
const BATCH = args.includes("--batch") ? Number(args[args.indexOf("--batch") + 1]) : 50;
const J = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));
const acts = new Map(J("data/enrichment/prod-activities.json")[0].results.map((r) => [r.id, r]));
const home = new Map(fs.readFileSync(path.join(ROOT, "data/enrichment/crawl.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)).map((r) => [r.id, r]));
const rows = fs.readFileSync(path.join(ROOT, "data/enrichment/crawl2.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));

const ORDER = { about: 0, activities: 1, menu: 2, prices: 3, info: 4 };
const items = [];
for (const r of rows) {
  const a = acts.get(r.id);
  const h = home.get(r.id);
  if (!a || !h || !r.pages?.length) continue;
  const pages = [...r.pages].sort((x, y) => ORDER[x.kind] - ORDER[y.kind]);
  const text = pages.map((p) => p.text.slice(0, 700)).join(" ¦ ").slice(0, 2200);
  if (text.length < 300) continue;
  const headings = [...new Set([...(h.headings || []), ...pages.flatMap((p) => p.headings)])].slice(0, 14);
  const meta = pages.find((p) => p.meta)?.meta ?? h.metaDescription ?? null;
  // prices: from the single page that has the most amounts (prefer a "prices" page)
  const withPrice = pages.filter((p) => p.price.length).sort((x, y) => (y.kind === "prices") - (x.kind === "prices") || y.price.length - x.price.length);
  const pp = withPrice[0];
  items.push({
    id: r.id, name: a.title, type: a.subcategory || a.category_id, city: a.city, lang: h.lang,
    siteTitle: h.title, meta, og: h.ogDescription && h.ogDescription !== meta ? h.ogDescription : null,
    ld: null, headings, text,
    hoursText: [...new Set(pages.flatMap((p) => p.hours))].slice(0, 2),
    priceText: pp ? pp.price : [], priceUrl: pp ? pp.url : null,
  });
}
const dir = path.join(ROOT, "data/enrichment/batches");
for (const f of fs.readdirSync(dir)) if (/^batch-1\d\d\.json$/.test(f)) fs.rmSync(path.join(dir, f));
for (let i = 0; i * BATCH < items.length; i++) fs.writeFileSync(path.join(dir, `batch-${100 + i}.json`), JSON.stringify(items.slice(i * BATCH, (i + 1) * BATCH)));
console.log(`round-2 packets: ${items.length} → ${Math.ceil(items.length / BATCH)} batches (batch-100…); with price evidence: ${items.filter((x) => x.priceText.length).length}`);
