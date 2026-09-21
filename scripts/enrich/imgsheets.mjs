#!/usr/bin/env node
/**
 * IMAGE REVIEW PREP. Automatic checks (size, aspect, loads) cannot tell a photo
 * of the venue from a logo, a season poster or an unrelated news picture, so a
 * vision reviewer looks at every candidate. This builds labelled contact sheets
 * (20 numbered tiles each, full image visible, not cropped) plus a manifest that
 * maps tile number -> venue, for the reviewer to judge against.
 *
 * Output: data/enrichment/img-sheets/sheet-NN.jpg + sheet-NN.json
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const acts = new Map(JSON.parse(fs.readFileSync(path.join(ROOT, "data/enrichment/prod-activities.json"), "utf8"))[0].results.map((r) => [r.id, r]));
const images = JSON.parse(fs.readFileSync(path.join(ROOT, "data/enrichment/images.json"), "utf8"));
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const COLS = 5, ROWS = 4, TW = 380, TH = 285;
const outDir = path.join(ROOT, "data/enrichment/img-sheets");
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const ids = Object.keys(images);
const tiles = new Map();
let next = 0;
await Promise.all(
  Array.from({ length: 10 }, async () => {
    while (next < ids.length) {
      const id = ids[next++];
      try {
        const res = await fetch(images[id].url, { headers: { "user-agent": UA, referer: "https://vibin.be/" }, signal: AbortSignal.timeout(20000) });
        if (!res.ok) continue;
        const buf = Buffer.from(await res.arrayBuffer());
        const t = await sharp(buf).resize(TW, TH, { fit: "contain", background: { r: 60, g: 60, b: 60 } }).jpeg({ quality: 78 }).toBuffer();
        tiles.set(id, t);
      } catch { /* skip: an image that will not load now would not load for users either */ }
    }
  }),
);

const ok = ids.filter((id) => tiles.has(id));
const per = COLS * ROWS;
let sheets = 0;
for (let s = 0; s * per < ok.length; s++) {
  const chunk = ok.slice(s * per, (s + 1) * per);
  const comps = [];
  const manifest = [];
  for (const [i, id] of chunk.entries()) {
    const x = (i % COLS) * TW, y = Math.floor(i / COLS) * TH;
    comps.push({ input: tiles.get(id), left: x, top: y });
    const label = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="40"><rect width="64" height="40" fill="#000" fill-opacity="0.75"/><text x="32" y="29" font-size="28" font-family="Arial" font-weight="700" fill="#fff" text-anchor="middle">${i + 1}</text></svg>`);
    comps.push({ input: label, left: x, top: y });
    const a = acts.get(id);
    manifest.push({ n: i + 1, id, name: a?.title, type: a?.subcategory || a?.category_id, city: a?.city });
  }
  const name = `sheet-${String(s).padStart(2, "0")}`;
  await sharp({ create: { width: COLS * TW, height: ROWS * TH, channels: 3, background: { r: 20, g: 20, b: 20 } } })
    .composite(comps)
    .jpeg({ quality: 80 })
    .toFile(path.join(outDir, `${name}.jpg`));
  fs.writeFileSync(path.join(outDir, `${name}.json`), JSON.stringify(manifest, null, 1));
  sheets++;
}
console.log(`images: ${ids.length}, loaded: ${ok.length}, sheets: ${sheets}`);
