/**
 * Cross-source de-duplication key. The same match / concert / market often comes
 * from several feeds with cosmetic name differences ("Antwerp vs Club Brugge" vs
 * "Antwerp - Club Brugge"), so the hash is built from:
 *
 *   normalised title (accents/punctuation/filler stripped, teams sorted)
 *   + calendar day (Europe/Brussels)
 *   + normalised city
 *
 * Two rows with the same hash are treated as the same event; the higher-trust
 * source wins on conflict (see ingest.ts).
 */

const FILLER = /\b(the|le|la|les|de|het|een|a|an|vs|v|versus|tegen|x)\b/g;

function normTitle(title: string): string {
  const base = title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/[-]+/g, " ")
    .replace(FILLER, " ")
    .replace(/\s+/g, " ")
    .trim();
  // "antwerp brugge" and "brugge antwerp" -> same key (sort word tokens)
  return base.split(" ").filter(Boolean).sort().join(" ");
}

function dayKey(startsAtSec: number): string {
  // Europe/Brussels is UTC+1/+2; a coarse +1h shift is enough to bucket by the
  // local calendar day for a de-dupe key (we don't need DST precision here).
  const d = new Date((startsAtSec + 3600) * 1000);
  return d.toISOString().slice(0, 10);
}

function normCity(city: string | null): string {
  return (city ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

/** Stable 53-bit FNV-1a hash rendered as hex — no crypto needed for a bucket key. */
function fnv1a(s: string): string {
  let h = 0xcbf29ce4 >>> 0;
  let h2 = 0x84222325 >>> 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h ^= c;
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    h2 ^= c;
    h2 = Math.imul(h2, 0x01000193) >>> 0;
  }
  return (h >>> 0).toString(16).padStart(8, "0") + (h2 >>> 0).toString(16).padStart(8, "0");
}

export function dedupeHash(
  title: string,
  startsAtSec: number,
  city: string | null,
): string {
  return fnv1a(`${normTitle(title)}|${dayKey(startsAtSec)}|${normCity(city)}`);
}
