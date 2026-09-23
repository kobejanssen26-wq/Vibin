#!/usr/bin/env node
/**
 * EXPANSION stage 1. Merge the region agents' discovery files, drop duplicates
 * (against the live catalogue AND each other) and ordinary eateries, and write
 * the survivors as pseudo-activity rows so the normal enrichment pipeline
 * (crawl -> analyze -> prepare -> write -> validate -> images) can run on them
 * in an isolated workspace, unchanged.
 *
 *   node scripts/expansion/build-candidates.mjs
 *
 * Input : data/expansion/candidates/*.json          (agents' verified candidates)
 *         data/enrichment/prod-activities.json      (fresh export — ids/titles/sites)
 * Output: data/expansion/run/data/enrichment/prod-activities.json   (pseudo rows)
 *         data/expansion/run/candidates.json         (id -> full candidate)
 *         data/expansion/build-report.json           (what was dropped and why)
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const CAND_DIR = path.join(ROOT, "data/expansion/candidates");
const RUN = path.join(ROOT, "data/expansion/run");

const prod = JSON.parse(fs.readFileSync(path.join(ROOT, "data/enrichment/prod-activities.json"), "utf8"))[0].results;
const CATEGORIES = new Set(["sport", "adventure", "food_drinks", "nightlife", "creative", "relaxation", "culture", "nature", "gaming", "entertainment", "learning", "other"]);

const strip = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const norm = (s) => strip(s).replace(/[^a-z0-9]+/g, "");
const slug = (s) => strip(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const domainOf = (u) => {
  try {
    return new URL(u).host.replace(/^www\./, "");
  } catch {
    return null;
  }
};

const existingDomains = new Set(prod.filter((r) => r.status !== "inactive").map((r) => domainOf(r.site)).filter(Boolean));
const existingNameCity = new Set(prod.filter((r) => r.status !== "inactive").map((r) => `${norm(r.title)}|${norm(r.city)}`));
const existingIds = new Set(prod.map((r) => r.id));

// An ordinary eatery/bar is not an activity. Distinctive concepts stay.
const EATERY = /\b(restaurant|brasserie|caf[eé]|bistro|bistrot|pizzeria|trattoria|snack(bar)?|frituur|friterie|tearoom|tea room|lunchroom|sandwich|bakery|bakkerij|boulangerie|caf[eé]-?bar|cocktailbar|wijnbar|pub|taverne|estaminet|kroeg)\b/i;
const CONCEPT = /(immersive|theatre|theater|dinner show|murder|mystery|cook|workshop|class|tasting|proeverij|degustation|tour|visit|brewery|brouwerij|brasserie de|distiller|robot|escape|themed|thema|game|quiz|karaoke|boat|cruise|farm|museum|chocolate|chocolaterie|cheese|fromagerie|jenever|vineyard|wijngaard|winery)/i;
const NOT_ACTIVITY = /\b(hotel|b&b|bed and breakfast|gastenkamer|camping|apartment|vakantiewoning|gîte|gite|kapper|coiffeur|fitness|gym|supermarkt|winkel|shop|school)\b/i;

const report = { read: 0, duplicates: [], eatery: [], notActivity: [], invalid: [], kept: 0 };
const seenDomain = new Set();
const seenNameCity = new Set();
const rows = [];
const cands = {};

const files = fs.existsSync(CAND_DIR) ? fs.readdirSync(CAND_DIR).filter((f) => f.endsWith(".json")) : [];
for (const f of files) {
  let list;
  try {
    list = JSON.parse(fs.readFileSync(path.join(CAND_DIR, f), "utf8").replace(/^﻿/, ""));
  } catch (e) {
    report.invalid.push({ file: f, reason: "unparseable json" });
    continue;
  }
  for (const c of list) {
    report.read++;
    const label = `${c.name} (${c.city}) [${f}]`;
    if (!c.name || !c.city || !c.websiteUrl || !CATEGORIES.has(c.categoryId) || !/^https?:\/\//i.test(c.websiteUrl) || !c.evidence) {
      report.invalid.push({ label, reason: "missing/invalid field" });
      continue;
    }
    const dom = domainOf(c.websiteUrl);
    const nc = `${norm(c.name)}|${norm(c.city)}`;
    if ((dom && existingDomains.has(dom)) || existingNameCity.has(nc)) {
      report.duplicates.push({ label, reason: "already in catalogue" });
      continue;
    }
    if ((dom && seenDomain.has(dom)) || seenNameCity.has(nc)) {
      report.duplicates.push({ label, reason: "duplicate among candidates" });
      continue;
    }
    const hay = `${c.name} ${c.subcategory ?? ""}`;
    if (NOT_ACTIVITY.test(hay) && !CONCEPT.test(hay)) {
      report.notActivity.push({ label });
      continue;
    }
    if (EATERY.test(hay) && !CONCEPT.test(hay)) {
      report.eatery.push({ label });
      continue;
    }
    if (dom) seenDomain.add(dom);
    seenNameCity.add(nc);

    let id = `act_${slug(c.name)}-${slug(c.city)}`.slice(0, 90);
    for (let i = 2; existingIds.has(id) || cands[id]; i++) id = `${id.replace(/-\d+$/, "")}-${i}`;
    cands[id] = { ...c, id, sourceFile: f };
    rows.push({
      id,
      title: c.name,
      subcategory: c.subcategory ?? null,
      category_id: c.categoryId,
      city: c.city,
      description: "",
      tags: "[]",
      needs_review_fields: "[]",
      site: c.websiteUrl,
      image_url: null,
      image_source: null,
      image_is_generic: 1,
      opening_hours: "{}",
      status: "needs_review",
      active: 1,
      enriched: 0,
      source: "web",
    });
  }
}
report.kept = rows.length;

fs.mkdirSync(path.join(RUN, "data/enrichment/batches"), { recursive: true });
fs.mkdirSync(path.join(RUN, "data/enrichment/out"), { recursive: true });
fs.writeFileSync(path.join(RUN, "data/enrichment/prod-activities.json"), JSON.stringify([{ results: rows }]));
fs.writeFileSync(path.join(RUN, "candidates.json"), JSON.stringify(cands, null, 1));
fs.writeFileSync(path.join(ROOT, "data/expansion/build-report.json"), JSON.stringify(report, null, 1));
console.log(
  `read ${report.read} | kept ${report.kept} | duplicates ${report.duplicates.length} | eatery ${report.eatery.length} | not-activity ${report.notActivity.length} | invalid ${report.invalid.length}`,
);
