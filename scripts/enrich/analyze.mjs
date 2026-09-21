#!/usr/bin/env node
/**
 * Classify every crawled website into a verdict and print the distribution.
 * Pure function of data/enrichment/crawl.jsonl — writes data/enrichment/verdicts.json.
 *
 * Verdicts (web_status):
 *   alive          fetched fine, real content
 *   dead           DNS failure / refused / 404-410 on the homepage: the link is broken
 *   parked         placeholder or "under construction" page with almost no content
 *   closed_signal  the venue's OWN site says it has closed / stopped
 *   blocked        403/429/5xx/timeouts/robots: we could not look — says nothing about the venue
 *   unknown        anything else
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const lines = fs.readFileSync(path.join(ROOT, "data/enrichment/crawl.jsonl"), "utf8").split("\n").filter(Boolean);
const crawl = lines.map((l) => JSON.parse(l));

const DEAD_ERRORS = new Set(["ENOTFOUND", "ECONNREFUSED", "http-404", "http-410", "EAI_AGAIN"]);

export function verdictFor(r) {
  if (r.ok) {
    if (r.closedSignal) return "closed_signal";
    if (r.parked) return "parked";
    return "alive";
  }
  if (DEAD_ERRORS.has(r.error)) return "dead";
  if (r.error === "bad-url") return "dead";
  return "blocked";
}

const verdicts = {};
const dist = {};
for (const r of crawl) {
  const v = verdictFor(r);
  verdicts[r.id] = { verdict: v, error: r.error ?? null, closedSignal: r.closedSignal ?? null, movedTo: r.redirectedToOtherHost ?? null };
  dist[v] = (dist[v] || 0) + 1;
}
fs.writeFileSync(path.join(ROOT, "data/enrichment/verdicts.json"), JSON.stringify(verdicts));

const alive = crawl.filter((r) => r.ok && !r.parked && !r.closedSignal);
const stat = (label, n) => console.log(`${label.padEnd(46)} ${String(n).padStart(5)}  (${((n / crawl.length) * 100).toFixed(1)}%)`);
console.log(`crawled: ${crawl.length}`);
for (const [k, v] of Object.entries(dist).sort((a, b) => b[1] - a[1])) stat(`verdict ${k}`, v);
console.log("--");
stat("alive with a meta/og description", alive.filter((r) => r.metaDescription || r.ogDescription).length);
stat("alive with schema.org description", alive.filter((r) => r.jsonld.some((e) => e.description)).length);
stat("alive with >=400 chars of visible text", alive.filter((r) => r.textLength >= 400).length);
stat("alive with JSON-LD opening hours", alive.filter((r) => r.jsonld.some((e) => e.openingHours.length || e.openingHoursSpec)).length);
stat("alive with JSON-LD cuisine", alive.filter((r) => r.jsonld.some((e) => e.servesCuisine.length)).length);
stat("alive with JSON-LD priceRange", alive.filter((r) => r.jsonld.some((e) => e.priceRange)).length);
stat("alive with og:image", alive.filter((r) => r.ogImage).length);
stat("redirected to a different domain", crawl.filter((r) => r.redirectedToOtherHost).length);
console.log("closed-signal phrases:", [...new Set(crawl.filter((r) => r.closedSignal).map((r) => r.closedSignal.toLowerCase()))].slice(0, 12));
console.log("errors:", Object.entries(crawl.filter((r) => !r.ok).reduce((a, r) => ((a[r.error] = (a[r.error] || 0) + 1), a), {})).sort((a, b) => b[1] - a[1]).slice(0, 10));
