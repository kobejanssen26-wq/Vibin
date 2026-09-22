#!/usr/bin/env node
/**
 * FACT COLLECTION, second pass. For venues whose homepage said nothing usable
 * (no meta description, thin text), read the pages a visitor would use to learn
 * what the place is: "about us", menu / activities, prices, practical info.
 *
 * Same politeness rules as crawl.mjs (robots.txt, one request at a time per
 * host, own user-agent, hard timeouts, resumable). Records text only.
 *
 *   node scripts/enrich/crawl2.mjs [--limit N] [--concurrency N]
 * Input : data/enrichment/crawl2-targets.json  [{id, site}]
 * Output: data/enrichment/crawl2.jsonl         one object per venue: {id, pages:[...]}
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const IN = path.join(ROOT, "data/enrichment/crawl2-targets.json");
const OUT = path.join(ROOT, "data/enrichment/crawl2.jsonl");
const UA = "VIBINBot/1.0 (+https://vibin.be; venue-info check, contact via vibin.be/contact)";
const args = process.argv.slice(2);
const argVal = (k, d) => (args.includes(k) ? Number(args[args.indexOf(k) + 1]) : d);
const LIMIT = argVal("--limit", Infinity);
const CONCURRENCY = argVal("--concurrency", 12);
const DELAY = 1200;
const MAX_PAGES = 3;

const targets = JSON.parse(fs.readFileSync(IN, "utf8"));
const done = new Set();
if (fs.existsSync(OUT))
  for (const l of fs.readFileSync(OUT, "utf8").split("\n"))
    try {
      done.add(JSON.parse(l).id);
    } catch {
      /* torn line */
    }
const todo = targets.filter((t) => !done.has(t.id)).slice(0, LIMIT);
console.log(`targets ${targets.length}, done ${done.size}, todo ${todo.length}`);

const decode = (s) =>
  s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
const clean = (s) => decode(String(s ?? "")).replace(/\s+/g, " ").trim();
const visibleText = (html) =>
  clean(
    html
      .replace(/<(script|style|noscript|svg|template|head|nav|footer|form|iframe)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(br|\/p|\/div|\/li|\/h\d|\/tr)[^>]*>/gi, ". ")
      .replace(/<[^>]+>/g, " "),
  );
const metaContent = (html, key) => {
  const tag = new RegExp(`<meta[^>]+(?:name|property)=["']${key}["'][^>]*>|<meta[^>]+content=[^>]*(?:name|property)=["']${key}["'][^>]*>`, "i").exec(html)?.[0];
  const c = tag && /content=("([^"]*)"|'([^']*)')/i.exec(tag);
  return c ? clean(c[2] ?? c[3]) : null;
};

// which internal links are worth reading, best first
const KINDS = [
  ["about", /over[-_ ]?ons|about|a[-_ ]?propos|qui[-_ ]?sommes|notre[-_ ]?(histoire|concept)|onze[-_ ]?(zaak|geschiedenis|verhaal)|wie[-_ ]?zijn[-_ ]?we|het[-_ ]?huis|concept|history|geschiedenis|histoire/i],
  ["activities", /activit|ontdek|discover|d[eé]couvr|aanbod|offre|formul|spelen|jouer|attractie|attraction|beleef|expo|collection|collectie|programm?a|programme|bezoek|visite|visit/i],
  ["menu", /menu|kaart|carte|speisekarte|dranken|boissons|food/i],
  ["prices", /prijs|prijzen|tarief|tarieven|tarif|prix|entr[eé]e|toegang|ticket|billet|pricing|price/i],
  ["info", /praktisch|pratique|practical|info|openings|horaires|contact/i],
];
const BLOCKED_HREF = /\.(pdf|jpg|jpeg|png|gif|webp|zip|docx?)($|\?)|^(mailto|tel|javascript):|#|wp-login|cart|winkelwagen|panier|login|account|privacy|cookie|gdpr|terms|voorwaarden|conditions|facebook|instagram|twitter|linkedin/i;

function pickLinks(html, base) {
  const host = new URL(base).host.replace(/^www\./, "");
  const found = new Map();
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"'#][^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    let u;
    try {
      u = new URL(m[1], base);
    } catch {
      continue;
    }
    if (!/^https?:$/.test(u.protocol) || u.host.replace(/^www\./, "") !== host) continue;
    if (BLOCKED_HREF.test(u.pathname + u.search)) continue;
    if (u.pathname === "/" || u.pathname === new URL(base).pathname) continue;
    const label = clean(m[2].replace(/<[^>]+>/g, " ")).slice(0, 60);
    const hay = `${u.pathname} ${label}`;
    for (const [i, [kind, re]] of KINDS.entries()) {
      if (re.test(hay)) {
        const key = u.origin + u.pathname;
        if (!found.has(key) || found.get(key).rank > i) found.set(key, { url: u.toString(), kind, rank: i });
        break;
      }
    }
  }
  const byKind = new Map();
  for (const l of [...found.values()].sort((a, b) => a.rank - b.rank)) if (!byKind.has(l.kind)) byKind.set(l.kind, l);
  return [...byKind.values()].slice(0, MAX_PAGES);
}

// € amounts with their surrounding words: the only price evidence the writer may use
function priceSnippets(text) {
  const out = [];
  for (const m of text.matchAll(/(?:€\s?\d+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?\s?(?:€|eur\b|euro\b))/gi)) {
    const s = text.slice(Math.max(0, m.index - 70), m.index + 60);
    if (!out.some((o) => o.slice(30, 60) === s.slice(30, 60))) out.push(s);
    if (out.length >= 8) break;
  }
  return out;
}

const HOURS_RE = /(openingsuren|openingstijden|opening hours|opening times|horaires d.ouverture|horaires|heures d.ouverture|open van|geopend)/gi;
const TIME_RE = /\b\d{1,2}\s?[:hu.]\s?\d{2}\b|\b\d{1,2}\s?(?:u|h|am|pm)\b/gi;
const DAY_RE = /\b(ma|di|wo|do|vr|za|zo|maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag|mon|tue|wed|thu|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday|lun|mar|mer|jeu|ven|sam|dim|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\b/gi;
function hoursSnippets(text) {
  const c = [];
  let m;
  while ((m = HOURS_RE.exec(text))) {
    const win = text.slice(Math.max(0, m.index - 20), m.index + 400);
    const score = (win.match(TIME_RE)?.length ?? 0) * 2 + (win.match(DAY_RE)?.length ?? 0);
    if (score >= 6) c.push({ win, score });
    if (c.length > 10) break;
  }
  c.sort((a, b) => b.score - a.score);
  return c.slice(0, 2).map((x) => x.win);
}

const robots = new Map();
async function allowed(u) {
  const url = new URL(u);
  if (!robots.has(url.origin)) {
    const rules = [];
    try {
      const r = await fetch(`${url.origin}/robots.txt`, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(6000) });
      if (r.ok) {
        let applies = false, matched = false;
        for (const raw of (await r.text()).split(/\r?\n/)) {
          const m = /^(user-agent|disallow|allow)\s*:\s*(.*)$/i.exec(raw.replace(/#.*/, "").trim());
          if (!m) continue;
          const k = m[1].toLowerCase(), v = m[2].trim();
          if (k === "user-agent") {
            const us = v === "*" || /vibinbot/i.test(v);
            if (!matched) applies = us; else if (!applies) applies = us;
            matched = true;
          } else if (applies && v) rules.push({ allow: k === "allow", path: v });
        }
      }
    } catch { /* unreachable robots = nothing forbids */ }
    robots.set(url.origin, rules);
  }
  let best = null;
  for (const r of robots.get(url.origin)) {
    const re = new RegExp("^" + r.path.replace(/[.+?^{}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*"));
    if (!re.test(url.pathname)) continue;
    if (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow)) best = r;
  }
  return !best || best.allow;
}

async function get(u) {
  if (!(await allowed(u))) return null;
  const res = await fetch(u, { headers: { "user-agent": UA, accept: "text/html", "accept-language": "en,nl;q=0.8,fr;q=0.6" }, redirect: "follow", signal: AbortSignal.timeout(15000) });
  if (!res.ok || !/html/i.test(res.headers.get("content-type") || "")) return null;
  const buf = Buffer.from(await res.arrayBuffer()).subarray(0, 600_000);
  return { html: buf.toString("utf8"), url: res.url };
}

async function one(t) {
  const rec = { id: t.id, at: Math.floor(Date.now() / 1000), pages: [] };
  let home;
  try {
    home = await get(t.site);
  } catch (e) {
    return { ...rec, error: String(e?.cause?.code || e?.name || "fetch") };
  }
  if (!home) return { ...rec, error: "no-home" };
  for (const l of pickLinks(home.html, home.url)) {
    await new Promise((r) => setTimeout(r, DELAY));
    try {
      const p = await get(l.url);
      if (!p) continue;
      const text = visibleText(p.html);
      if (text.length < 120) continue;
      const title = clean(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(p.html)?.[1] ?? "").slice(0, 160);
      const headings = [...p.html.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)].map((m) => clean(m[1].replace(/<[^>]+>/g, " "))).filter((h) => h && h.length < 140).slice(0, 10);
      rec.pages.push({
        url: p.url, kind: l.kind, title,
        meta: metaContent(p.html, "description")?.slice(0, 500) ?? null,
        headings, text: text.slice(0, 1600),
        price: priceSnippets(text), hours: hoursSnippets(text),
      });
    } catch { /* skip this page */ }
  }
  return rec;
}

// one request at a time per host
const byHost = new Map();
for (const t of todo) {
  let h = "bad";
  try { h = new URL(t.site).host.replace(/^www\./, ""); } catch { /* bad */ }
  (byHost.get(h) || byHost.set(h, []).get(h)).push(t);
}
const queue = [...byHost.values()];
const out = fs.createWriteStream(OUT, { flags: "a" });
let n = 0;
async function worker() {
  while (queue.length) {
    for (const t of queue.shift()) {
      let r;
      try { r = await one(t); } catch (e) { r = { id: t.id, pages: [], error: "crash" }; }
      out.write(JSON.stringify(r) + "\n");
      if (++n % 100 === 0) console.log(`crawled ${n}/${todo.length}`);
    }
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
out.end();
console.log(`done ${n}`);
