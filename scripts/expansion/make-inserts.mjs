#!/usr/bin/env node
/**
 * EXPANSION final stage. For every candidate that (a) has a live official
 * website, (b) got a source-validated description from the enrichment
 * pipeline, and (c) can be placed on the map, emit one guarded INSERT.
 *
 * Nothing here invents data: descriptions/prices/hours come from validated.json,
 * the photo is the site's own (images.json) or the same shared stock fallback
 * every other unphotographed row uses (flagged generic), coordinates come from
 * the site's own schema.org geo or a Nominatim lookup of the printed address.
 * A row that cannot satisfy all three conditions is simply not inserted.
 *
 *   node scripts/expansion/make-inserts.mjs [--limit N]
 * Output: data/expansion/inserts/NNN.sql  +  data/expansion/insert-report.json
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const RUN = path.join(ROOT, "data/expansion/run");
const ENR = path.join(RUN, "data/enrichment");
const J = (p, d) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8").replace(/^﻿/, "")) : d);
const args = process.argv.slice(2);
const LIMIT = args.includes("--limit") ? Number(args[args.indexOf("--limit") + 1]) : Infinity;

const cands = J(path.join(RUN, "candidates.json"), {});
const validated = J(path.join(ENR, "validated.json"), { accepted: [] }).accepted;
const verdicts = J(path.join(ENR, "verdicts.json"), {});
const images = J(path.join(ENR, "images.json"), {});
const priceDefaults = J(path.join(ROOT, "data/expansion/price-defaults.json"), { sub: {}, cat: {} });
const genericImages = J(path.join(ROOT, "data/expansion/generic-images.json"), { sub: {}, cat: {} });
const crawl = new Map(
  fs.existsSync(path.join(ENR, "crawl.jsonl"))
    ? fs.readFileSync(path.join(ENR, "crawl.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)).map((r) => [r.id, r])
    : [],
);
const accepted = new Map(validated.filter((a) => a.description).map((a) => [a.id, a]));

const GEO_CACHE = path.join(ROOT, "data/expansion/geocode-cache.json");
const geoCache = J(GEO_CACHE, {});
const UA = "VIBINBot/1.0 (+https://vibin.be; catalogue geocoding, contact via vibin.be/contact)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let lastGeo = 0;

async function nominatim(q) {
  if (q in geoCache) return geoCache[q];
  const wait = 1200 - (Date.now() - lastGeo);
  if (wait > 0) await sleep(wait);
  lastGeo = Date.now();
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=1&countrycodes=be&q=${encodeURIComponent(q)}`;
  let res = null;
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "en" }, signal: AbortSignal.timeout(20000) });
    if (r.ok) res = (await r.json())[0] ?? null;
  } catch {
    res = null;
  }
  geoCache[q] = res;
  fs.writeFileSync(GEO_CACHE, JSON.stringify(geoCache));
  return res;
}

/** site-published coordinates first, then the printed address via Nominatim */
async function place(c) {
  const ld = crawl.get(c.id)?.jsonld?.find((e) => e.geo || (e.latitude && e.longitude));
  const glat = Number(ld?.geo?.latitude ?? ld?.latitude);
  const glng = Number(ld?.geo?.longitude ?? ld?.longitude);
  if (Number.isFinite(glat) && Number.isFinite(glng) && glat > 49.4 && glat < 51.6 && glng > 2.5 && glng < 6.5)
    return { lat: glat, lng: glng, how: "site schema.org geo" };
  if (!c.address) return null;
  const hit = await nominatim(c.address);
  if (!hit || hit.address?.country_code !== "be") return null;
  const pc = hit.address?.postcode;
  if (c.postcode && pc && String(pc).trim() !== String(c.postcode).trim()) return null; // wrong place
  return { lat: Number(hit.lat), lng: Number(hit.lon), how: "Nominatim (printed address)" };
}

const q = (v) => (v == null ? "NULL" : typeof v === "number" ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const bandFor = (cents) => {
  const e = cents / 100;
  return e <= 0 ? "free" : e <= 10 ? "0_10" : e <= 25 ? "10_25" : e <= 50 ? "25_50" : e <= 100 ? "50_100" : "100_plus";
};
function priceGuess(c) {
  const sub = String(c.subcategory ?? "").toLowerCase();
  const s = priceDefaults.sub[sub];
  if (s && s.n >= 5 && s.pb !== "free") return { type: s.pt, band: s.pb };
  const cat = priceDefaults.cat[c.categoryId];
  if (cat && cat.pb !== "free") return { type: cat.pt === "per_person" ? "varies" : cat.pt, band: cat.pb };
  return { type: "varies", band: "10_25" };
}
function imageFor(c) {
  const own = images[c.id];
  if (own) {
    let host = "website";
    try {
      host = new URL(own.url).host.replace(/^www\./, "");
    } catch {
      /* keep */
    }
    return { url: own.url, source: `Official website (${host})`, attribution: null, generic: 0, quality: 3 };
  }
  const g = genericImages.sub[String(c.subcategory ?? "").toLowerCase()] ?? genericImages.cat[c.categoryId];
  return g ? { url: g.url, source: g.source, attribution: g.attribution, generic: 1, quality: g.quality ?? null } : null;
}

const now = Math.floor(Date.now() / 1000);
const stmts = [];
const report = { candidates: Object.keys(cands).length, inserted: [], skipped: [] };

for (const c of Object.values(cands)) {
  if (stmts.length >= LIMIT) break;
  const skip = (why) => report.skipped.push({ id: c.id, name: c.name, city: c.city, why });
  const v = verdicts[c.id]?.verdict;
  if (v !== "alive") {
    skip(`site verdict ${v ?? "none"}`);
    continue;
  }
  const a = accepted.get(c.id);
  if (!a) {
    skip("no source-validated description");
    continue;
  }
  const loc = await place(c);
  if (!loc) {
    skip("could not place on the map (no site geo, address missing/unresolvable)");
    continue;
  }
  const img = imageFor(c);
  const pr = a.price;
  const guess = priceGuess(c);
  const priceCols = pr
    ? {
        type: pr.min === pr.max ? "per_person" : "from_per_person",
        band: bandFor(Math.round(pr.min * 100)),
        min: Math.round(pr.min * 100),
        max: Math.round(pr.max * 100),
        unit: pr.unit,
        conf: "exact",
        url: pr.url,
        at: now,
        review: "[]",
      }
    : { type: guess.type, band: guess.band, min: null, max: null, unit: null, conf: null, url: null, at: null, review: '["price"]' };
  const hours = a.hours && a.hoursDisplay ? JSON.stringify(a.hoursDisplay) : "{}";
  const tags = a.cuisine ? JSON.stringify([`cuisine:${a.cuisine}`]) : "[]";
  const site = c.websiteUrl;
  const at = crawl.get(c.id)?.at ?? now;

  stmts.push(
    `INSERT OR IGNORE INTO activities (id, provider_id, external_id, title, description, short_description, description_source, description_checked_at, category_id, subcategory, provider, provider_website, location_label, address, city, country, lat, lng, price_cents, price_type, price_band, price_min_cents, price_max_cents, price_unit_note, price_confidence, price_source_url, price_checked_at, opening_hours, website_url, monetization_type, image_url, image_source, image_attribution, image_is_generic, image_quality_score, tags, source, source_url, status, needs_review_fields, web_status, web_checked_at, active, created_at, updated_at) VALUES (` +
      [
        q(c.id), q("prov_web"), q(c.id.replace(/^act_/, "")), q(c.name), q(""), q(a.description),
        q("website summary 2026-09 (auto, source-validated)"), now, q(c.categoryId), q(c.subcategory ?? null),
        q(c.name), q(site), q(`${c.name}, ${c.city}`), q(c.address ?? null), q(c.city), q("BE"),
        Math.round(loc.lat * 1e6), Math.round(loc.lng * 1e6), "NULL", q(priceCols.type), q(priceCols.band),
        q(priceCols.min), q(priceCols.max), q(priceCols.unit), q(priceCols.conf), q(priceCols.url), q(priceCols.at),
        q(hours), q(site), q("outbound_tracking"),
        q(img?.url ?? null), q(img?.source ?? null), q(img?.attribution ?? null), img?.generic ?? 1, q(img?.quality ?? null),
        q(tags), q("web"), q(c.evidenceUrl ?? site), q("needs_review"), q(priceCols.review), q("alive"), at, 1, now, now,
      ].join(", ") +
      `);`,
  );
  report.inserted.push({ id: c.id, name: c.name, city: c.city, geo: loc.how, photo: img?.generic === 0 ? "official" : "stock", price: pr ? "exact" : "band-estimate" });
}

const dir = path.join(ROOT, "data/expansion/inserts");
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
const CHUNK = 100;
for (let i = 0; i * CHUNK < stmts.length; i++)
  fs.writeFileSync(path.join(dir, `${String(i).padStart(3, "0")}.sql`), stmts.slice(i * CHUNK, (i + 1) * CHUNK).join("\n") + "\n");
fs.writeFileSync(path.join(ROOT, "data/expansion/insert-report.json"), JSON.stringify(report, null, 1));
const why = {};
for (const s of report.skipped) why[s.why] = (why[s.why] || 0) + 1;
console.log(`candidates ${report.candidates} | insert ${report.inserted.length} | skipped ${report.skipped.length}`, why);
