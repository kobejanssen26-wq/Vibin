import fs from "node:fs";
const rows = JSON.parse(fs.readFileSync("C:/Users/Kobej/code/mingo-1.2/data/expansion/exact-prices.json", "utf8"));
const RISK = /(instead of|ipv|au lieu|in plaats van|reduc|réduc|reduced|korting|promo|actie|disabled|handicap|beperking|early bird|combi|from |vanaf|à partir|dès|per guide|par guide|per gids|senior|student|kind|child|enfant|jeun|youth|junior|groep|group|groupe|school|abonnement|jaarkaart|annual|membership|lid)/i;
const strip = (h) =>
  h
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&euro;/g, "€")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
const cache = new Map();
const out = [];
let i = 0;
async function work() {
  while (i < rows.length) {
    const r = rows[i++];
    let text = cache.get(r.url);
    if (text === undefined) {
      try {
        const res = await fetch(r.url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(25000) });
        text = res.ok ? strip(await res.text()) : null;
      } catch {
        text = null;
      }
      cache.set(r.url, text);
    }
    const eur = r.c / 100;
    const forms = [...new Set([String(eur), eur.toFixed(1), eur.toFixed(2)])].map((f) => f.replace(".", "[.,]"));
    let status = "OK";
    let ctx = "";
    if (text == null) status = "FETCH-FAILED";
    else {
      const re = new RegExp(`(?<![\\d.,])(?:${forms.join("|")})(?!\\d)`, "g");
      const hits = [...text.matchAll(re)].filter((m) => /€|euro|eur/i.test(text.slice(Math.max(0, m.index - 6), m.index + 12)));
      if (!hits.length) status = "NOT-ON-PAGE";
      else {
        // Look at the label immediately BEFORE the amount only (what it is the price of)
        const m = hits[0];
        const before = text.slice(Math.max(0, m.index - 45), m.index);
        ctx = text.slice(Math.max(0, m.index - 70), m.index + 40);
        if (/(instead of|ipv|au lieu|in plaats van|reduc|réduc|korting|promo|actie|disabled|handicap|early bird|combi|from|vanaf|à partir|dès|senior|student|kind|child|enfant|jeun|junior|groep|group|school|abonnement|annual|jaarkaart)/i.test(before)) status = "CHECK";
      }
    }
    out.push({ id: r.id, title: r.title, eur, status, ctx, url: r.url });
  }
}
await Promise.all(Array.from({ length: 6 }, work));
fs.writeFileSync("C:/Users/Kobej/code/mingo-1.2/data/expansion/exact-audit.json", JSON.stringify(out, null, 1));
const c = {};
for (const o of out) c[o.status] = (c[o.status] || 0) + 1;
console.log(out.length, JSON.stringify(c));
for (const o of out.filter((x) => x.status !== "OK").sort((a, b) => a.status.localeCompare(b.status))) console.log(`[${o.status}] ${o.id.replace("act_", "")} | ${o.title} | EUR${o.eur} | ${o.ctx}`);
