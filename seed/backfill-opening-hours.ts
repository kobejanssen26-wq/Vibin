/**
 * Populates activities.opening_hours (currently empty for every row — the
 * raw OSM opening_hours tag was only ever rendered as a text sentence inside
 * the description, never stored structured) from the original Overpass
 * cache in seed/osm/raw/*.json, matched back to activities by the same
 * `osm-<categoryKey>-<osmType><osmId>` slug the import pipeline already uses.
 *
 * Parsing uses lib/opening-hours.ts, which only handles the unambiguous core
 * of the OSM opening_hours syntax (day ranges, comma lists, time spans,
 * "off") and returns null for anything more exotic (month conditions, PH/SH,
 * open-ended "+", relative-to-Easter rules) — those activities are left with
 * empty opening_hours rather than a guessed schedule. Real data only.
 *
 *   npx tsx seed/backfill-opening-hours.ts --local   (or --remote)
 */
import { execSync } from "node:child_process";
import { writeFileSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseOpeningHours, toDisplayHours } from "../src/worker/lib/opening-hours";

const here = dirname(fileURLToPath(import.meta.url));
const RAW = join(here, "osm", "raw");
const mode = process.argv.includes("--remote") ? "--remote" : "--local";

function d1Query<T>(sql: string): T[] {
  const out = execSync(
    `npx wrangler d1 execute vibin-db ${mode} --command "${sql.replace(/"/g, '\\"')}" --json`,
    { encoding: "utf8", maxBuffer: 1024 * 1024 * 64 },
  );
  const start = out.indexOf("[");
  return JSON.parse(out.slice(start))[0].results as T[];
}

function d1Batch(statements: string[]): void {
  const file = join(tmpdir(), `backfill-hours-${Date.now()}.sql`);
  writeFileSync(file, statements.join("\n"));
  execSync(`npx wrangler d1 execute vibin-db ${mode} --file="${file}"`, {
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 16,
    stdio: ["ignore", "inherit", "inherit"],
  });
}

// Which active ids actually exist and are still on the default empty hours —
// no point overwriting an admin-edited row.
const existing = d1Query<{ id: string }>(
  `SELECT id FROM activities WHERE active = 1 AND opening_hours = '{}'`,
);
const existingIds = new Set(existing.map((r) => r.id));
console.log(`${existingIds.size} active activities currently have no opening hours.`);

const statements: string[] = [];
let parsed = 0;
let unparseable = 0;
let notInCatalogue = 0;

for (const file of readdirSync(RAW).filter((f) => f.endsWith(".json") && f !== "wikidata-images.json")) {
  const key = file.replace(/\.json$/, "");
  const raw = JSON.parse(readFileSync(join(RAW, file), "utf8"));
  const elements = Array.isArray(raw) ? raw : (raw.elements ?? []);
  for (const el of elements) {
    const hours = el.tags?.opening_hours as string | undefined;
    if (!hours) continue;
    const osmId = `${String(el.type)[0]}${el.id}`;
    const id = `act_osm-${key}-${osmId}`;
    if (!existingIds.has(id)) {
      notInCatalogue++;
      continue;
    }
    const spans = parseOpeningHours(hours);
    if (!spans) {
      unparseable++;
      continue;
    }
    const display = toDisplayHours(spans);
    const json = JSON.stringify(display).replace(/'/g, "''");
    statements.push(
      `UPDATE activities SET opening_hours='${json}', updated_at=${Math.floor(Date.now() / 1000)} WHERE id='${id}';`,
    );
    parsed++;
  }
}

console.log(
  `${parsed} activities matched with parseable opening hours; ${unparseable} had a tag this parser doesn't confidently handle (left empty); ${notInCatalogue} OSM elements with hours aren't in the active catalogue (capped out at import, or inactive).`,
);

const CHUNK = 200;
for (let i = 0; i < statements.length; i += CHUNK) {
  d1Batch(statements.slice(i, i + CHUNK));
  console.log(`  applied ${Math.min(i + CHUNK, statements.length)}/${statements.length}`);
}
console.log("\nDone.");
