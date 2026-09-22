#!/usr/bin/env node
/**
 * Wikipedia facts for venues without any description: Wikidata id (from the OSM
 * import) -> English Wikipedia article -> REST summary (plain-text intro).
 * Slow on purpose (Wikimedia rate limits); output is text + article URL only.
 * Output: data/enrichment/wiki.jsonl  {id,title,url,extract}
 */
import fs from "node:fs";
import path from "node:path";
const ROOT = path.resolve(import.meta.dirname, "..", "..");
const UA = { "user-agent": "VIBIN-enrichment/1.0 (https://vibin.be; venue descriptions; contact via vibin.be/contact)" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const acts = JSON.parse(fs.readFileSync(path.join(ROOT, "data/enrichment/prod-activities.json"), "utf8"))[0].results;
const byKey = new Map();
for (const a of acts) { const m = a.id.match(/-([nwr]\d+)$/); if (m) byKey.set(m[1], a); }
const val = JSON.parse(fs.readFileSync(path.join(ROOT, "data/enrichment/validated.json"), "utf8"));
const have = new Set(val.accepted.filter((a) => a.description).map((a) => a.id));
const dir = path.join(ROOT, "seed/osm/raw");
const items = [];
const seen = new Set();
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".json"))) {
  let j; try { j = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); } catch { continue; }
  for (const e of j.elements || []) {
    const k = (e.type === "node" ? "n" : e.type === "way" ? "w" : "r") + e.id;
    const a = byKey.get(k);
    if (!a || seen.has(k) || have.has(a.id) || a.enriched || (a.short_description || "").trim()) continue;
    seen.add(k);
    if (e.tags?.wikidata && /^Q\d+$/.test(e.tags.wikidata)) items.push({ id: a.id, title: a.title, qid: e.tags.wikidata });
  }
}
console.log("candidates with wikidata:", items.length);
const enTitle = {};
const qids = [...new Set(items.map((i) => i.qid))];
for (let i = 0; i < qids.length; i += 40) {
  const u = "https://www.wikidata.org/w/api.php?action=wbgetentities&props=sitelinks&sitefilter=enwiki&format=json&ids=" + qids.slice(i, i + 40).join("|");
  for (let t = 0; t < 4; t++) {
    const r = await fetch(u, { headers: UA });
    const txt = await r.text();
    try { const j = JSON.parse(txt); for (const [q, e] of Object.entries(j.entities || {})) if (e.sitelinks?.enwiki) enTitle[q] = e.sitelinks.enwiki.title; break; }
    catch { await sleep(8000 * (t + 1)); }
  }
  await sleep(1500);
}
const withEn = items.filter((i) => enTitle[i.qid]);
console.log("with English article:", withEn.length);
const out = fs.createWriteStream(path.join(ROOT, "data/enrichment/wiki.jsonl"));
let n = 0;
for (const it of withEn) {
  const t = enTitle[it.qid];
  try {
    const r = await fetch("https://en.wikipedia.org/api/rest_v1/page/summary/" + encodeURIComponent(t.replace(/ /g, "_")), { headers: UA });
    if (r.ok) {
      const j = await r.json();
      if (j.type === "standard" && j.extract && j.extract.length > 120) {
        out.write(JSON.stringify({ id: it.id, name: it.title, title: j.title, url: j.content_urls?.desktop?.page, extract: j.extract.slice(0, 1400) }) + "\n");
        n++;
      }
    } else if (r.status === 429) await sleep(10000);
  } catch { /* skip */ }
  await sleep(350);
}
out.end();
console.log("summaries saved:", n);
