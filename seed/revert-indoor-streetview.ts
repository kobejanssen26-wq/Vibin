/**
 * Street View is an exterior/street-level source by definition — useful for
 * outdoor activities, actively unhelpful for indoor ones ("bowling" showing
 * a building facade tells you nothing about the lanes inside). The earlier
 * backfill didn't account for this and applied Street View to every activity
 * with coverage regardless of indoor_outdoor, including 2,741 indoor ones.
 *
 * This reverts those specific rows back to the honest subcategory/category
 * fallback (the same resolver seed/build-seed.ts uses) — e.g. "Bowling"
 * activities get the real bowling-lanes photo back instead of a shopfront.
 * Only touches rows with image_source = 'Google Street View' AND
 * indoor_outdoor = 'indoor'. Everything else (outdoor, both, non-streetview)
 * is untouched.
 *
 *   npx tsx seed/revert-indoor-streetview.ts --local   (or --remote)
 */
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { activityImageUrl } from "./activities";

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
  const file = join(tmpdir(), `revert-sv-${Date.now()}.sql`);
  writeFileSync(file, statements.join("\n"));
  execSync(`npx wrangler d1 execute vibin-db ${mode} --file="${file}"`, {
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 16,
    stdio: ["ignore", "inherit", "inherit"],
  });
}

interface Row {
  id: string;
  category_id: string;
  subcategory: string | null;
}

const rows = d1Query<Row>(
  `SELECT id, category_id, subcategory FROM activities
   WHERE active = 1 AND image_source = 'Google Street View' AND indoor_outdoor = 'indoor'`,
);
console.log(`${rows.length} indoor activities currently on a Street View exterior photo.`);

const now = Math.floor(Date.now() / 1000);
let reverted = 0;
let noFallback = 0;
const statements: string[] = [];

for (const r of rows) {
  const slug = r.id.startsWith("act_") ? r.id.slice(4) : r.id;
  const resolved = activityImageUrl(slug, r.category_id, r.subcategory ?? undefined);
  if (!resolved) {
    noFallback++;
    continue;
  }
  const esc = (s: string) => s.replace(/'/g, "''");
  statements.push(
    `UPDATE activities SET image_url='${esc(resolved.url)}', image_source='${esc(resolved.source)}', ` +
      `image_attribution='${esc(resolved.attribution)}', image_is_generic=${resolved.generic ? 1 : 0}, ` +
      `updated_at=${now} WHERE id='${esc(r.id)}';`,
  );
  reverted++;
}

const CHUNK = 200;
for (let i = 0; i < statements.length; i += CHUNK) {
  d1Batch(statements.slice(i, i + CHUNK));
  console.log(`  applied ${Math.min(i + CHUNK, statements.length)}/${statements.length}`);
}

console.log(`\nDone — ${reverted} reverted to their subcategory/category fallback, ${noFallback} had no fallback available (left on Street View).`);
