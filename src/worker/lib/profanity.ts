/**
 * Lightweight profanity filter for group chat. Matches whole words only
 * (word-boundary regex, case-insensitive) against a curated Dutch/English/
 * French list, so it censors "shit" but not words that merely contain it as
 * a substring. Matched words are replaced with asterisks of the same length
 * — the message still sends, just with the slur masked, rather than being
 * rejected outright (fewer false-positive frustrations for borderline text).
 *
 * This is a blunt first line of defense, not a moderation system — reports
 * still exist for anything it misses.
 */
const WORDS = [
  // Dutch
  "kanker", "kankerlijer", "tyfuslijer", "kut", "klootzak", "lul", "hoer",
  "hoerenjong", "teringlijer", "pokkenlijer", "flikker", "kankerhoer",
  "vieze hoer", "reetkever", "kutwijf", "loser", "debiel", "mongool",
  "achterlijk", "klerelijer", "godverdomme", "trut", "eikel", "gadver",
  // English
  "fuck", "fucking", "fucker", "shit", "bullshit", "bitch", "asshole",
  "bastard", "cunt", "dick", "pussy", "whore", "slut", "faggot", "retard",
  "nigger", "nigga",
  // French
  "merde", "putain", "connard", "salope", "enculé", "pute", "bordel",
];

const escaped = WORDS.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
const PATTERN = new RegExp(`\\b(${escaped.join("|")})\\b`, "giu");

export function censor(text: string): { clean: string; flagged: boolean } {
  let flagged = false;
  const clean = text.replace(PATTERN, (m) => {
    flagged = true;
    return m[0] + "*".repeat(Math.max(0, m.length - 1));
  });
  return { clean, flagged };
}
