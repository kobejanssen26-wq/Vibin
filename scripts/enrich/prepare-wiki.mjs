#!/usr/bin/env node
/** Wikipedia fact packets -> batch-200… (only venues that have no other packet, so ids never collide). */
import fs from "node:fs";
import path from "node:path";
const ROOT = path.resolve(import.meta.dirname, "..", "..");
const dir = path.join(ROOT, "data/enrichment/batches");
const acts = new Map(JSON.parse(fs.readFileSync(path.join(ROOT, "data/enrichment/prod-activities.json"), "utf8"))[0].results.map((r) => [r.id, r]));
const other = new Set();
for (const f of fs.readdirSync(dir).filter((f) => /^batch-\d+\.json$/.test(f) && !/^batch-2\d\d\.json$/.test(f)))
  for (const p of JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"))) other.add(p.id);
const rows = fs.readFileSync(path.join(ROOT, "data/enrichment/wiki.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const items = [];
for (const w of rows) {
  const a = acts.get(w.id);
  if (!a || other.has(w.id)) continue;
  items.push({ id: w.id, name: a.title, type: a.subcategory || a.category_id, city: a.city, lang: "en", siteTitle: w.title, meta: null, og: null, ld: null, headings: [], text: w.extract, hoursText: [], wikiUrl: w.url });
}
for (const f of fs.readdirSync(dir)) if (/^batch-2\d\d\.json$/.test(f)) fs.rmSync(path.join(dir, f));
for (let i = 0; i * 50 < items.length; i++) fs.writeFileSync(path.join(dir, `batch-${200 + i}.json`), JSON.stringify(items.slice(i * 50, (i + 1) * 50)));
console.log(`wikipedia packets: ${items.length} of ${rows.length} (rest already covered by a website packet) -> ${Math.ceil(items.length / 50)} batches`);
