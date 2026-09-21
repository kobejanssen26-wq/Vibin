#!/usr/bin/env node
/**
 * FACT COLLECTION stage of the activity-enrichment pipeline.
 *
 * For every active activity that has an official website, fetch the homepage
 * once and record what is actually on it: is the site alive, what does it say
 * about itself (title / meta / Open Graph / schema.org JSON-LD / visible text),
 * and any opening hours, cuisine or price range it publishes in structured
 * form. Nothing here writes to the database and nothing is interpreted — the
 * later stages (write / validate / apply) work only from this recorded text.
 *
 * Polite by construction: identifies itself, honours robots.txt, one request
 * at a time per host, low global concurrency, hard timeouts, resumable.
 *
 *   node scripts/enrich/crawl.mjs [--limit N] [--concurrency N]
 *
 * Input : data/enrichment/prod-activities.json  (export of active rows)
 * Output: data/enrichment/crawl.jsonl           (one JSON object per activity)
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const IN = path.join(ROOT, "data/enrichment/prod-activities.json");
const OUT = path.join(ROOT, "data/enrichment/crawl.jsonl");
const UA = "VIBINBot/1.0 (+https://vibin.be; venue-info check, contact via vibin.be/contact)";

const args = process.argv.slice(2);
const argVal = (k, d) => {
  const i = args.indexOf(k);
  return i >= 0 ? Number(args[i + 1]) : d;
};
const LIMIT = argVal("--limit", Infinity);
const CONCURRENCY = argVal("--concurrency", 14);
const PER_HOST_DELAY_MS = 1200;
const FETCH_TIMEOUT_MS = 15000;
const MAX_BYTES = 600_000;

const rows = JSON.parse(fs.readFileSync(IN, "utf8"))[0].results.filter((r) => r.site);
const done = new Set();
if (fs.existsSync(OUT)) {
  for (const line of fs.readFileSync(OUT, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      done.add(JSON.parse(line).id);
    } catch {
      /* torn last line from an interrupted run — that row just gets redone */
    }
  }
}
const todo = rows.filter((r) => !done.has(r.id)).slice(0, LIMIT);
console.log(`activities with a website: ${rows.length}, already crawled: ${done.size}, to do: ${todo.length}`);

// ---- host queues (one request at a time per host) -------------------------
const byHost = new Map();
for (const r of todo) {
  let host = "bad-url";
  try {
    host = new URL(r.site).host.replace(/^www\./, "");
  } catch {
    /* handled per-row below */
  }
  if (!byHost.has(host)) byHost.set(host, []);
  byHost.get(host).push(r);
}
const hostQueue = [...byHost.entries()];

const out = fs.createWriteStream(OUT, { flags: "a" });
let finished = 0;
const robotsCache = new Map();

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
    /* already closed */
  }
  const buf = Buffer.concat(chunks.map((c) => Buffer.from(c)));
  return buf;
}

function decode(buf, contentType) {
  const m = /charset=([\w-]+)/i.exec(contentType || "");
  const head = buf.subarray(0, 2048).toString("latin1");
  const meta = /<meta[^>]+charset=["']?([\w-]+)/i.exec(head);
  const cs = (m?.[1] || meta?.[1] || "utf-8").toLowerCase();
  try {
    return new TextDecoder(cs).decode(buf);
  } catch {
    return buf.toString("utf8");
  }
}

async function robotsAllows(origin, pathname) {
  if (!robotsCache.has(origin)) {
    let rules = [];
    try {
      const res = await fetch(`${origin}/robots.txt`, {
        headers: { "user-agent": UA },
        signal: AbortSignal.timeout(6000),
        redirect: "follow",
      });
      if (res.ok && /text\/plain|octet/i.test(res.headers.get("content-type") || "text/plain")) {
        const txt = (await readLimited(res, 60_000)).toString("utf8");
        let applies = false;
        let matched = false;
        for (const raw of txt.split(/\r?\n/)) {
          const line = raw.replace(/#.*/, "").trim();
          const m = /^(user-agent|disallow|allow)\s*:\s*(.*)$/i.exec(line);
          if (!m) continue;
          const k = m[1].toLowerCase();
          const v = m[2].trim();
          if (k === "user-agent") {
            const isUs = v === "*" || /vibinbot/i.test(v);
            if (!matched) applies = isUs;
            else if (applies === false) applies = isUs;
            matched = true;
          } else if (applies && v) rules.push({ allow: k === "allow", path: v });
        }
      }
    } catch {
      /* no robots.txt reachable — nothing forbids a single homepage fetch */
    }
    robotsCache.set(origin, rules);
  }
  // RFC 9309 matching: '*' is a wildcard, a trailing '$' anchors the end, the
  // longest matching rule wins, and Allow beats Disallow on a tie.
  let best = null;
  for (const r of robotsCache.get(origin)) {
    const pattern = r.path
      .replace(/[.+?^{}()|[\]\\]/g, "\\$&")
      .replace(/\*/g, ".*")
      .replace(/\$$/, "$");
    if (!new RegExp(`^${pattern}`).test(pathname)) continue;
    if (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow)) best = r;
  }
  return !best || best.allow;
}

// ---- extraction -----------------------------------------------------------
const decodeEntities = (s) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
const clean = (s) => decodeEntities(String(s ?? "")).replace(/\s+/g, " ").trim();

function metaContent(html, key) {
  const re = new RegExp(
    `<meta[^>]+(?:name|property)=["']${key}["'][^>]*>|<meta[^>]+content=[^>]*(?:name|property)=["']${key}["'][^>]*>`,
    "i",
  );
  const tag = re.exec(html)?.[0];
  if (!tag) return null;
  const c = /content=("([^"]*)"|'([^']*)')/i.exec(tag);
  return c ? clean(c[2] ?? c[3]) : null;
}

const LOCAL_TYPES =
  /LocalBusiness|Restaurant|Cafe|CafeOrCoffeeShop|BarOrPub|Bar|FoodEstablishment|Museum|SportsActivityLocation|SportsClub|GolfCourse|BowlingAlley|HealthClub|DaySpa|Store|ShoppingCenter|MovieTheater|Zoo|Aquarium|AmusementPark|TouristAttraction|Park|EntertainmentBusiness|ArtGallery|PerformingArtsTheater|Winery|Brewery|NightClub|SkiResort|StadiumOrArena|Library|LodgingBusiness|Hotel|Organization/i;

function collectJsonLd(html) {
  const found = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    try {
      const data = JSON.parse(m[1].trim());
      const stack = Array.isArray(data) ? [...data] : [data];
      while (stack.length) {
        const n = stack.pop();
        if (!n || typeof n !== "object") continue;
        if (Array.isArray(n["@graph"])) stack.push(...n["@graph"]);
        const t = [].concat(n["@type"] ?? []).join(",");
        if (t && LOCAL_TYPES.test(t)) found.push(n);
      }
    } catch {
      /* invalid JSON-LD — common; ignore */
    }
  }
  return found;
}

function summariseEntity(n) {
  const img = n.image && (typeof n.image === "string" ? n.image : n.image.url || n.image[0]?.url || n.image[0]);
  const spec = [].concat(n.openingHoursSpecification ?? []).map((s) => ({
    days: [].concat(s.dayOfWeek ?? []).map((d) => String(d).replace(/.*\//, "")),
    opens: s.opens ?? null,
    closes: s.closes ?? null,
  }));
  return {
    type: [].concat(n["@type"] ?? []).join(","),
    name: clean(n.name),
    description: clean(n.description).slice(0, 600) || null,
    servesCuisine: [].concat(n.servesCuisine ?? []).map(clean).filter(Boolean),
    priceRange: n.priceRange ? clean(n.priceRange) : null,
    openingHours: [].concat(n.openingHours ?? []).map(clean).filter(Boolean),
    openingHoursSpec: spec.length ? spec : null,
    image: typeof img === "string" ? img : null,
    telephone: n.telephone ? clean(n.telephone) : null,
    city: n.address?.addressLocality ? clean(n.address.addressLocality) : null,
  };
}

function visibleText(html) {
  return clean(
    html
      .replace(/<(script|style|noscript|svg|template|head)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(br|\/p|\/div|\/li|\/h\d|\/tr)[^>]*>/gi, ". ")
      .replace(/<[^>]+>/g, " "),
  );
}

const PARKED =
  /site en construction|under construction|website under construction|coming soon|binnenkort online|domain (is )?for sale|domein te koop|this domain|parked|default web(site)? page|index of \/|apache2 (ubuntu )?default|welcome to nginx|hello world!|het domein|ce domaine|en cours de construction|in opbouw|pagina in aanbouw|account suspended|website is niet beschikbaar|not found on this server/i;
const CLOSED =
  /permanent(ly)? (gesloten|closed)|definitief gesloten|d[ée]finitivement ferm[ée]|(wij|we) (stoppen|zijn gestopt)|zaak (is )?(gestopt|overgenomen)|has (permanently )?closed|(nous|on) (fermons|a ferm[ée]) (d[ée]finitivement|nos portes)|ceased trading|stopt!|gaan definitief dicht/i;

async function crawlOne(r) {
  const rec = { id: r.id, site: r.site, at: Math.floor(Date.now() / 1000) };
  let url;
  try {
    url = new URL(/^https?:\/\//i.test(r.site) ? r.site : `https://${r.site}`);
  } catch {
    return { ...rec, ok: false, error: "bad-url" };
  }
  if (!(await robotsAllows(url.origin, url.pathname || "/"))) {
    return { ...rec, ok: false, error: "robots-disallow" };
  }
  const tryFetch = async (u) =>
    fetch(u, {
      headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml", "accept-language": "en,nl;q=0.8,fr;q=0.6" },
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  let res;
  let tlsIssue = false;
  try {
    res = await tryFetch(url);
  } catch (e) {
    const code = e?.cause?.code || e?.code || e?.name || "fetch-error";
    if (/CERT|SSL|TLS|SELF_SIGNED|UNABLE_TO_VERIFY/i.test(String(code)) && url.protocol === "https:") {
      tlsIssue = true;
      try {
        const httpUrl = new URL(url);
        httpUrl.protocol = "http:";
        res = await tryFetch(httpUrl);
      } catch (e2) {
        return { ...rec, ok: false, error: String(e2?.cause?.code || e2?.code || e2?.name || "fetch-error"), tlsIssue };
      }
    } else if (url.protocol === "http:") {
      // many small sites moved to https without updating OSM
      try {
        const httpsUrl = new URL(url);
        httpsUrl.protocol = "https:";
        res = await tryFetch(httpsUrl);
      } catch {
        return { ...rec, ok: false, error: String(code) };
      }
    } else {
      return { ...rec, ok: false, error: String(code) };
    }
  }
  const finalUrl = res.url;
  const ct = res.headers.get("content-type") || "";
  const base = { ...rec, status: res.status, finalUrl, tlsIssue };
  const origHost = url.host.replace(/^www\./, "");
  let finalHost = origHost;
  try {
    finalHost = new URL(finalUrl).host.replace(/^www\./, "");
  } catch {
    /* keep */
  }
  base.redirectedToOtherHost = finalHost !== origHost ? finalHost : null;
  if (!res.ok) return { ...base, ok: false, error: `http-${res.status}` };
  if (!/html|xml/i.test(ct)) return { ...base, ok: false, error: "not-html", contentType: ct };

  const html = decode(await readLimited(res, MAX_BYTES), ct);
  const titleM = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const text = visibleText(html);
  const headings = [...html.matchAll(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/gi)]
    .map((m) => clean(m[1].replace(/<[^>]+>/g, " ")))
    .filter((t) => t && t.length < 140)
    .slice(0, 8);
  const entities = collectJsonLd(html).map(summariseEntity).slice(0, 3);
  const combined = `${titleM ? clean(titleM[1]) : ""} ${text.slice(0, 3000)}`;
  // Opening hours are usually plain text in a footer/contact block, far past
  // the first screen of copy — keep the passages around the usual labels.
  const hoursRe = /(openingsuren|openingstijden|opening hours|opening times|horaires d.ouverture|horaires|heures d.ouverture|open van|geopend)/gi;
  const timeRe = /\b\d{1,2}\s?[:hu.]\s?\d{2}\b|\b\d{1,2}\s?(?:u|h|am|pm)\b/gi;
  const dayRe = /\b(ma|di|wo|do|vr|za|zo|maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag|mon|tue|wed|thu|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday|lun|mar|mer|jeu|ven|sam|dim|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\b/gi;
  const candidates = [];
  let hm;
  while ((hm = hoursRe.exec(text))) {
    const start = Math.max(0, hm.index - 20);
    const win = text.slice(start, start + 420);
    const score = (win.match(timeRe)?.length ?? 0) * 2 + (win.match(dayRe)?.length ?? 0);
    if (score >= 6) candidates.push({ win, score, start });
    if (candidates.length > 12) break;
  }
  candidates.sort((a, b) => b.score - a.score);
  const hoursText = [];
  for (const c of candidates) {
    if (hoursText.length >= 2) break;
    if (!hoursText.some((w) => w.slice(0, 50) === c.win.slice(0, 50))) hoursText.push(c.win);
  }
  return {
    ...base,
    ok: true,
    lang: (/<html[^>]+lang=["']?([a-z]{2})/i.exec(html)?.[1] || "").toLowerCase() || null,
    title: titleM ? clean(titleM[1]).slice(0, 200) : null,
    metaDescription: metaContent(html, "description")?.slice(0, 600) ?? null,
    ogTitle: metaContent(html, "og:title")?.slice(0, 200) ?? null,
    ogDescription: metaContent(html, "og:description")?.slice(0, 600) ?? null,
    ogImage: metaContent(html, "og:image") ?? metaContent(html, "twitter:image") ?? null,
    headings,
    jsonld: entities,
    textLength: text.length,
    text: text.slice(0, 1800),
    hoursText,
    parked: PARKED.test(combined) && text.length < 1500,
    closedSignal: CLOSED.exec(combined)?.[0] ?? null,
  };
}

async function worker() {
  while (hostQueue.length) {
    const [, list] = hostQueue.shift();
    for (const r of list) {
      let result;
      try {
        result = await crawlOne(r);
      } catch (e) {
        result = { id: r.id, site: r.site, ok: false, error: `crash:${String(e?.message || e).slice(0, 80)}` };
      }
      out.write(JSON.stringify(result) + "\n");
      finished++;
      if (finished % 100 === 0) console.log(`crawled ${finished}/${todo.length}`);
      if (list.length > 1) await new Promise((res) => setTimeout(res, PER_HOST_DELAY_MS));
    }
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));
out.end();
console.log(`done: ${finished} crawled`);
