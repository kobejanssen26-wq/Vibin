#!/usr/bin/env node
/**
 * Validates what the research agents returned BEFORE anything is stored.
 *
 *   node scripts/audit/validate-research.mjs <inputs_dir> <out_dir> <validated_dir> [--no-fetch]
 *
 * inputs_dir    batch-XXX.in.json  (what each agent was given; defines the allowed ids/contacts)
 * out_dir       batch-XXX.json     (what the agent wrote)
 * validated_dir batch-XXX.json     (decisions that passed the checks; claims that did not are downgraded)
 *
 * Rules enforced here (an agent can be wrong or invent things):
 *  - every input activity has exactly one result; unknown ids are dropped; missing ones become `manual`
 *  - enums are valid; a `verified` claim needs a source URL AND a quote;
 *  - the quote must really occur on the source page (fetched here, normalised, shingle match);
 *    otherwise the claim is downgraded to `likely` with a note;
 *  - `approved` needs confirmed existence + at least one verified claim, else it becomes `manual`;
 *  - `closed` needs existence=closed + a verified source; `duplicate` needs a duplicateOf that is
 *    one of the ids of the same batch/cluster; corrections are only kept when verified.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const [INDIR, OUTDIR, VALDIR] = process.argv.slice(2, 5);
const NOFETCH = process.argv.includes("--no-fetch");
fs.mkdirSync(VALDIR, { recursive: true });
const UA = "VIBINBot/1.0 (+https://vibin.be; catalogue accuracy check, contact via vibin.be/contact)";

const VERDICTS = ["approved", "fix_data", "manual", "exclude", "duplicate", "closed"];
const EXIST = ["confirmed", "unconfirmed", "closed", "unknown"];
const SUIT = ["fit", "not_fit", "unclear"];
const EV_STATUS = ["verified", "likely", "unverified", "conflict", "not_found", "invalid"];
const EV_FIELDS = ["name", "address", "postcode", "city", "website", "offering", "price", "opening", "organisation", "existence"];
const CORR_FIELDS = ["address", "postcode", "city", "website_url", "title", "provider"];
const C_STATUS = ["VERIFIED", "LIKELY", "UNVERIFIED", "INVALID", "NOT_FOUND", "CONFLICT"];
const SCOPES = ["activity", "location", "organisation"];
const KINDS = ["official", "organisation", "register", "external"];

/* ------------------------------- page text cache ------------------------------ */
const norm = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " en ")
    .replace(/[^a-z0-9@.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
/* Pages that only show their text after JavaScript runs are rendered with Chromium (shared, lazy). */
let browser = null;
async function renderedText(url) {
  try {
    if (!browser) {
      const { chromium } = createRequire(import.meta.url)("playwright");
      browser = await chromium.launch({ executablePath: fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined });
    }
    const ctx = await browser.newContext({ userAgent: UA, locale: "nl-BE" });
    const pg = await ctx.newPage();
    await pg.goto(url, { waitUntil: "networkidle", timeout: 25000 }).catch(() => {});
    const t = await pg.evaluate(() => document.body?.innerText ?? "").catch(() => "");
    const hrefs = await pg.evaluate(() => [...document.querySelectorAll('a[href^="mailto:"]')].map((a) => a.getAttribute("href"))).catch(() => []);
    await ctx.close();
    return `${t} ${hrefs.join(" ")}`;
  } catch {
    return null;
  }
}
const pageCache = new Map();
const lastHit = new Map();
async function pageText(url) {
  if (pageCache.has(url)) return pageCache.get(url);
  let text = null;
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) throw new Error("scheme");
    const wait = (lastHit.get(u.host) ?? 0) + 800 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastHit.set(u.host, Date.now());
    const res = await fetch(u, { headers: { "user-agent": UA, accept: "text/html,*/*", "accept-language": "nl,fr;q=0.8,en;q=0.6" }, redirect: "follow", signal: AbortSignal.timeout(15000) });
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer()).subarray(0, 1_500_000);
      const html = buf.toString("utf8");
      text = norm(
        html
          .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, " ")
          .replace(/<!--[\s\S]*?-->/g, " ")
          .replace(/<[^>]+>/g, " ")
          .replace(/&nbsp;|&#160;/g, " ")
          .replace(/&amp;/g, "&")
          .replace(/&#0?39;|&apos;|&rsquo;/g, "'"),
      );
      // mailto: targets are not visible text but are what a visitor sees as the address
      const mails = [...html.matchAll(/mailto:([^"'?#\s>]+)/gi)].map((m) => norm(decodeURIComponent(m[1])));
      text += " " + mails.join(" ");
      if (text.length < 400) {
        const r = await renderedText(url);
        if (r && norm(r).length > text.length) text = norm(r);
      }
    }
  } catch {
    text = null;
  }
  pageCache.set(url, text);
  return text;
}
/** true | false | null (page not readable here: cannot be machine-checked) */
async function quoteOnPage(url, quote) {
  const q = norm(quote);
  if (q.split(" ").length < 2 || q.length < 8) return false;
  if (NOFETCH) return null;
  const page = await pageText(url);
  if (page != null && page.length < 40) return null; // nothing readable even when rendered: cannot be machine-checked
  if (process.env.DEBUG_QUOTES) console.error(`[quote] ${url} pageLen=${page == null ? "null" : page.length} q="${q.slice(0, 90)}"`);
  if (page == null) return null;
  if (page.includes(q)) return true;
  const w = q.split(" ");
  if (w.length < 5) return false;
  let hit = 0;
  let tot = 0;
  for (let i = 0; i + 3 <= w.length; i++) {
    tot++;
    if (page.includes(w.slice(i, i + 3).join(" "))) hit++;
  }
  return tot > 0 && hit / tot >= 0.85;
}

const isUrl = (u) => {
  try {
    return /^https?:$/.test(new URL(u).protocol);
  } catch {
    return false;
  }
};
const str = (v, n = 500) => String(v ?? "").slice(0, n);

/* ---------------------------------- validate ---------------------------------- */
const report = { batches: 0, activities: 0, downgraded_claims: 0, unreadable_sources: 0, verdict_downgrades: 0, missing: 0, quote_ok: 0, quote_bad: 0 };
const files = fs.readdirSync(INDIR).filter((f) => f.endsWith(".in.json")).sort();
for (const f of files) {
  const name = f.replace(/\.in\.json$/, "");
  const input = JSON.parse(fs.readFileSync(path.join(INDIR, f), "utf8"));
  const outFile = path.join(OUTDIR, `${name}.json`);
  if (!fs.existsSync(outFile)) continue;
  let out;
  try {
    out = JSON.parse(fs.readFileSync(outFile, "utf8"));
  } catch {
    console.error(`${name}: output is not valid JSON, skipped`);
    continue;
  }
  report.batches++;
  const known = new Map(input.activities.map((a) => [a.id, a]));
  // duplicates may point at a sibling that was given as context (same site / same place), not only at batch members
  const dupTargets = new Set([...known.keys(), ...input.activities.flatMap((a) => (a.siblings_same_site_or_place ?? []).map((x) => x.id))]);
  const byId = new Map();
  for (const r of out.results ?? []) if (known.has(r?.id) && !byId.has(r.id)) byId.set(r.id, r);
  const final = [];
  for (const a of input.activities) {
    report.activities++;
    const r = byId.get(a.id);
    if (!r) {
      report.missing++;
      final.push({ id: a.id, verdict: "manual", existence: "unknown", suitability: "unclear", duplicateOf: null, note: "Niet onderzocht door de agent: handmatig of opnieuw onderzoeken.", sources: [], evidence: [], corrections: [], contacts: [], validation: ["missing_result"] });
      continue;
    }
    const v = [];
    const res = {
      id: a.id,
      verdict: VERDICTS.includes(r.verdict) ? r.verdict : "manual",
      existence: EXIST.includes(r.existence) ? r.existence : "unknown",
      suitability: SUIT.includes(r.suitability) ? r.suitability : "unclear",
      duplicateOf: r.duplicateOf && dupTargets.has(r.duplicateOf) && r.duplicateOf !== a.id ? r.duplicateOf : null,
      note: str(r.note, 400),
      sources: [],
      evidence: [],
      corrections: [],
      contacts: [],
    };
    if (!VERDICTS.includes(r.verdict)) v.push("bad_verdict");
    for (const s of Array.isArray(r.sources) ? r.sources : []) {
      if (isUrl(s?.url)) res.sources.push({ url: str(s.url, 400), kind: KINDS.includes(s.kind) ? s.kind : "external", checkedAt: str(s.checkedAt, 10) });
    }
    // evidence
    let anyVerified = false;
    for (const e of Array.isArray(r.evidence) ? r.evidence : []) {
      if (!EV_FIELDS.includes(e?.field)) continue;
      const item = { field: e.field, found: str(e.found, 300), verified: str(e.verified, 300), status: EV_STATUS.includes(e.status) ? e.status : "unverified", sourceUrl: isUrl(e.sourceUrl) ? str(e.sourceUrl, 400) : "", quote: str(e.quote, 300), note: str(e.note, 300), machineChecked: false };
      if (item.status === "verified") {
        if (!item.sourceUrl || !item.quote) {
          item.status = "likely";
          item.note = (item.note + " [geen bron/citaat: verlaagd]").trim();
          report.downgraded_claims++;
        } else {
          const ok = await quoteOnPage(item.sourceUrl, item.quote);
          if (ok === true) {
            item.machineChecked = true;
            report.quote_ok++;
          } else if (ok === false) {
            item.status = "likely";
            item.note = (item.note + " [citaat niet teruggevonden op de bron: verlaagd]").trim();
            report.downgraded_claims++;
            report.quote_bad++;
          } else {
            item.status = "likely";
            item.note = (item.note + " [bron niet leesbaar voor automatische controle: verlaagd]").trim();
            report.unreadable_sources++;
          }
        }
      }
      if (item.status === "verified") anyVerified = true;
      res.evidence.push(item);
    }
    // corrections: only with a machine-checked quote
    for (const c of Array.isArray(r.corrections) ? r.corrections : []) {
      if (!CORR_FIELDS.includes(c?.field) || !c.to) continue;
      const item = { field: c.field, from: str(c.from, 300), to: str(c.to, 300), sourceUrl: isUrl(c.sourceUrl) ? str(c.sourceUrl, 400) : "", quote: str(c.quote, 300), confidence: c.confidence === "high" ? "high" : "low", verified: false };
      if (item.sourceUrl && item.quote) item.verified = (await quoteOnPage(item.sourceUrl, item.quote)) === true;
      if (!item.verified) item.confidence = "low";
      res.corrections.push(item);
    }
    // contacts
    const knownContacts = new Map((a.contacts ?? []).map((c) => [c.id, c]));
    for (const c of Array.isArray(r.contacts) ? r.contacts : []) {
      const kc = knownContacts.get(c?.contactId);
      if (!kc) continue;
      const item = { contactId: kc.id, email: kc.email, status: C_STATUS.includes(c.status) ? c.status : "UNVERIFIED", scope: SCOPES.includes(c.scope) ? c.scope : "organisation", sourceUrl: isUrl(c.sourceUrl) ? str(c.sourceUrl, 400) : "", quote: str(c.quote, 300), note: str(c.note, 300) };
      if (item.status === "VERIFIED") {
        const ok = item.sourceUrl && item.quote && norm(item.quote).includes(norm(kc.email)) ? await quoteOnPage(item.sourceUrl, item.quote) : false;
        if (ok !== true) {
          item.status = "LIKELY";
          item.note = (item.note + " [adres/citaat niet automatisch bevestigd op de bron: verlaagd]").trim();
          report.downgraded_claims++;
        }
      }
      res.contacts.push(item);
    }
    // consistency of the verdict
    const verifiedSource = res.evidence.some((e) => e.status === "verified" && e.sourceUrl);
    if (res.verdict === "approved" && !(res.existence === "confirmed" && res.suitability === "fit" && anyVerified)) {
      v.push("approved_without_proof");
      res.verdict = "manual";
      res.note = `${res.note} [automatisch teruggezet naar handmatig: onvoldoende bewezen]`.trim();
      report.verdict_downgrades++;
    }
    if (res.verdict === "closed" && !(res.existence === "closed" && verifiedSource)) {
      v.push("closed_without_proof");
      res.verdict = "manual";
      res.note = `${res.note} [sluiting niet bewezen: handmatig]`.trim();
      report.verdict_downgrades++;
    }
    if (res.verdict === "duplicate" && !res.duplicateOf) {
      v.push("duplicate_without_target");
      res.verdict = "manual";
      report.verdict_downgrades++;
    }
    if (res.verdict === "exclude" && !res.note) {
      v.push("exclude_without_reason");
      res.verdict = "manual";
      report.verdict_downgrades++;
    }
    res.validation = v;
    final.push(res);
  }
  fs.writeFileSync(path.join(VALDIR, `${name}.json`), JSON.stringify({ batch: name, runAt: input.runAt ?? null, results: final }));
  console.log(`${name}: ${final.length} results`);
}
if (browser) await browser.close();
console.log(JSON.stringify(report));
fs.writeFileSync(path.join(VALDIR, "_report.json"), JSON.stringify(report, null, 1));
