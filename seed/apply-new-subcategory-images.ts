/**
 * Re-resolves image_url for activities whose subcategory just gained a
 * proper SUBCATEGORY_IMAGES entry in seed/activities.ts (Tennis, Golf, Padel,
 * Swimming pool) — before this they fell through to the generic per-category
 * Unsplash stock photo, so e.g. every Sport activity without its own venue
 * photo showed the same generic sports image regardless of whether it was
 * tennis, golf, padel or something else entirely. Only touches rows that are
 * still on the generic fallback (image_is_generic=1) — a venue-specific photo
 * (image_is_generic=0) is never overwritten.
 *
 *   npx tsx seed/apply-new-subcategory-images.ts --local   (or --remote)
 */
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { activityImageUrl } from "./activities";

const mode = process.argv.includes("--remote") ? "--remote" : "--local";
const NEW_SUBCATS = ["Tennis", "Golf", "Padel", "Swimming pool"];

function d1Query<T>(sql: string): T[] {
  const out = execSync(
    `npx wrangler d1 execute vibin-db ${mode} --command "${sql.replace(/"/g, '\\"')}" --json`,
    { encoding: "utf8", maxBuffer: 1024 * 1024 * 64 },
  );
  const start = out.indexOf("[");
  return JSON.parse(out.slice(start))[0].results as T[];
}

function d1Batch(statements: string[]): void {
  const file = join(tmpdir(), `apply-subcat-img-${Date.now()}.sql`);
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

const inList = NEW_SUBCATS.map((s) => `'${s}'`).join(",");
const rows = d1Query<Row>(
  `SELECT id, category_id, subcategory FROM activities
   WHERE active = 1 AND image_is_generic = 1 AND subcategory IN (${inList})`,
);
console.log(`${rows.length} activities on the old generic category fallback for: ${NEW_SUBCATS.join(", ")}.`);

const now = Math.floor(Date.now() / 1000);
let updated = 0;
const statements: string[] = [];

for (const r of rows) {
  const slug = r.id.startsWith("act_") ? r.id.slice(4) : r.id;
  const resolved = activityImageUrl(slug, r.category_id, r.subcategory ?? undefined);
  if (!resolved) continue;
  const esc = (s: string) => s.replace(/'/g, "''");
  statements.push(
    `UPDATE activities SET image_url='${esc(resolved.url)}', image_source='${esc(resolved.source)}', ` +
      `image_attribution='${esc(resolved.attribution)}', image_is_generic=${resolved.generic ? 1 : 0}, ` +
      `updated_at=${now} WHERE id='${esc(r.id)}';`,
  );
  updated++;
}

const CHUNK = 200;
for (let i = 0; i < statements.length; i += CHUNK) {
  d1Batch(statements.slice(i, i + CHUNK));
  console.log(`  applied ${Math.min(i + CHUNK, statements.length)}/${statements.length}`);
}

console.log(`\nDone — ${updated} activities moved to their new subcategory-specific photo.`);
