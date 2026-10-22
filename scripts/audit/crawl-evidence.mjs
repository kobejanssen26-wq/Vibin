#!/usr/bin/env node
/**
 * AUDIT FACT COLLECTION (read-only, polite).
 *
 * For every active activity with an official website: fetch the activity's own page and, when
 * needed, ONE contact page of the same site, and record what the site itself says: is it alive,
 * what name does it use, which postcodes/cities and e-mail addresses are printed on it, is
 * there a closure signal. Nothing is interpreted here and nothing touches the database; the
 * analysis stage compares this recorded text with the catalogue and decides.
 *
 * Polite: identifies itself, honours robots.txt, one request at a time per host, hard
 * timeouts, no obfuscation decoding (a site that hides its address chose not to be scraped),
 * resumable.
 *
 *   node scripts/audit/crawl-evidence.mjs <in.json> <out.jsonl> [--concurrency N] [--limit N]
 *
 * in.json: [{ id, site, title, city }]
 */
import fs from "node:fs";

const [IN, OUT] = process.argv.slice(2, 4);
const args = process.argv.slice(4);
const argVal = (k, d) => {
  const i = args.indexOf(k);
  return i >= 0 ? Number(args[i + 1]) : d;
};
const CONCURRENCY = argVal("--concurrency", 16);
const LIMIT = argVal("--limit", Infinity);
const UA = "VIBINBot/1.0 (+https://vibin.be; catalogue accuracy check, contact via vibin.be/contact)";
const PER_HOST_DELAY_MS = 1000;
const TIMEOUT = 15000;
const MAX_BYTES = 700_000;

const rows = JSON.parse(fs.readFileSync(IN, "utf8")).filter((r) => r.site);
const done = new Set();
if (fs.existsSync(OUT)) {
  for (const l of fs.readFileSync(OUT, "utf8").split("\n")) {
    try {
      done.add(JSON.parse(l).id);
    } catch {
      /* torn line: redo that row */
    }
  }
}
const todo = rows.filter((r) => !done.has(r.id)).slice(0, LIMIT);
console.log(`with website: ${rows.length}, done: ${done.size}, todo: ${todo.length}`);

const byHost = new Map();
for (const r of todo) {
  let host = "bad-url";
  try {
    host = new URL(/^https?:\/\//i.test(r.site) ? r.site : `https://${r.site}`).host.replace(/^www\./, "");
  } catch {
    /* handled per row */
  }
  (byHost.get(host) ?? byHost.set(host, []).get(host)).push(r);
}
const queue = [...byHost.entries()];
const out = fs.createWriteStream(OUT, { flags: "a" });

/* ------------------------------ fetch helpers ------------------------------ */
async function readLimited(res, max) {
  const reader = res.body.getReader();
  const chunks = [];
  let total = 0;
  while (total < max) {
    const { done: d, value } = await reader.read();
    if (d) break;
    chunks.push(value);
    total += value.length;
  }
  try {
    await reader.cancel();
  } catch {
    /* closed */
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c)));
}
function decode(buf, ct) {
  const m = /charset=([\w-]+)/i.exec(ct || "");
  const meta = /<meta[^>]+charset=["']?([\w-]+)/i.exec(buf.subarray(0, 2048).toString("latin1"));
  try {
    return new TextDecoder((m?.[1] || meta?.[1] || "utf-8").toLowerCase()).decode(buf);
  } catch {
    return buf.toString("utf8");
  }
}
const robotsCache = new Map();
async function robotsAllows(origin, pathname) {
  if (!robotsCache.has(origin)) {
    const rules = [];
    try {
      const res = await fetch(`${origin}/robots.txt`, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(6000) });
      if (res.ok) {
        const txt = (await readLimited(res, 60_000)).toString("utf8");
        let applies = false;
        let seen = false;
        for (const raw of txt.split(/\r?\n/)) {
          const m = /^(user-agent|disallow|allow)\s*:\s*(.*)$/i.exec(raw.replace(/#.*/, "").trim());
          if (!m) continue;
          const k = m[1].toLowerCase();
          const v = m[2].trim();
          if (k === "user-agent") {
            const us = v === "*" || /vibinbot/i.test(v);
            if (!seen || !applies) applies = us;
            seen = true;
          } else if (applies && v) rules.push({ allow: k === "allow", path: v });
        }
      }
    } catch {
      /* unreachable robots.txt: nothing forbids a single page fetch */
    }
    robotsCache.set(origin, rules);
  }
  let best = null;
  for (const r of robotsCache.get(origin)) {
    const pat = r.path.replace(/[.+?^{}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\$$/, "$");
    if (!new RegExp(`^${pat}`).test(pathname)) continue;
    if (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow)) best = r;
  }
  return !best || best.allow;
}
async function get(url) {
  const u = new URL(url);
  if (!(await robotsAllows(u.origin, u.pathname || "/"))) return { error: "robots-disallow" };
  const attempt = (x) =>
    fetch(x, { headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml", "accept-language": "nl,fr;q=0.8,en;q=0.6" }, redirect: "follow", signal: AbortSignal.timeout(TIMEOUT) });
  let res;
  try {
    res = await attempt(u);
  } catch (e) {
    const code = String(e?.cause?.code || e?.code || e?.name || "fetch-error");
    if (/CERT|SSL|TLS|SELF_SIGNED|UNABLE_TO_VERIFY/i.test(code) && u.protocol === "https:") {
      try {
        const h = new URL(u);
        h.protocol = "http:";
        res = await attempt(h);
      } catch (e2) {
        return { error: String(e2?.cause?.code || e2?.code || "fetch-error"), tls: true };
      }
    } else if (u.protocol === "http:") {
      try {
        const h = new URL(u);
        h.protocol = "https:";
        res = await attempt(h);
      } catch {
        return { error: code };
      }
    } else return { error: code };
  }
  if (!res.ok) return { error: `http-${res.status}`, status: res.status, finalUrl: res.url };
  const ct = res.headers.get("content-type") || "";
  if (!/html|xml/i.test(ct)) return { error: "not-html", status: res.status, finalUrl: res.url };
  return { status: res.status, finalUrl: res.url, html: decode(await readLimited(res, MAX_BYTES), ct) };
}

/* ------------------------------- extraction -------------------------------- */
const ent = (s) =>
  s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, " ").replace(/&commat;/gi, "@")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
const clean = (s) => ent(String(s ?? "")).replace(/\s+/g, " ").trim();
const visible = (html) =>
  clean(
    html
      .replace(/<(script|style|noscript|svg|template|head)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(br|\/p|\/div|\/li|\/h\d|\/tr)[^>]*>/gi, ". ")
      .replace(/<[^>]+>/g, " "),
  );
const JUNK = /(example\.|domain\.com|email\.com|yourdomain|sentry|wixpress|godaddy|w3\.org|schema\.org|mysite\.com|test\.com|\.(png|jpe?g|gif|webp|svg|css|js|woff2?)$)/i;
const SKIP_LOCAL = /^(noreply|no-reply|donotreply|do-not-reply|mailer-daemon|postmaster|webmaster|abuse|privacy|gdpr|dpo|unsubscribe)$/i;
function emailsOf(html) {
  const out = new Map();
  const add = (raw, via) => {
    const e = clean(raw).replace(/^mailto:/i, "").toLowerCase();
    if (!/^[a-z0-9._%+-]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(e) || JUNK.test(e)) return;
    if (SKIP_LOCAL.test(e.split("@")[0])) return;
    if (!out.has(e) || via === "mailto") out.set(e, via);
  };
  for (const m of html.matchAll(/href\s*=\s*["']\s*mailto:([^"'?#\s]+)/gi)) {
    let v = m[1];
    try {
      v = decodeURIComponent(v);
    } catch {
      /* keep */
    }
    v.split(",").forEach((p) => add(p, "mailto"));
  }
  for (const m of visible(html).matchAll(/[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g)) add(m[0], "text");
  return [...out].map(([email, via]) => ({ email, via }));
}
function jsonLdAddresses(html) {
  const found = [];
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(m[1].trim());
      const stack = Array.isArray(data) ? [...data] : [data];
      while (stack.length) {
        const n = stack.pop();
        if (!n || typeof n !== "object") continue;
        if (Array.isArray(n["@graph"])) stack.push(...n["@graph"]);
        const addr = n.address;
        if (addr && typeof addr === "object") {
          found.push({
            name: clean(n.name),
            street: clean(addr.streetAddress),
            postcode: clean(addr.postalCode),
            city: clean(addr.addressLocality),
            email: n.email ? clean(n.email).replace(/^mailto:/i, "").toLowerCase() : null,
            telephone: n.telephone ? clean(n.telephone) : null,
          });
        }
      }
    } catch {
      /* invalid JSON-LD is common */
    }
  }
  return found.slice(0, 4);
}
// Belgian postcode + place name, e.g. "9000 Gent", "1000 Brussel", "2018 Antwerpen".
function postcodes(text) {
  const out = new Map();
  for (const m of text.matchAll(/\b([1-9]\d{3})\s+([A-ZÀ-Ý][A-Za-zÀ-ÿ'’-]{2,}(?:[ -][A-ZÀ-Ý][A-Za-zÀ-ÿ'’-]+)?)/g)) {
    const pc = Number(m[1]);
    if (pc < 1000 || pc > 9992) continue;
    const k = `${m[1]} ${m[2]}`;
    out.set(k, (out.get(k) ?? 0) + 1);
  }
  return [...out].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k]) => k);
}
const PARKED =
  /site en construction|under construction|coming soon|binnenkort online|domain (is )?for sale|domein te koop|this domain|parked|default web(site)? page|index of \//i;
const CLOSED =
  /permanent(ly)? (gesloten|closed)|definitief gesloten|d[ée]finitivement ferm[ée]|(wij|we) (stoppen|zijn gestopt)|zaak (is )?(gestopt|overgenomen)|has (permanently )?closed|(nous|on) (fermons|a ferm[ée]) (d[ée]finitivement|nos portes)|ceased trading|gaan definitief dicht|faillissement|failliet|cessation d.activit/i;
const contactLinks = (html, base) => {
  const scored = new Map();
  for (const m of html.matchAll(/<a\b[^>]*?href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]{0,120}?)<\/a>/gi)) {
    const href = m[1].trim();
    if (/^(mailto|tel|javascript):/i.test(href)) continue;
    let u;
    try {
      u = new URL(href, base);
    } catch {
      continue;
    }
    if (!/^https?:$/.test(u.protocol) || u.host.replace(/^www\./, "") !== new URL(base).host.replace(/^www\./, "")) continue;
    if (/\.(pdf|jpe?g|png|gif|webp|zip|docx?|xlsx?)$/i.test(u.pathname)) continue;
    const label = `${u.pathname} ${m[2].replace(/<[^>]+>/g, " ")}`.toLowerCase();
    let sc = 0;
    if (/contact|kontakt|contacteer|contactez|neem[- ]contact/.test(label)) sc += 3;
    if (/over[- ]ons|about|a-propos|qui[- ]sommes|praktisch|info|colofon|impressum/.test(label)) sc += 1;
    if (!sc) continue;
    u.hash = "";
    scored.set(u.toString(), Math.max(scored.get(u.toString()) ?? 0, sc));
  }
  return [...scored].sort((a, b) => b[1] - a[1]).map(([u]) => u);
};

const contactCache = new Map(); // host -> {emails, postcodes, jsonld, url}

async function crawlOne(r) {
  const rec = { id: r.id, site: r.site, at: Math.floor(Date.now() / 1000) };
  let url;
  try {
    url = new URL(/^https?:\/\//i.test(r.site) ? r.site : `https://${r.site}`);
  } catch {
    return { ...rec, ok: false, error: "bad-url" };
  }
  const g = await get(url);
  if (!g.html) return { ...rec, ok: false, error: g.error, status: g.status ?? null, finalUrl: g.finalUrl ?? null, tls: !!g.tls };
  const html = g.html;
  const text = visible(html);
  const title = clean(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "").slice(0, 200);
  const h = [...html.matchAll(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/gi)].map((m) => clean(m[1].replace(/<[^>]+>/g, " "))).filter((t) => t && t.length < 140).slice(0, 8);
  const metaDesc = clean(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i.exec(html)?.[1] ?? "").slice(0, 400);
  let emails = emailsOf(html).map((e) => ({ ...e, page: g.finalUrl }));
  const jsonld = jsonLdAddresses(html);
  let pcs = postcodes(text);
  // one contact page per host when the activity page shows no address yet
  let contactUrl = null;
  const host = url.host.replace(/^www\./, "");
  if (!contactCache.has(host)) {
    const links = contactLinks(html, g.finalUrl).slice(0, 1);
    let entry = { emails: [], postcodes: [], jsonld: [], url: null };
    for (const l of links) {
      await new Promise((res) => setTimeout(res, 600));
      const c = await get(l);
      if (c.html) entry = { emails: emailsOf(c.html).map((e) => ({ ...e, page: c.finalUrl })), postcodes: postcodes(visible(c.html)), jsonld: jsonLdAddresses(c.html), url: c.finalUrl, text: visible(c.html).slice(0, 1200) };
    }
    contactCache.set(host, entry);
  }
  const ce = contactCache.get(host);
  if (ce.url) {
    contactUrl = ce.url;
    const seen = new Set(emails.map((e) => e.email));
    for (const e of ce.emails) if (!seen.has(e.email)) emails.push(e);
    pcs = [...new Set([...pcs, ...ce.postcodes])].slice(0, 14);
  }
  return {
    ...rec,
    ok: true,
    status: g.status,
    finalUrl: g.finalUrl,
    contactUrl,
    title,
    metaDescription: metaDesc || null,
    headings: h,
    textLength: text.length,
    text: text.slice(0, 2500),
    contactText: ce.text ?? null,
    emails: emails.slice(0, 12),
    jsonld: [...jsonld, ...(ce.jsonld ?? [])].slice(0, 6),
    postcodes: pcs,
    parked: PARKED.test(`${title} ${text.slice(0, 2500)}`) && text.length < 1500,
    closedSignal: CLOSED.exec(`${title} ${text.slice(0, 4000)}`)?.[0] ?? null,
  };
}

let finished = 0;
async function worker() {
  while (queue.length) {
    const [, list] = queue.shift();
    for (const r of list) {
      let result;
      try {
        result = await crawlOne(r);
      } catch (e) {
        result = { id: r.id, site: r.site, ok: false, error: `crash:${String(e?.message || e).slice(0, 80)}` };
      }
      out.write(JSON.stringify(result) + "\n");
      if (++finished % 100 === 0) console.log(`crawled ${finished}/${todo.length}`);
      if (list.length > 1) await new Promise((res) => setTimeout(res, PER_HOST_DELAY_MS));
    }
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
out.end();
console.log(`done: ${finished}`);
