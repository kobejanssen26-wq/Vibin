/**
 * Turns data/audit/decisions.json into guarded SQL batches (data/audit/sql/NN.sql).
 *  1. one audit row per audited activity
 *  2. hide excluded / duplicate / closed activities (soft: active=0, status inactive|outdated),
 *     only when the row was not edited since the export (admin edits win)
 *  3. mark the audit rows whose activity really got hidden
 * Nothing is deleted. Apply with: wrangler d1 execute vibin-db --remote --file data/audit/sql/NN.sql
 */
import fs from "node:fs";

const rows: any[] = JSON.parse(fs.readFileSync("data/audit/activities.json", "utf8"));
const byId = new Map(rows.map((r) => [r.id, r]));
const dec: Record<string, any> = JSON.parse(fs.readFileSync("data/audit/decisions.json", "utf8"));
const q = (v: unknown) => (v == null ? "NULL" : typeof v === "number" ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const HIDE = new Set(["exclude", "duplicate", "closed"]);
const now = Math.floor(Date.now() / 1000);

const stmts: string[] = [];
const ids = Object.keys(dec);
for (let i = 0; i < ids.length; i += 40) {
  const vals = ids.slice(i, i + 40).map((id) => {
    const d = dec[id];
    const a = byId.get(id);
    return `(${q(id)},${q(d.outcome)},${q(d.rule)},${q(d.reason)},${q(d.confidence)},${q(JSON.stringify(d.issues))},${q(d.duplicateOf ?? null)},0,${a.active},${q(a.status)},'rules',NULL,${now})`;
  });
  stmts.push(
    `INSERT OR REPLACE INTO activity_audits (activity_id,outcome,rule,reason,confidence,issues,duplicate_of,hidden,previous_active,previous_status,source,decided_by,audited_at) VALUES\n${vals.join(",\n")};`,
  );
}
for (const id of ids) {
  const d = dec[id];
  if (!HIDE.has(d.outcome)) continue;
  const a = byId.get(id);
  const status = d.outcome === "closed" ? "outdated" : "inactive";
  stmts.push(`UPDATE activities SET active=0, status=${q(status)}, updated_at=${now} WHERE id=${q(id)} AND active=1 AND updated_at<=${a.updated_at};`);
}
stmts.push(
  `UPDATE activity_audits SET hidden=1 WHERE outcome IN ('exclude','duplicate','closed') AND activity_id IN (SELECT id FROM activities WHERE active=0 AND status IN ('inactive','outdated'));`,
);

fs.mkdirSync("data/audit/sql", { recursive: true });
for (const f of fs.readdirSync("data/audit/sql")) fs.unlinkSync(`data/audit/sql/${f}`);
const PER = 250;
let n = 0;
for (let i = 0; i < stmts.length; i += PER) {
  fs.writeFileSync(`data/audit/sql/${String(++n).padStart(2, "0")}.sql`, stmts.slice(i, i + PER).join("\n"));
}
console.log(`${stmts.length} statements in ${n} files; hiding ${ids.filter((i) => HIDE.has(dec[i].outcome)).length} activities`);
