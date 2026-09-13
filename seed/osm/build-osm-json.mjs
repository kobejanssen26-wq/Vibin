/**
 * Normalises the cached Overpass responses (seed/osm/raw/*.json) into
 * seed/osm/osm-activities.json — the import-ready list that build-seed.ts merges
 * with the hand-curated catalogue.
 *
 *   node seed/osm/build-osm-json.mjs
 *
 * Rules: real data only. No invented prices (indicative BANDS only, same as the
 * curated set's `priceType:"varies"`), no invented descriptions beyond a factual
 * one-liner, everything ships `status:"needs_review"`. Attribution: OSM / ODbL.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { OSM_CATEGORIES } from "./categories.mjs";
import { resolvePlace, allPlaces } from "../../src/worker/lib/be-places.ts";

const here = dirname(fileURLToPath(import.meta.url));
const RAW = join(here, "raw");
const byKey = Object.fromEntries(OSM_CATEGORIES.map((c) => [c.key, c]));

// Wikidata P18 photos (fetch-wikidata-images.mjs) — a real, curated photo of
// this exact entity, keyed by QID. Optional: falls back to {} if not fetched.
const WIKIDATA_IMAGES_PATH = join(RAW, "wikidata-images.json");
const wikidataImages = existsSync(WIKIDATA_IMAGES_PATH)
  ? JSON.parse(readFileSync(WIKIDATA_IMAGES_PATH, "utf8"))
  : {};

const PLACES = allPlaces();
function nearestCity(lat, lng) {
  let best = null;
  let bestD = Infinity;
  for (const p of PLACES) {
    const d = (p.lat - lat) ** 2 + (p.lng - lng) ** 2;
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best ? best.name.replace(/\b\w/g, (m) => m.toUpperCase()) : null;
}

const norm = (s) =>
  (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const cap = (s) => (s ? s.replace(/\b\w/g, (m) => m.toUpperCase()) : s);

const OUT = [];
const seen = new Set();
let raw = 0;
const perCat = {};

for (const file of readdirSync(RAW).filter((f) => f.endsWith(".json"))) {
  const key = file.replace(/\.json$/, "");
  const cat = byKey[key];
  if (!cat) continue;
  const els = JSON.parse(readFileSync(join(RAW, file), "utf8")).elements ?? [];
  const bucket = [];

  for (const el of els) {
    raw++;
    const t = el.tags || {};
    const name = (t.name || t["name:nl"] || t["name:fr"] || "").trim();
    if (!name || name.length < 2) continue;
    if (/^(test|demo|example|voorbeeld)\b/i.test(name)) continue;
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (typeof lat !== "number" || typeof lng !== "number") continue;

    const osmType = el.type;
    const osmId = `${osmType[0]}${el.id}`;
    const osmUrl = `https://www.openstreetmap.org/${osmType}/${el.id}`;

    const dk = `${norm(name)}@${lat.toFixed(3)},${lng.toFixed(3)}`;
    if (seen.has(dk)) continue;

    const city = cap(t["addr:city"]) || nearestCity(lat, lng) || "";
    if (!city) continue;

    const addr =
      [
        [t["addr:street"], t["addr:housenumber"]].filter(Boolean).join(" "),
        [t["addr:postcode"], t["addr:city"]].filter(Boolean).join(" "),
      ]
        .filter(Boolean)
        .join(", ") || undefined;

    const website =
      t.website || t["contact:website"] || t.url || t["contact:url"] || null;

    let imageUrl = null;
    let imageAttribution = null;
    const wiki = t.wikimedia_commons;
    if (wiki && /^File:/i.test(wiki)) {
      const f = wiki.replace(/^File:/i, "").replace(/ /g, "_");
      imageUrl = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(
        f,
      )}?width=1280`;
      imageAttribution = "Wikimedia Commons — via OpenStreetMap";
    } else if (t.image && /^https?:\/\//i.test(t.image)) {
      // OSM's plain `image` tag: a direct URL a mapper attached to this exact
      // element. Real per-venue data, just less common than wikimedia_commons.
      imageUrl = t.image;
      imageAttribution = "Photo via OpenStreetMap contributor";
    } else if (t.wikidata && wikidataImages[t.wikidata]) {
      // Wikidata P18 — a curated, reviewed photo of this exact entity. Larger
      // and generally higher-quality source than OSM's own image tags.
      const f = wikidataImages[t.wikidata].replace(/ /g, "_");
      imageUrl = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(
        f,
      )}?width=1280`;
      imageAttribution = "Wikimedia Commons — via Wikidata";
    }

    const hours =
      t.opening_hours && t.opening_hours.length < 70 ? t.opening_hours : null;
    const description = (
      `${cat.subcategory} in ${city}. From OpenStreetMap — not yet verified by VIBIN.` +
      (hours ? ` Listed hours: ${hours}.` : "")
    ).slice(0, 400);

    const tags = [
      "osm",
      cat.indoorOutdoor || "both",
      "needs-review",
      cat.free ? "free" : null,
      t.cuisine ? `cuisine:${String(t.cuisine).split(";")[0]}` : null,
    ].filter(Boolean);

    seen.add(dk);
    bucket.push({
      slug: `osm-${key}-${osmId}`,
      title: name.slice(0, 120),
      description,
      category: cat.category,
      subcategory: cat.subcategory,
      provider: name.slice(0, 120),
      // The business's real site only — never the OSM page itself. A missing
      // website stays null (never shown as a fake "Visit website" link);
      // sourceUrl (below) is the honest provenance link, admin-only.
      providerWebsite: website || null,
      city,
      address: addr,
      lat: Math.round(lat * 1e6) / 1e6,
      lng: Math.round(lng * 1e6) / 1e6,
      priceCents: cat.free ? 0 : null,
      priceType: cat.free ? "free" : cat.priceType || "varies",
      priceBand: cat.priceBand,
      minAge: cat.minAge,
      indoorOutdoor: cat.indoorOutdoor,
      tags,
      sourceUrl: osmUrl,
      source: "osm",
      imageUrl,
      imageAttribution,
      osmId,
      _web: website ? 1 : 0,
      _img: imageUrl ? 1 : 0,
    });
  }

  // When a category has more raw elements than its cap, keep the richer
  // listings first — a real website and/or a real per-venue photo — instead
  // of discarding them in favour of an arbitrary earlier element with neither.
  bucket.sort((a, b) => b._web + b._img - (a._web + a._img));
  const take = bucket.slice(0, cat.cap);
  perCat[key] = `${take.length}/${bucket.length}`;
  for (const r of take) {
    delete r._web;
    delete r._img;
    OUT.push(r);
  }
}

writeFileSync(join(here, "osm-activities.json"), JSON.stringify(OUT, null, 1));
console.log(`raw elements scanned: ${raw}`);
console.log(`kept: ${OUT.length} activities across ${Object.keys(perCat).length} kinds`);
console.table(perCat);
