#!/usr/bin/env node
/**
 * IMAGE VALIDATION stage. For live venue sites, take the page's own Open Graph
 * / schema.org image and keep it only if it demonstrably works as a card photo:
 *   - loads (HTTP 200, image/jpeg|png|webp) when requested the way a browser on
 *     vibin.be would (Referer set) — catches hotlink protection,
 *   - big enough (>=700x400) and a photo-like aspect ratio (not a logo strip),
 *   - not a logo/icon/placeholder by filename,
 *   - not shared by several venues (a chain's hero image or a default banner
 *     is not a picture of THIS place).
 * It cannot tell whether the photo is relevant — that is why accepted images
 * score 3, not 4/5, and a random sample is inspected by eye before applying.
 *
 * Output: data/enrichment/images.json  { activityId: {url,w,h,bytes} }
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const acts = new Map(JSON.parse(fs.readFileSync(path.join(ROOT, "data/enrichment/prod-activities.json"), "utf8"))[0].results.map((r) => [r.id, r]));
const crawl = fs.readFileSync(path.join(ROOT, "data/enrichment/crawl.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const BAD_NAME = /(logo|icon|favicon|sprite|placeholder|default|blank|avatar|no-?image|cookie|share-?default|social-?default|banner-?default|loading)/i;

const cands = [];
for (const r of crawl) {
  if (!r.ok || r.parked || r.closedSignal) continue;
  const a = acts.get(r.id);
  if (!a || !a.image_is_generic) continue; // only replace stock fallbacks, never a specific photo
  const ld = r.jsonld?.find((e) => e.image);
  const raw = r.ogImage || ld?.image;
  if (!raw) continue;
  let url;
  try {
    url = new URL(raw, r.finalUrl).toString();
  } catch {
    continue;
  }
  if (!/^https?:/i.test(url) || /\.(svg|gif|ico)(\?|$)/i.test(url) || BAD_NAME.test(url)) continue;
  cands.push({ id: r.id, url, host: new URL(r.finalUrl).host });
}
// shared image = not specific to one venue
const useCount = new Map();
for (const c of cands) useCount.set(c.url, (useCount.get(c.url) || 0) + 1);
const todo = cands.filter((c) => useCount.get(c.url) === 1);
console.log(`image candidates: ${cands.length}, after dropping shared images: ${todo.length}`);

function dims(buf) {
  // PNG
  if (buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50) return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), t: "png" };
  // JPEG: walk segments to a SOF marker
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const m = buf[i + 1];
      if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7), t: "jpeg" };
      i += 2 + buf.readUInt16BE(i + 2);
    }
    return null;
  }
  // WEBP
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    const f = buf.toString("ascii", 12, 16);
    if (f === "VP8X") return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3), t: "webp" };
    if (f === "VP8 ") return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff, t: "webp" };
    if (f === "VP8L") {
      const b = buf.readUInt32LE(21);
      return { w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1, t: "webp" };
    }
  }
  return null;
}

const out = {};
const rejected = {};
const bump = (k) => (rejected[k] = (rejected[k] || 0) + 1);
const q = [...todo];
async function worker() {
  while (q.length) {
    const c = q.shift();
    try {
      const res = await fetch(c.url, {
        headers: { "user-agent": BROWSER_UA, referer: "https://vibin.be/", accept: "image/avif,image/webp,image/*" },
        redirect: "follow",
        signal: AbortSignal.timeout(15000),
      });
      const ct = res.headers.get("content-type") || "";
      if (!res.ok) { bump(`http-${res.status}`); continue; }
      if (!/image\/(jpeg|png|webp)/i.test(ct)) { bump("not-jpg-png-webp"); continue; }
      const len = Number(res.headers.get("content-length") || 0);
      const reader = res.body.getReader();
      const chunks = [];
      let n = 0;
      while (n < 200_000) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        n += value.length;
      }
      try { await reader.cancel(); } catch { /* done */ }
      const head = Buffer.concat(chunks.map((x) => Buffer.from(x)));
      const d = dims(head);
      if (!d) { bump("no-dims"); continue; }
      const bytes = len || head.length;
      if (d.w < 700 || d.h < 400) { bump("too-small"); continue; }
      const ar = d.w / d.h;
      if (ar < 0.75 || ar > 2.4) { bump("bad-aspect"); continue; }
      if (bytes < 25_000) { bump("tiny-file"); continue; }
      out[c.id] = { url: res.url, w: d.w, h: d.h, bytes };
    } catch (e) {
      bump(String(e?.cause?.code || e?.name || "error"));
    }
  }
}
await Promise.all(Array.from({ length: 12 }, worker));
fs.writeFileSync(path.join(ROOT, "data/enrichment/images.json"), JSON.stringify(out));
console.log(`accepted images: ${Object.keys(out).length}`, rejected);
