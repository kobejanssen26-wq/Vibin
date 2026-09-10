/**
 * Regenerates the geocoder tables inside src/worker/lib/be-places.ts from the
 * vendored public dataset scripts/be-localities.json (postcode + locality name +
 * centre coordinate for ~2700 Belgian localities — every one of the 581
 * municipalities plus deelgemeenten / sections).
 *
 *   node scripts/gen-be-places.mjs
 *
 * Source dataset: https://github.com/jief/zipcode-belgium (public domain).
 * Only the two GENERATED blocks in be-places.ts are rewritten; the resolver
 * logic and alias table are hand-maintained and left untouched.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const target = join(here, "..", "src", "worker", "lib", "be-places.ts");
const raw = JSON.parse(readFileSync(join(here, "be-localities.json"), "utf8"));

const norm = (s) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const r4 = (n) => Math.round(n * 1e4) / 1e4;

const byName = new Map();
const byZip = new Map();
for (const e of raw) {
  const n = norm(e.city);
  if (n && !byName.has(n)) byName.set(n, [r4(e.lat), r4(e.lng)]);
  if (!byZip.has(e.zip)) byZip.set(e.zip, []);
  byZip.get(e.zip).push([e.lat, e.lng]);
}
const nameLines = [...byName]
  .sort((a, b) => a[0].localeCompare(b[0]))
  .map(([k, v]) => `${k}:${v[0]},${v[1]}`)
  .join("\n");
const zipLines = [...byZip]
  .sort((a, b) => a[0].localeCompare(b[0]))
  .map(([z, pts]) => {
    const la = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    const ln = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    return `${z}:${r4(la)},${r4(ln)}`;
  })
  .join("\n");

let src = readFileSync(target, "utf8");
src = replaceBlock(src, "PLACE_DATA", nameLines);
src = replaceBlock(src, "POSTCODE_DATA", zipLines);
writeFileSync(target, src);
console.log(
  `be-places.ts: ${byName.size} names, ${byZip.size} postcodes ` +
    `(${(nameLines.length + zipLines.length) / 1024 | 0} KB of data).`,
);

/** Replace the backtick string literal assigned to `const <name> = `…`;`. */
function replaceBlock(source, name, data) {
  const re = new RegExp("const " + name + " =\\s*`[\\s\\S]*?`;");
  if (!re.test(source)) throw new Error(`block ${name} not found in be-places.ts`);
  return source.replace(re, "const " + name + " = `" + data + "`;");
}
