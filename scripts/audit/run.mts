/**
 * Whole-catalogue audit (read-only). Reads the exported catalogue
 * (data/audit/activities.json) and the earlier website crawl, applies the shared
 * quality rules and writes data/audit/decisions.json + a summary.
 *   npx tsx scripts/audit/run.mts
 */
import fs from "node:fs";
import { assessActivity, findDuplicateGroups, type Assessment, type AuditEvidence } from "../../src/worker/lib/activity-quality";

const rows: any[] = JSON.parse(fs.readFileSync("data/audit/activities.json", "utf8"));
const active = rows.filter((r) => r.active === 1);

// evidence from the earlier crawl (venue's own website)
const evidence = new Map<string, AuditEvidence>();
for (const f of ["data/enrichment/crawl.jsonl", "data/enrichment/crawl.first-1275.jsonl"]) {
  if (!fs.existsSync(f)) continue;
  for (const line of fs.readFileSync(f, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const o = JSON.parse(line);
      if (!o.ok) continue;
      evidence.set(o.id, { text: o.text, title: o.title, meta: o.metaDescription, closedSignal: !!o.closedSignal });
    } catch { /* skip */ }
  }
}

const decisions = new Map<string, Assessment & { duplicateOf?: string }>();
for (const r of active) decisions.set(r.id, assessActivity(r, evidence.get(r.id)));

// duplicates (only among rows that are not already excluded/closed)
const live = active.filter((r) => !["exclude", "closed"].includes(decisions.get(r.id)!.outcome));
const groups = findDuplicateGroups(live);
let dupRows = 0;
for (const g of groups) {
  const [keep, ...rest] = g;
  for (const d of rest) {
    dupRows++;
    decisions.set(d.id, {
      outcome: "duplicate",
      rule: "duplicate_of_better",
      reason: `Dubbele vermelding van "${keep!.title}" (${keep!.id}).`,
      confidence: "high",
      issues: decisions.get(d.id)!.issues,
      duplicateOf: keep!.id,
    });
  }
}

const tally = (f: (d: Assessment) => string) => {
  const m: Record<string, number> = {};
  for (const d of decisions.values()) m[f(d)] = (m[f(d)] ?? 0) + 1;
  return Object.fromEntries(Object.entries(m).sort((a, b) => b[1] - a[1]));
};
console.log("active rows:", active.length, "| evidence for", [...decisions.keys()].filter((k) => evidence.has(k)).length);
console.log("duplicate groups:", groups.length, "extra rows:", dupRows);
console.log("outcomes:", tally((d) => d.outcome));
console.log("rules:", tally((d) => `${d.outcome}:${d.rule}`));
fs.writeFileSync("data/audit/decisions.json", JSON.stringify(Object.fromEntries(decisions)));
