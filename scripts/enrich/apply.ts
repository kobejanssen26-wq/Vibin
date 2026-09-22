/**
 * APPLY stage: turn everything the pipeline verified into guarded SQL.
 * Every UPDATE only touches a row while the field it would fill is still
 * empty/generic (or, for tags, still exactly what we read), so re-running is
 * harmless and real data is never overwritten.
 *
 *   npx tsx scripts/enrich/apply.ts [--only web,desc,hours,cuisine,outdated,images]
 *
 * Output: data/enrichment/sql/NNN.sql  (300 statements each) + a summary.
 */
import fs from "node:fs";
import path from "node:path";
import { parseOpeningHours, toDisplayHours } from "../../src/worker/lib/opening-hours";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const only = (process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1]! : "web,desc,hours,cuisine,outdated,images,price").split(",");
const J = (p: string) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8").replace(/^﻿/, ""));
const has = (p: string) => fs.existsSync(path.join(ROOT, p));

const acts = new Map<string, any>(J("data/enrichment/prod-activities.json")[0].results.map((r: any) => [r.id, r]));
const crawl: any[] = fs.readFileSync(path.join(ROOT, "data/enrichment/crawl.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const crawlById = new Map(crawl.map((r) => [r.id, r]));
const verdicts = J("data/enrichment/verdicts.json") as Record<string, { verdict: string }>;
const validated = has("data/enrichment/validated.json") ? J("data/enrichment/validated.json") : { accepted: [] };
const images = has("data/enrichment/images.json") ? (J("data/enrichment/images.json") as Record<string, any>) : {};
// An image is only applied if a vision reviewer looked at it and kept it: the
// automatic checks cannot tell a venue photo from a logo, poster or unrelated picture.
const imageKept = new Set<string>();
for (const f of fs.readdirSync(path.join(ROOT, "data/enrichment/out")).filter((n) => /^img-review-.*\.json$/.test(n)))
  for (const [id, v] of Object.entries(J(`data/enrichment/out/${f}`) as Record<string, { v: string }>)) if (v.v === "keep") imageKept.add(id);

// Hand-checked from the venues' own pages / Google Maps status (see report):
const OUTDATED = new Set<string>(
  ["CENTRALE for contemporary art", "Yam-toto", "Baronian", "Bibliotheque de la Gourmandise", "Musée de la Gourmandise", "Op de Wolken", "De Patriot", "TC De Vrijheid"].flatMap(
    (t) => [...acts.values()].filter((a) => a.title === t).map((a) => a.id),
  ),
);

const q = (s: string | null) => (s === null ? "NULL" : `'${s.replace(/'/g, "''")}'`);
const stmts: string[] = [];
const count: Record<string, number> = {};
// Admin edits win: the admin panel stamps updated_at on every save, so any row
// changed after the snapshot these facts were gathered from is skipped entirely
// (otherwise e.g. our short_description would hide a description an admin just wrote).
const SNAPSHOT_AT = Math.floor(fs.statSync(path.join(ROOT, "data/enrichment/prod-activities.json")).mtimeMs / 1000);
const add = (kind: string, sql: string) => {
  stmts.push(sql.replace(/;$/, ` AND updated_at<=${SNAPSHOT_AT};`));
  count[kind] = (count[kind] || 0) + 1;
};
const now = Math.floor(Date.now() / 1000);

if (only.includes("web")) {
  for (const [id, v] of Object.entries(verdicts)) {
    const at = crawlById.get(id)?.at ?? now;
    add("web_status", `UPDATE activities SET web_status=${q(v.verdict)}, web_checked_at=${at} WHERE id=${q(id)};`);
  }
}

if (only.includes("outdated")) {
  for (const id of OUTDATED)
    add("outdated", `UPDATE activities SET status='outdated', needs_review_fields='["closed"]', updated_at=${now} WHERE id=${q(id)};`);
}

if (only.includes("desc")) {
  for (const a of validated.accepted) {
    if (!a.description) continue;
    if (OUTDATED.has(a.id)) continue;
    add(
      "description",
      `UPDATE activities SET short_description=${q(a.description)}, description_source=${q(a.wikiUrl ? 'wikipedia:' + a.wikiUrl : 'website summary 2026-09 (auto, source-validated)')}, description_checked_at=${now} WHERE id=${q(a.id)} AND short_description IS NULL;`,
    );
  }
}

const sane = (disp: Record<string, string>) => Object.keys(disp).length >= 1;
if (only.includes("hours")) {
  const done = new Set<string>();
  for (const a of validated.accepted) {
    if (!a.hours || !a.hoursDisplay) continue;
    done.add(a.id);
    add("hours(text)", `UPDATE activities SET opening_hours=${q(JSON.stringify(a.hoursDisplay))} WHERE id=${q(a.id)} AND opening_hours='{}';`);
  }
  // schema.org hours the sites publish themselves
  for (const r of crawl) {
    if (!r.ok || done.has(r.id) || verdicts[r.id]?.verdict !== "alive") continue;
    const act = acts.get(r.id);
    if (!act || act.opening_hours !== "{}") continue;
    const ld = r.jsonld?.find((e: any) => e.openingHours?.length || e.openingHoursSpec);
    if (!ld) continue;
    let disp: Record<string, string> | null = null;
    if (ld.openingHours?.length) {
      const parsed = parseOpeningHours(ld.openingHours.join("; "));
      disp = parsed ? (toDisplayHours(parsed) as Record<string, string>) : null;
    }
    if (!disp && ld.openingHoursSpec) {
      const map: Record<string, string> = { Monday: "Mon", Tuesday: "Tue", Wednesday: "Wed", Thursday: "Thu", Friday: "Fri", Saturday: "Sat", Sunday: "Sun" };
      const d: Record<string, string[]> = {};
      let ok = true;
      for (const s of ld.openingHoursSpec) {
        if (!s.opens || !s.closes || !/^\d{2}:\d{2}/.test(s.opens) || !/^\d{2}:\d{2}/.test(s.closes)) { ok = false; break; }
        for (const day of s.days) if (map[day]) (d[map[day]!] ||= []).push(`${s.opens.slice(0, 5)}-${s.closes.slice(0, 5)}`);
      }
      if (ok && Object.keys(d).length) disp = Object.fromEntries(Object.entries(d).map(([k, v]) => [k, v.join(",")]));
    }
    if (disp && sane(disp)) add("hours(schema.org)", `UPDATE activities SET opening_hours=${q(JSON.stringify(disp))} WHERE id=${q(r.id)} AND opening_hours='{}';`);
  }
}

if (only.includes("cuisine")) {
  for (const a of validated.accepted) {
    if (!a.cuisine) continue;
    const act = acts.get(a.id);
    if (!act) continue;
    let tags: string[] = [];
    try { tags = JSON.parse(act.tags); } catch { continue; }
    if (tags.some((t) => t.startsWith("cuisine:"))) continue;
    const next = JSON.stringify([...tags, `cuisine:${a.cuisine}`]);
    add("cuisine", `UPDATE activities SET tags=${q(next)} WHERE id=${q(a.id)} AND tags=${q(act.tags)};`);
  }
}

if (only.includes("price")) {
  for (const a of validated.accepted) {
    if (!a.price || OUTDATED.has(a.id)) continue;
    add(
      "price",
      `UPDATE activities SET price_min_cents=${Math.round(a.price.min * 100)}, price_max_cents=${Math.round(a.price.max * 100)}, price_unit_note=${q(a.price.unit)}, price_confidence='exact', price_source_url=${q(a.price.url)}, price_checked_at=${now} WHERE id=${q(a.id)} AND price_min_cents IS NULL AND price_type<>'free';`,
    );
  }
}

if (only.includes("images")) {
  for (const [id, im] of Object.entries(images)) {
    if (OUTDATED.has(id) || verdicts[id]?.verdict !== "alive" || !imageKept.has(id)) continue;
    let host = "website";
    try { host = new URL(im.url).host.replace(/^www\./, ""); } catch { /* keep */ }
    add(
      "image",
      `UPDATE activities SET image_url=${q(im.url)}, image_source=${q(`Official website (${host})`)}, image_attribution=NULL, image_is_generic=0, image_quality_score=3 WHERE id=${q(id)} AND image_is_generic=1;`,
    );
  }
}

const dir = path.join(ROOT, "data/enrichment/sql");
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
const CHUNK = 300;
for (let i = 0; i * CHUNK < stmts.length; i++) fs.writeFileSync(path.join(dir, `${String(i).padStart(3, "0")}.sql`), stmts.slice(i * CHUNK, (i + 1) * CHUNK).join("\n") + "\n");
console.log(`statements: ${stmts.length} in ${Math.ceil(stmts.length / CHUNK)} files`, count);
