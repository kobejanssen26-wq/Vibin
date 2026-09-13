/**
 * The seed pipeline only INSERTs/UPDATEs (seed.sql is all `INSERT OR
 * REPLACE`) — it never deletes. When a category's OSM cap keeps a different
 * subset of elements between runs (e.g. after the image/website priority
 * change), rows that fall out of scope become orphaned: still `active=1` in
 * the DB, still visible in swipe, but no longer part of what the current
 * seed would produce. This finds and soft-deactivates exactly those rows —
 * same pattern as every other soft-delete in the app (active=0,
 * status='inactive'), never a hard delete, and it never touches curated
 * (source='web') or admin-created activities, only source='osm' rows.
 *
 *   node seed/cleanup-orphaned-osm.mjs --local   (or --remote)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const mode = process.argv.includes("--remote") ? "--remote" : "--local";

const osmActivities = JSON.parse(
  readFileSync(join(here, "osm", "osm-activities.json"), "utf8"),
);
const validIds = new Set(osmActivities.map((a) => `act_${a.slug}`));

const rawOut = execSync(
  `npx wrangler d1 execute vibin-db ${mode} --command "SELECT id FROM activities WHERE source='osm' AND active=1" --json`,
  { encoding: "utf8", maxBuffer: 1024 * 1024 * 64 },
);
const jsonStart = rawOut.indexOf("[");
const rows = JSON.parse(rawOut.slice(jsonStart))[0].results;
const orphaned = rows.map((r) => r.id).filter((id) => !validIds.has(id));

console.log(`${rows.length} active OSM rows in the DB, ${orphaned.length} no longer in the current seed output.`);
if (orphaned.length === 0) {
  console.log("Nothing to clean up.");
  process.exit(0);
}

const tmp = join(tmpdir(), `vibin-orphan-cleanup-${Date.now()}.sql`);
const now = Math.floor(Date.now() / 1000);
const lines = orphaned.map(
  (id) => `UPDATE activities SET active=0, status='inactive', updated_at=${now} WHERE id='${id}';`,
);
writeFileSync(tmp, lines.join("\n"));

const CHUNK = 200;
for (let i = 0; i < orphaned.length; i += CHUNK) {
  const chunkFile = tmp + `.${i}`;
  writeFileSync(chunkFile, lines.slice(i, i + CHUNK).join("\n"));
  console.log(`  deactivating ${i + 1}-${Math.min(i + CHUNK, orphaned.length)} of ${orphaned.length}...`);
  execSync(`npx wrangler d1 execute vibin-db ${mode} --file="${chunkFile}"`, { stdio: "inherit" });
}
console.log(`done — ${orphaned.length} orphaned OSM activities deactivated.`);
