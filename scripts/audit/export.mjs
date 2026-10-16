import { execFileSync } from "node:child_process";
import fs from "node:fs";

const cols = `id, provider_id, external_id, title, provider, category_id, subcategory, city, address, lat, lng, website_url, provider_website, booking_url, web_status, status, active, source, source_url, tags, image_url, image_source, image_is_generic, image_quality_score, price_cents, price_type, price_band, price_confidence, price_source_url, short_description, substr(description,1,300) AS description, description_source, needs_review_fields, last_verified_at, created_at, updated_at`;
const wr = ["node_modules/wrangler/bin/wrangler.js"];
let last = "";
const all = [];
for (;;) {
  const q = `SELECT ${cols} FROM activities WHERE id > '${last.replace(/'/g, "''")}' ORDER BY id LIMIT 1200`;
  const out = execFileSync(process.execPath, [...wr, "d1", "execute", "vibin-db", "--remote", "--json", "--command", q], { encoding: "utf8", maxBuffer: 200e6 });
  const start = out.indexOf("[\n");
  const rows = JSON.parse(out.slice(start))[0].results;
  if (!rows.length) break;
  all.push(...rows);
  last = rows[rows.length - 1].id;
  console.log("rows", all.length);
}
fs.writeFileSync("data/audit/activities.json", JSON.stringify(all));
console.log("saved", all.length);
