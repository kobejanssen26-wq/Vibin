/**
 * Regenerates the VIBIN brand exports in this folder from the canonical mark
 * geometry (src/client/components/Logo.tsx). Vector SVGs + high-res PNGs.
 *
 *   node brand/build-brand.mjs
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import sharp from "sharp";

const OUT = dirname(fileURLToPath(import.meta.url));

const C = {
  navy: "#101426",
  blue: "#3155ff",
  lime: "#b8f23d",
  paper: "#f7f8fc",
};

/** the mark, drawn in a 0 0 48 48 space (matches Logo.tsx) */
const MARK = (dot) => `
  <line x1="10" y1="8" x2="24" y2="40" stroke="${C.blue}" stroke-width="9" stroke-linecap="round"/>
  <line x1="38" y1="8" x2="24" y2="40" stroke="${C.lime}" stroke-width="9" stroke-linecap="round"/>
  <circle cx="24" cy="40" r="4.2" fill="${dot}"/>`;

/** mark centred on a `size` canvas with `pad` fraction of breathing room */
function markCanvas(size, { pad = 0.11, dot = C.navy, bg = null, radius = 0 } = {}) {
  const inner = size * (1 - pad * 2);
  const scale = inner / 48;
  const off = (size - inner) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
${bg ? `  <rect width="${size}" height="${size}" rx="${radius}" fill="${bg}"/>` : ""}
  <g transform="translate(${off} ${off}) scale(${scale})">${MARK(dot)}
  </g>
</svg>`;
}

/** mark + "VIBIN" wordmark lockup */
function wordmark({ dark = false } = {}) {
  const w = 900;
  const h = 300;
  const markSize = 200;
  const y = (h - markSize) / 2;
  const scale = markSize / 48;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <g transform="translate(16 ${y}) scale(${scale})">${MARK(dark ? C.paper : C.navy)}
  </g>
  <text x="252" y="${h / 2 + 6}" dominant-baseline="central"
        font-family="Segoe UI, -apple-system, Helvetica Neue, Arial, sans-serif"
        font-size="176" font-weight="800" letter-spacing="-5"
        fill="${dark ? "#ffffff" : C.navy}">VIBIN</text>
</svg>`;
}

const files = {
  "vibin-mark.svg": markCanvas(512, { dot: C.navy }),
  "vibin-mark-on-dark.svg": markCanvas(512, { dot: C.paper }),
  "vibin-app-icon.svg": markCanvas(1024, { dot: C.paper, bg: C.navy, radius: 0, pad: 0.2 }),
  "vibin-app-icon-rounded.svg": markCanvas(1024, { dot: C.paper, bg: C.navy, radius: 224, pad: 0.2 }),
  "vibin-wordmark.svg": wordmark({ dark: false }),
  "vibin-wordmark-on-dark.svg": wordmark({ dark: true }),
};

for (const [name, svg] of Object.entries(files)) {
  writeFileSync(join(OUT, name), svg.trim() + "\n");
}

/** [svg file, png name, width, height?] */
const raster = [
  ["vibin-mark.svg", "vibin-mark-512.png", 512],
  ["vibin-mark.svg", "vibin-mark-1024.png", 1024],
  ["vibin-mark.svg", "vibin-mark-2048.png", 2048],
  ["vibin-mark-on-dark.svg", "vibin-mark-on-dark-1024.png", 1024],
  ["vibin-app-icon.svg", "vibin-app-icon-1024.png", 1024],
  ["vibin-app-icon-rounded.svg", "vibin-app-icon-rounded-1024.png", 1024],
  ["vibin-wordmark.svg", "vibin-wordmark-2048.png", 2048, 683],
  ["vibin-wordmark-on-dark.svg", "vibin-wordmark-on-dark-2048.png", 2048, 683],
];

for (const [src, out, w, h] of raster) {
  const wordmark = src.includes("wordmark");
  let img = sharp(join(OUT, src), { density: 512 }).resize(w, h ?? w, {
    fit: "contain",
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  });
  // tight-crop the transparent margin off the wordmark, then pad back a little
  if (wordmark) {
    img = sharp(await img.png().toBuffer())
      .trim({ threshold: 1 })
      .extend({
        top: 24,
        bottom: 24,
        left: 24,
        right: 24,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      });
  }
  await img.png().toFile(join(OUT, out));
  console.log("wrote", out);
}
console.log("done —", Object.keys(files).length, "svg +", raster.length, "png");
