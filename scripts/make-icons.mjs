/* Rasterises the VIBIN mark into favicon + PWA + OG images.
   Run: node scripts/make-icons.mjs   (requires the `sharp` dev dependency)
   If sharp is missing the app still works with the SVG favicon. */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
mkdirSync(join(root, "public/icons"), { recursive: true });

let sharp;
try {
  sharp = (await import("sharp")).default;
} catch {
  console.warn("sharp not available — skipping PNG icon generation.");
  process.exit(0);
}

const NAVY = "#101426";
const BLUE = "#3155ff";
const LIME = "#b8f23d";
const WHITE = "#f7f8fc";

// The V mark, drawn on a 48-box. `pad` shrinks it for maskable safe zone.
const mark = (box = 48, bg = NAVY, radius = box * 0.25) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="${box}" height="${box}">
  <rect width="48" height="48" rx="${(radius / box) * 48}" fill="${bg}"/>
  <line x1="10" y1="8" x2="24" y2="40" stroke="${BLUE}" stroke-width="9" stroke-linecap="round"/>
  <line x1="38" y1="8" x2="24" y2="40" stroke="${LIME}" stroke-width="9" stroke-linecap="round"/>
  <circle cx="24" cy="40" r="4.2" fill="${WHITE}"/>
</svg>`;

const maskable = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="512" height="512">
  <rect width="100" height="100" fill="${NAVY}"/>
  <g transform="translate(28 28) scale(0.9)">
    <line x1="10" y1="8" x2="24" y2="40" stroke="${BLUE}" stroke-width="9" stroke-linecap="round"/>
    <line x1="38" y1="8" x2="24" y2="40" stroke="${LIME}" stroke-width="9" stroke-linecap="round"/>
    <circle cx="24" cy="40" r="4.2" fill="${WHITE}"/>
  </g>
</svg>`;

const og = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
  <rect width="1200" height="630" fill="${NAVY}"/>
  <circle cx="120" cy="90" r="420" fill="${BLUE}" opacity="0.16"/>
  <circle cx="1120" cy="620" r="360" fill="${LIME}" opacity="0.14"/>
  <g transform="translate(96 210) scale(3.1)">
    <line x1="10" y1="8" x2="24" y2="40" stroke="${BLUE}" stroke-width="9" stroke-linecap="round"/>
    <line x1="38" y1="8" x2="24" y2="40" stroke="${LIME}" stroke-width="9" stroke-linecap="round"/>
    <circle cx="24" cy="40" r="4.2" fill="${WHITE}"/>
  </g>
  <text x="270" y="300" font-family="Plus Jakarta Sans, Arial, sans-serif" font-size="120" font-weight="800" fill="${WHITE}" letter-spacing="-3">VIBIN</text>
  <text x="272" y="372" font-family="Plus Jakarta Sans, Arial, sans-serif" font-size="42" font-weight="600" fill="${LIME}">Find your vibe. Make a plan.</text>
</svg>`;

async function png(svg, size, out) {
  const buf = await sharp(Buffer.from(svg)).resize(size).png().toBuffer();
  writeFileSync(join(root, out), buf);
  console.log("wrote", out);
}

await png(mark(512), 512, "public/icons/icon-512.png");
await png(mark(192), 192, "public/icons/icon-192.png");
await png(maskable, 512, "public/icons/icon-maskable-512.png");
await png(mark(180, NAVY, 40), 180, "public/apple-touch-icon.png");
await png(mark(32), 32, "public/favicon-32.png");
await png(mark(16), 16, "public/favicon-16.png");
writeFileSync(
  join(root, "public/og.png"),
  await sharp(Buffer.from(og)).png().toBuffer(),
);
console.log("wrote public/og.png");
