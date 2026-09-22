#!/usr/bin/env node
/**
 * VIBIN — photo audit (master-prompt §5): per active activity, record image
 * URL / source / whether it's a specific (non-generic) photo, and flag any
 * image URL used by more than one activity — a shared photo can't be a real
 * photo of every place using it, whatever `image_is_generic` currently says.
 *
 * Read-only report. To actually fix a flagged row, an admin replaces its
 * image (existing admin activity editor) or a future enrichment pass
 * supplies a real per-venue photo; this script only finds the problem.
 *
 *   npx wrangler d1 execute vibin-db --remote --json --command \
 *     "SELECT id, title, image_url, image_source, image_is_generic FROM activities WHERE active=1 AND status NOT IN ('outdated','inactive')" \
 *     > data/enrichment/image-audit-export.json
 *   node scripts/enrich/image-audit.mjs
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const inPath = path.join(ROOT, "data/enrichment/image-audit-export.json");
if (!fs.existsSync(inPath)) {
  console.error(`Missing ${inPath} — run the wrangler export command in this file's header comment first.`);
  process.exit(1);
}
const rows = JSON.parse(fs.readFileSync(inPath, "utf8"))[0].results;

const byUrl = new Map();
for (const a of rows) {
  if (!a.image_url) continue;
  if (!byUrl.has(a.image_url)) byUrl.set(a.image_url, []);
  byUrl.get(a.image_url).push(a);
}

const sharedNotFlagged = []; // real bug: looks "specific" but is reused
const sharedFlagged = []; // expected: a known generic fallback, correctly marked
const noImage = rows.filter((a) => !a.image_url);

for (const [url, uses] of byUrl) {
  if (uses.length < 2) continue;
  if (uses.some((u) => !u.image_is_generic)) sharedNotFlagged.push({ url, uses });
  else sharedFlagged.push({ url, count: uses.length });
}

console.log(`activities checked: ${rows.length}`);
console.log(`no image at all: ${noImage.length}`);
console.log(`generic (fallback) photo: ${rows.filter((a) => a.image_is_generic).length}`);
console.log(`shared image URLs, already correctly marked generic: ${sharedFlagged.length} groups, ${sharedFlagged.reduce((n, g) => n + g.count, 0)} activities`);
console.log(`shared image URLs marked as a SPECIFIC photo (data bug — needs a real fix, not just a flag flip): ${sharedNotFlagged.length}`);
for (const g of sharedNotFlagged) {
  console.log(`  ${g.url}`);
  for (const u of g.uses) console.log(`    - ${u.id}  ${u.title}  (source: ${u.image_source})`);
}

fs.writeFileSync(
  path.join(ROOT, "data/enrichment/image-audit-report.json"),
  JSON.stringify({ generatedAt: new Date().toISOString(), sharedNotFlagged, sharedFlaggedCount: sharedFlagged.length, noImageCount: noImage.length }, null, 1),
);
