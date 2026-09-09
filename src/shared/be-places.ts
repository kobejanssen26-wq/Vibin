/**
 * Offline geocoder for Belgian places — framework-free, shared by the Worker and
 * the client. Lets the group "location + radius" filter actually work without an
 * external geocoding API: a city name or 4-digit postcode resolves to an
 * approximate municipality-centre coordinate.
 *
 * Not exhaustive (Belgium has 581 municipalities); it covers the large towns and
 * their postcodes across every province plus the Brussels region. An unknown
 * input resolves to `null`, and the radius filter is then simply not applied
 * (the group still swipes the whole catalogue) — the safe fallback.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

/** Normalised place name -> municipality-centre coordinate. */
const PLACES: Record<string, LatLng> = {
  // Brussels-Capital Region
  brussel: { lat: 50.8467, lng: 4.3525 },
  bruxelles: { lat: 50.8467, lng: 4.3525 },
  brussels: { lat: 50.8467, lng: 4.3525 },
  schaarbeek: { lat: 50.8676, lng: 4.3737 },
  schaerbeek: { lat: 50.8676, lng: 4.3737 },
  anderlecht: { lat: 50.8361, lng: 4.3097 },
  "sint gillis": { lat: 50.8256, lng: 4.3452 },
  "saint gilles": { lat: 50.8256, lng: 4.3452 },
  elsene: { lat: 50.8331, lng: 4.3667 },
  ixelles: { lat: 50.8331, lng: 4.3667 },
  ukkel: { lat: 50.8028, lng: 4.3381 },
  uccle: { lat: 50.8028, lng: 4.3381 },
  etterbeek: { lat: 50.8367, lng: 4.3894 },
  jette: { lat: 50.8781, lng: 4.3253 },
  evere: { lat: 50.8703, lng: 4.4019 },
  laken: { lat: 50.8833, lng: 4.35 },
  laeken: { lat: 50.8833, lng: 4.35 },
  molenbeek: { lat: 50.855, lng: 4.3235 },

  // Antwerp province
  antwerpen: { lat: 51.2194, lng: 4.4025 },
  antwerp: { lat: 51.2194, lng: 4.4025 },
  anvers: { lat: 51.2194, lng: 4.4025 },
  berchem: { lat: 51.1979, lng: 4.4331 },
  deurne: { lat: 51.2153, lng: 4.4642 },
  wilrijk: { lat: 51.1697, lng: 4.3931 },
  mortsel: { lat: 51.1686, lng: 4.4589 },
  mechelen: { lat: 51.0259, lng: 4.4776 },
  malines: { lat: 51.0259, lng: 4.4776 },
  lier: { lat: 51.1319, lng: 4.5706 },
  turnhout: { lat: 51.3226, lng: 4.9447 },
  geel: { lat: 51.1649, lng: 4.9903 },
  mol: { lat: 51.1917, lng: 5.1139 },
  herentals: { lat: 51.1794, lng: 4.8317 },
  kasterlee: { lat: 51.2417, lng: 4.9662 },
  wommelgem: { lat: 51.2003, lng: 4.5197 },
  brasschaat: { lat: 51.2892, lng: 4.4919 },
  schoten: { lat: 51.2531, lng: 4.5017 },
  kalmthout: { lat: 51.3846, lng: 4.4636 },
  puurs: { lat: 51.0783, lng: 4.2861 },
  rumst: { lat: 51.0797, lng: 4.4231 },

  // East Flanders
  gent: { lat: 51.0543, lng: 3.7174 },
  ghent: { lat: 51.0543, lng: 3.7174 },
  gand: { lat: 51.0543, lng: 3.7174 },
  aalst: { lat: 50.9378, lng: 4.0355 },
  "sint niklaas": { lat: 51.1649, lng: 4.1437 },
  dendermonde: { lat: 51.0286, lng: 4.1014 },
  oudenaarde: { lat: 50.845, lng: 3.6094 },
  eeklo: { lat: 51.1866, lng: 3.5566 },
  deinze: { lat: 50.985, lng: 3.5303 },
  geraardsbergen: { lat: 50.7717, lng: 3.8794 },
  lokeren: { lat: 51.1036, lng: 3.9931 },
  wachtebeke: { lat: 51.1699, lng: 3.8734 },
  wetteren: { lat: 51.0011, lng: 3.8797 },

  // West Flanders
  brugge: { lat: 51.2093, lng: 3.2247 },
  bruges: { lat: 51.2093, lng: 3.2247 },
  kortrijk: { lat: 50.8283, lng: 3.2649 },
  courtrai: { lat: 50.8283, lng: 3.2649 },
  oostende: { lat: 51.2154, lng: 2.9286 },
  ostende: { lat: 51.2154, lng: 2.9286 },
  roeselare: { lat: 50.9469, lng: 3.1256 },
  ieper: { lat: 50.851, lng: 2.8858 },
  ypres: { lat: 50.851, lng: 2.8858 },
  "knokke heist": { lat: 51.3407, lng: 3.2916 },
  knokke: { lat: 51.3407, lng: 3.2916 },
  waregem: { lat: 50.8894, lng: 3.4272 },
  "de panne": { lat: 51.0973, lng: 2.5876 },
  "de haan": { lat: 51.2717, lng: 3.0281 },
  blankenberge: { lat: 51.3128, lng: 3.1319 },
  poperinge: { lat: 50.8547, lng: 2.7261 },
  veurne: { lat: 51.0722, lng: 2.6631 },

  // Flemish Brabant
  leuven: { lat: 50.8798, lng: 4.7005 },
  louvain: { lat: 50.8798, lng: 4.7005 },
  vilvoorde: { lat: 50.9281, lng: 4.4258 },
  halle: { lat: 50.7343, lng: 4.2364 },
  tienen: { lat: 50.8072, lng: 4.9378 },
  diest: { lat: 50.9856, lng: 5.0503 },
  aarschot: { lat: 50.9861, lng: 4.8331 },
  grimbergen: { lat: 50.9339, lng: 4.3728 },
  dilbeek: { lat: 50.8497, lng: 4.2603 },
  meise: { lat: 50.9276, lng: 4.3273 },
  overijse: { lat: 50.7758, lng: 4.5342 },
  tervuren: { lat: 50.8236, lng: 4.5164 },
  zaventem: { lat: 50.8836, lng: 4.4708 },
  melsbroek: { lat: 50.9086, lng: 4.493 },
  liedekerke: { lat: 50.8676, lng: 4.0837 },

  // Limburg
  hasselt: { lat: 50.9307, lng: 5.3378 },
  genk: { lat: 50.9655, lng: 5.5005 },
  "sint truiden": { lat: 50.8167, lng: 5.1869 },
  tongeren: { lat: 50.7808, lng: 5.4642 },
  bilzen: { lat: 50.8722, lng: 5.5175 },
  beringen: { lat: 51.0508, lng: 5.2278 },
  lommel: { lat: 51.2306, lng: 5.3133 },
  maaseik: { lat: 51.0972, lng: 5.7911 },
  maasmechelen: { lat: 50.9667, lng: 5.6947 },
  pelt: { lat: 51.2264, lng: 5.4111 },

  // Hainaut
  charleroi: { lat: 50.4114, lng: 4.4447 },
  mons: { lat: 50.4542, lng: 3.9564 },
  bergen: { lat: 50.4542, lng: 3.9564 },
  "la louviere": { lat: 50.4786, lng: 4.1875 },
  tournai: { lat: 50.6072, lng: 3.3878 },
  doornik: { lat: 50.6072, lng: 3.3878 },
  mouscron: { lat: 50.7442, lng: 3.2136 },
  binche: { lat: 50.4122, lng: 4.1672 },
  ath: { lat: 50.6294, lng: 3.7783 },
  soignies: { lat: 50.5789, lng: 4.0703 },
  brugelette: { lat: 50.5906, lng: 3.8508 },

  // Liège
  liege: { lat: 50.6326, lng: 5.5797 },
  luik: { lat: 50.6326, lng: 5.5797 },
  verviers: { lat: 50.5911, lng: 5.8672 },
  seraing: { lat: 50.5836, lng: 5.5011 },
  herstal: { lat: 50.6636, lng: 5.6317 },
  huy: { lat: 50.5186, lng: 5.2394 },
  hoei: { lat: 50.5186, lng: 5.2394 },
  eupen: { lat: 50.6281, lng: 6.0364 },
  spa: { lat: 50.4922, lng: 5.8647 },
  stavelot: { lat: 50.395, lng: 5.9314 },
  aywaille: { lat: 50.473, lng: 5.6741 },
  malmedy: { lat: 50.4258, lng: 6.0289 },
  waimes: { lat: 50.4165, lng: 6.1129 },

  // Namur
  namur: { lat: 50.4674, lng: 4.8719 },
  namen: { lat: 50.4674, lng: 4.8719 },
  dinant: { lat: 50.2607, lng: 4.9127 },
  andenne: { lat: 50.4894, lng: 5.0956 },
  gembloux: { lat: 50.5614, lng: 4.6919 },
  ciney: { lat: 50.2953, lng: 5.0997 },
  "han sur lesse": { lat: 50.1236, lng: 5.1889 },
  rochefort: { lat: 50.1597, lng: 5.2222 },

  // Walloon Brabant
  wavre: { lat: 50.7168, lng: 4.6118 },
  waver: { lat: 50.7168, lng: 4.6118 },
  nivelles: { lat: 50.5972, lng: 4.3272 },
  nijvel: { lat: 50.5972, lng: 4.3272 },
  "louvain la neuve": { lat: 50.6689, lng: 4.6151 },
  "braine l alleud": { lat: 50.6836, lng: 4.3689 },
  waterloo: { lat: 50.7147, lng: 4.399 },

  // Luxembourg province
  arlon: { lat: 49.6839, lng: 5.8156 },
  aarlen: { lat: 49.6839, lng: 5.8156 },
  bastogne: { lat: 50.0028, lng: 5.7186 },
  bastenaken: { lat: 50.0028, lng: 5.7186 },
  marche: { lat: 50.2269, lng: 5.3453 },
  "marche en famenne": { lat: 50.2269, lng: 5.3453 },
  durbuy: { lat: 50.3531, lng: 5.4564 },
};

/**
 * Postcode ranges -> coordinate. Belgian 4-digit postcodes are geographic; a
 * per-hundred bucket is close enough for a "within X km" filter. Only ranges we
 * are confident about are listed; anything else falls through to the name map.
 */
const POSTCODE_BUCKETS: { lo: number; hi: number; at: LatLng }[] = [
  { lo: 1000, hi: 1299, at: { lat: 50.8467, lng: 4.3525 } }, // Brussels region
  { lo: 1300, hi: 1499, at: { lat: 50.6689, lng: 4.6 } }, // Walloon Brabant
  { lo: 1500, hi: 1999, at: { lat: 50.85, lng: 4.3 } }, // Flemish Brabant (west) / Halle-Vilvoorde
  { lo: 2000, hi: 2999, at: { lat: 51.2194, lng: 4.4025 } }, // Antwerp province
  { lo: 3000, hi: 3499, at: { lat: 50.8798, lng: 4.7005 } }, // Flemish Brabant (Leuven)
  { lo: 3500, hi: 3999, at: { lat: 50.9307, lng: 5.3378 } }, // Limburg
  { lo: 4000, hi: 4999, at: { lat: 50.6326, lng: 5.5797 } }, // Liège
  { lo: 5000, hi: 5999, at: { lat: 50.4674, lng: 4.8719 } }, // Namur
  { lo: 6000, hi: 6599, at: { lat: 50.4114, lng: 4.4447 } }, // Hainaut (Charleroi)
  { lo: 6600, hi: 6999, at: { lat: 50.0028, lng: 5.7186 } }, // Luxembourg province
  { lo: 7000, hi: 7999, at: { lat: 50.4542, lng: 3.9564 } }, // Hainaut (Mons/west)
  { lo: 8000, hi: 8999, at: { lat: 51.05, lng: 3.1 } }, // West Flanders
  { lo: 9000, hi: 9999, at: { lat: 51.0543, lng: 3.7174 } }, // East Flanders
];

/** lowercase, strip accents, drop punctuation, collapse whitespace. */
function normalise(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['`’.]/g, " ")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Resolve a free-text Belgian location ("Antwerpen", "2000 Antwerpen", "9000",
 * "Gent, BE") to an approximate coordinate, or `null` if it can't be placed.
 */
export function resolvePlace(input: string | null | undefined): LatLng | null {
  if (!input) return null;
  const norm = normalise(input);
  if (!norm) return null;

  // Exact / prefix name match first.
  if (PLACES[norm]) return PLACES[norm];
  const noBe = norm.replace(/\s+be$|\s+belgium$|\s+belgie$|\s+belgique$/i, "").trim();
  if (PLACES[noBe]) return PLACES[noBe];

  // A 4-digit postcode anywhere in the string.
  const pc = norm.match(/\b(\d{4})\b/);
  if (pc) {
    const n = Number(pc[1]);
    const bucket = POSTCODE_BUCKETS.find((b) => n >= b.lo && n <= b.hi);
    if (bucket) {
      // If a known town name is also present, prefer that (more precise).
      const rest = normalise(norm.replace(pc[1]!, " "));
      if (rest && PLACES[rest]) return PLACES[rest];
      return bucket.at;
    }
  }

  // Token match: any word in the input that is itself a known place.
  for (const tok of noBe.split(/[\s,-]+/)) {
    if (tok.length >= 3 && PLACES[tok]) return PLACES[tok];
  }
  return null;
}
