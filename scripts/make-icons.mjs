/* Rasterises public/favicon.svg into the PWA PNG icons. Run: node scripts/make-icons.mjs
   Requires `sharp` (a dev dependency). If sharp is unavailable the manifest
   still works with the SVG icon — these PNGs are a progressive enhancement. */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const svg = readFileSync(join(root, "public/favicon.svg"));
mkdirSync(join(root, "public/icons"), { recursive: true });

let sharp;
try {
  sharp = (await import("sharp")).default;
} catch {
  console.warn("sharp not available — skipping PNG icon generation.");
  process.exit(0);
}

const targets = [
  ["icon-192.png", 192, false],
  ["icon-512.png", 512, false],
  ["icon-maskable-512.png", 512, true],
  ["apple-touch-icon.png", 180, false],
  ["og.png", 1200, false],
];

for (const [name, size, maskable] of targets) {
  let img = sharp(svg, { density: 384 }).resize(size, size, {
    fit: "contain",
    background: maskable ? "#14101a" : { r: 0, g: 0, b: 0, alpha: 0 },
  });
  if (name === "og.png") {
    img = sharp({
      create: {
        width: 1200,
        height: 630,
        channels: 4,
        background: "#14101a",
      },
    }).composite([{ input: await sharp(svg, { density: 384 }).resize(360, 360).png().toBuffer(), gravity: "center" }]);
  }
  writeFileSync(join(root, "public/icons", name), await img.png().toBuffer());
  console.log("wrote", name);
}
