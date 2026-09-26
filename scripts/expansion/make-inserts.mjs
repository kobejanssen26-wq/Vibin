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
const RUN = path.join(ROOT, process.env.EXP_RUN ?? "data/expansion/run");
const ENR = path.join(RUN, "data/enrichment");
const J = (p, d) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8").replace(/^﻿/, "")) : d);
const args = process.argv.slice(2);
const LIMIT = args.includes("--limit") ? Number(args[args.indexOf("--limit") + 1]) : Infinity;

const cands = J(path.join(RUN, "candidates.json"), {});
const validated = J(path.join(ENR, "validated.json"), { accepted: [] }).accepted;
const verdicts = J(path.join(ENR, "verdicts.json"), {});
const images = J(path.join(ENR, "images.json"), {});
// Photos are only used after a person has looked at them (logos, posters and stock art are dropped)
const imgKeep = J(path.join(ROOT, "data/expansion/img-keep.json"), {});
const priceDefaults = J(path.join(ROOT, "data/expansion/price-defaults.json"), { sub: {}, cat: {} });
const genericImages = J(path.join(ROOT, "data/expansion/generic-images.json"), { sub: {}, cat: {} });
const crawl = new Map(
  fs.existsSync(path.join(ENR, "crawl.jsonl"))
    ? fs.readFileSync(path.join(ENR, "crawl.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)).map((r) => [r.id, r])
    : [],
);
const accepted = new Map(validated.filter((a) => a.description).map((a) => [a.id, a]));

const GEO_CACHE = path.join(ROOT, "data/expansion/geocode-cache.json"); // shared across runs
const geoCache = J(GEO_CACHE, {});
const UA = "VIBINBot/1.0 (+https://vibin.be; catalogue geocoding, contact via vibin.be/contact)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const strip = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
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
  if (!c.address) {
    // No street address on the site: accept a named place in OSM only when it sits in the candidate's own town
    // (same locality name), never a lookalike elsewhere. Otherwise the row stays unplaced.
    const hit = await nominatim(`${c.name}, ${c.city}`);
    const ad = hit?.address ?? {};
    const town = strip(c.city);
    const locs = [ad.city, ad.town, ad.village, ad.municipality, ad.suburb, ad.city_district, ad.hamlet].filter(Boolean).map(strip);
    const ok = hit && ad.country_code === "be" && town.length >= 3 && locs.some((l) => l.includes(town) || town.includes(l));
    return ok ? { lat: Number(hit.lat), lng: Number(hit.lon), how: "Nominatim (venue name + town)" } : null;
  }
  // The printed address first. If OSM does not know that exact form, retry spelling variants of the SAME
  // printed address (no "B-" prefix, abbreviations expanded, "SN"/"pavilion" noise dropped, without postcode).
  // A hit is only accepted in Belgium and, when both are known, with the candidate's postcode.
  const a = c.address;
  const clean = a
    .replace(/\bB-(?=\d{4})/g, "")
    .replace(/,?\s*\bS\/?N\b/gi, "")
    .replace(/\bCh\.\s/g, "Chaussée ")
    .replace(/\bChem\.\s/g, "Chemin ")
    .replace(/\bAv\.\s/g, "Avenue ")
    .replace(/^(Pavillon|Bâtiment|Bureau)[^,]*,\s*/i, "")
    .replace(/,\s*(\d+\s?[a-zA-Z]?)\s*,/, " $1,")
    .replace(/\s+,/g, ",")
    .replace(/\s{2,}/g, " ")
    .trim();
  const noPostcode = (s) => s.replace(/\b\d{4}\b/, "").replace(/\s+,/g, ",").replace(/,\s*,/g, ",").replace(/\s{2,}/g, " ").trim();
  const okHit = (hit, needPostcode = false) => {
    if (!hit || hit.address?.country_code !== "be") return false;
    const pc = hit.address?.postcode;
    if (needPostcode && !pc) return false;
    if (!(c.postcode && pc && String(pc).trim() !== String(c.postcode).trim())) return true;
    // A municipality can carry several postcodes (Heuvelland 8950-8958), so a hit in the same 3-digit area is accepted
    // only when OSM found the exact house number on the very street the venue prints.
    const road = String(hit.address?.road || "").toLowerCase();
    return String(pc).slice(0, 3) === String(c.postcode).slice(0, 3) && !!hit.address?.house_number && road.length >= 4 && String(c.address || "").toLowerCase().includes(road);
  };
  // second cleaning pass: separators, country suffix, "95/F"-style unit suffixes, quay/building names
  const clean2 = clean
    .replace(/\s[-–]\s/g, ", ")
    .replace(/,?\s*\b(bus|bte|box|boîte)\s*\d+\w*/gi, "")
    .replace(/[,\s]*(\(BE\)|Belgium|Belgique|België)\s*$/i, "")
    .replace(/(\d+)\s?\/\s?[A-Za-z0-9]+/g, "$1")
    .replace(/,\s*quai\s*\d+/i, "")
    .replace(/^[^,\d]+,\s*(?=[^,]+,[^,]*\d{4})/, "")
    .replace(/\s+,/g, ",")
    .replace(/\s{2,}/g, " ")
    .trim();
  const variants = [...new Set([a, noPostcode(a), clean, noPostcode(clean), clean2, noPostcode(clean2)])];
  for (const v of variants) {
    const hit = await nominatim(v);
    if (okHit(hit)) return { lat: Number(hit.lat), lng: Number(hit.lon), how: "Nominatim (printed address)" };
  }
  // Last resorts, both still tied to what the venue prints: a named place in OSM with the same postcode,
  // or the printed street (number dropped) when OSM knows that street as a short stretch (< 3 km) in the same postcode.
  const byName = await nominatim(`${c.name}, ${c.city}`);
  if (okHit(byName, true)) return { lat: Number(byName.lat), lng: Number(byName.lon), how: "Nominatim (venue name)" };
  const street = clean
    .split(/\s[–—-]\s/)
    .pop()
    .replace(/\([^)]*\)/g, "")
    .replace(/(\D{4,}?)[\s,]+\d{1,4}\s?[a-zA-Z]?(?=\s*,|\s+\d{4}\b)/, "$1")
    .replace(/\s+,/g, ",")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (street && street !== clean) {
    const hit = await nominatim(street);
    const bb = hit?.boundingbox?.map(Number);
    const km = bb ? Math.hypot((bb[1] - bb[0]) * 111, (bb[3] - bb[2]) * 71) : Infinity;
    if (okHit(hit, true) && km < 3) return { lat: Number(hit.lat), lng: Number(hit.lon), how: "Nominatim (street only)" };
  }
  return null;
}

const q = (v) => (v == null ? "NULL" : typeof v === "number" ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const bandFor = (cents) => {
  const e = cents / 100;
  return e <= 0 ? "free" : e <= 10 ? "0_10" : e <= 25 ? "10_25" : e <= 50 ? "25_50" : e <= 100 ? "50_100" : "100_plus";
};
// Without a researched price a row still needs a band (NOT NULL). Borrow the band of the closest
// comparable subcategory already in the catalogue, matched by keyword, never by the crude
// category default (that put a chocolate workshop in "EUR 0-10"). The row is flagged for price review.
const BAND_RULES = [
  [/escape|evasion|mystery room|hold up/, "escape room"],
  [/virtual reality|\bvr\b|free-roam/, "escape room"],
  [/paintball|airsoft|gellyball|nerf|\bbattle\b/, "paintball"],
  [/laser/, "laser game"],
  [/kart/, "karting"],
  [/trampoline|jump/, "trampoline park"],
  [/bowling/, "bowling"],
  [/padel|tennis/, "padel"],
  [/workshop|class|cooking|pottery|ceramic|atelier|kook|studio/, "pottery workshop"],
  [/museum|mus[e\u00e9]e|abbey|abbaye|castle|ch[a\u00e2]teau|kasteel|heritage|memorial|battlefield|garden|arboretum|park des/, "museum"],
  [/\bspa\b|sauna|wellness|thermen|thermal/, "spa & sauna"],
  [/brewery|brouwerij|brasserie|distill|winery|wijn|vineyard|cheese|fromagerie/, "brewery"],
  [/karaoke/, "karaoke"],
  [/climb|ropes|adventure park|klimpark|klimbos|accro|via ferrata|zipline|tree-top/, "climbing"],
  [/kayak|kajak|canoe|paddle|\bsup\b|boat|cruise|rondvaart|\braft|packraft|pedalo|cable car|rail bike|draisine|scooter|e-step|bike|vtt|science|playground|speelstad|farm|zoo/, "zoo"],
];
function priceGuess(c) {
  const hay = `${c.subcategory ?? ""} ${c.name}`.toLowerCase();
  for (const [re, sub] of BAND_RULES) {
    const d = priceDefaults.sub[sub];
    if (re.test(hay) && d && d.n >= 5) return { type: d.pt === "per_person" ? "varies" : d.pt, band: d.pb };
  }
  return { type: "from_per_person", band: "10_25" };
}
function imageFor(c) {
  const own = imgKeep[c.id] === "keep" ? images[c.id] : null;
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

const dir = path.join(RUN, "inserts");
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
const CHUNK = 100;
for (let i = 0; i * CHUNK < stmts.length; i++)
  fs.writeFileSync(path.join(dir, `${String(i).padStart(3, "0")}.sql`), stmts.slice(i * CHUNK, (i + 1) * CHUNK).join("\n") + "\n");
fs.writeFileSync(path.join(RUN, "insert-report.json"), JSON.stringify(report, null, 1));
const why = {};
for (const s of report.skipped) why[s.why] = (why[s.why] || 0) + 1;
console.log(`candidates ${report.candidates} | insert ${report.inserted.length} | skipped ${report.skipped.length}`, why);
