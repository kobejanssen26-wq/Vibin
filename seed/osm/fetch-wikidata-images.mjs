/**
 * For every OSM element already fetched (seed/osm/raw/*.json) that carries a
 * `wikidata` tag, look up whether that Wikidata entity has a real photo
 * (claim P18 — "image"). Wikidata's P18 images are curated/reviewed photos of
 * that exact real-world place, so this is a genuine, verifiable, per-venue
 * photo source distinct from (and much larger than) OSM's own
 * wikimedia_commons/image tags.
 *
 * Writes seed/osm/raw/wikidata-images.json: { [qid]: "<Commons filename>" }.
 * Cached — re-run any time; already-resolved QIDs aren't re-queried unless
 * --force is passed. Wikidata's wbgetentities is a public, read-only, bulk
 * query endpoint — we query it, we don't scrape.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const RAW = join(here, "raw");
const OUT = join(RAW, "wikidata-images.json");
const FORCE = process.argv.includes("--force");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const qids = new Set();
for (const file of readdirSync(RAW).filter((f) => f.endsWith(".json") && f !== "wikidata-images.json")) {
  const els = JSON.parse(readFileSync(join(RAW, file), "utf8")).elements ?? [];
  for (const el of els) {
    const wd = el.tags?.wikidata;
    if (wd && /^Q\d+$/.test(wd)) qids.add(wd);
  }
}
console.log(`${qids.size} distinct wikidata QIDs found across the OSM cache.`);

const existing = FORCE || !existsSync(OUT) ? {} : JSON.parse(readFileSync(OUT, "utf8"));
const todo = [...qids].filter((q) => !(q in existing));
console.log(`${todo.length} not yet resolved (${qids.size - todo.length} cached).`);

const BATCH = 50;
let resolved = 0;
for (let i = 0; i < todo.length; i += BATCH) {
  const batch = todo.slice(i, i + BATCH);
  const url =
    `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${batch.join("|")}` +
    `&props=claims&format=json`;
  process.stdout.write(`  batch ${Math.floor(i / BATCH) + 1}/${Math.ceil(todo.length / BATCH)} (${batch.length} ids)... `);
  try {
    const res = await fetch(url, {
      headers: { "user-agent": "VIBIN/1.0 (contact@vibin.be) activity catalogue builder" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    let gotThisBatch = 0;
    for (const qid of batch) {
      const claims = json.entities?.[qid]?.claims;
      const p18 = claims?.P18?.[0]?.mainsnak?.datavalue?.value;
      existing[qid] = typeof p18 === "string" ? p18 : null;
      if (p18) { resolved++; gotThisBatch++; }
    }
    console.log(`${gotThisBatch} with a photo`);
  } catch (e) {
    console.log(`FAILED — ${e.message}`);
    for (const qid of batch) if (!(qid in existing)) existing[qid] = null;
  }
  writeFileSync(OUT, JSON.stringify(existing));
  await sleep(300);
}
console.log(`\ndone — ${resolved} new photos resolved this run, ${Object.values(existing).filter(Boolean).length} total.`);
