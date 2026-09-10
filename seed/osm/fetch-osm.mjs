/**
 * Pulls real Belgian places from OpenStreetMap (Overpass API) for every entry in
 * categories.mjs and caches the raw responses in seed/osm/raw/<key>.json.
 *
 *   node seed/osm/fetch-osm.mjs            # fetch only what's missing
 *   node seed/osm/fetch-osm.mjs --force    # re-fetch everything
 *
 * Data © OpenStreetMap contributors, ODbL. We query, we don't scrape; Overpass
 * is the sanctioned bulk-query interface. One request per category with a pause
 * between, so we stay well inside its fair-use limits.
 */
import { mkdirSync, existsSync, writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { OSM_CATEGORIES } from "./categories.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const RAW = join(here, "raw");
mkdirSync(RAW, { recursive: true });

const FORCE = process.argv.includes("--force");
const ENDPOINTS = [
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function overpass(body, attempt = 0) {
  const url = ENDPOINTS[attempt % ENDPOINTS.length];
  // constrain every statement to the Belgium area: `…];` -> `…](area.be);`
  const scoped = body.replace(/;/g, "(area.be);");
  const query = `[out:json][timeout:180];area["ISO3166-1"="BE"][admin_level=2]->.be;(${scoped});out center tags;`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "user-agent": "VIBIN/1.0 (contact@vibin.be) activity catalogue builder",
    },
    body: "data=" + encodeURIComponent(query),
  });
  if (res.status === 429 || res.status === 504) {
    if (attempt >= 5) throw new Error(`Overpass ${res.status} after ${attempt} retries`);
    const wait = 15_000 * (attempt + 1);
    console.log(`   ${res.status} — backing off ${wait / 1000}s`);
    await sleep(wait);
    return overpass(body, attempt + 1);
  }
  if (!res.ok) throw new Error(`Overpass HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

let fetched = 0;
for (const cat of OSM_CATEGORIES) {
  const out = join(RAW, `${cat.key}.json`);
  if (!FORCE && existsSync(out)) {
    const n = JSON.parse(readFileSync(out, "utf8")).elements?.length ?? 0;
    console.log(`= ${cat.key.padEnd(16)} cached (${n})`);
    continue;
  }
  process.stdout.write(`↓ ${cat.key.padEnd(16)} `);
  try {
    const json = await overpass(cat.q);
    writeFileSync(out, JSON.stringify(json));
    console.log(`${json.elements?.length ?? 0} elements`);
    fetched++;
    await sleep(8000); // be polite between queries
  } catch (e) {
    console.log(`FAILED — ${e.message}`);
  }
}
console.log(`\ndone — ${fetched} categories fetched this run`);
