/**
 * Applies seed/seed.sql in chunks, so a catalogue of 1,000+ rows never hits a
 * single-request timeout (D1's remote HTTP API and, worse, wrangler's local
 * miniflare D1 both choke on one huge multi-thousand-statement file).
 *
 *   node seed/apply-seed.mjs --local
 *   node seed/apply-seed.mjs --remote
 *
 * Splits on statement boundaries (";\n"), keeping PRAGMA / provider / category
 * statements in the first chunk. Safe to re-run — every statement is
 * `INSERT OR REPLACE`.
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { execSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const mode = process.argv.includes("--local") ? "--local" : "--remote";
const CHUNK_SIZE = 200; // statements per request

const sql = readFileSync(join(here, "seed.sql"), "utf8");
const statements = sql
  .split(/;\s*\n/)
  .map((s) => s.trim())
  .filter(Boolean)
  .map((s) => s + ";");

const chunks = [];
for (let i = 0; i < statements.length; i += CHUNK_SIZE) {
  chunks.push(statements.slice(i, i + CHUNK_SIZE));
}

const tmp = mkdtempSync(join(tmpdir(), "vibin-seed-"));
console.log(
  `Applying ${statements.length} statements to ${mode.slice(2)} D1 in ${chunks.length} chunk(s) of <=${CHUNK_SIZE}...`,
);

try {
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const file = join(tmp, `chunk-${i}.sql`);
    writeFileSync(file, chunk.join("\n"));
    console.log(`  chunk ${i + 1}/${chunks.length} (${chunk.length} stmts)...`);
    try {
      // execSync always runs the given string through a shell — sidesteps
      // the Windows npx/npx.cmd exec quirks that hit execFileSync (EINVAL on
      // a direct .cmd exec, ENOENT without shell:true). `file` is our own
      // tmp path, not user input, so a plain quoted interpolation is fine.
      execSync(`npx wrangler d1 execute vibin-db ${mode} --file="${file}"`, {
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (e) {
      const out = [e.stdout, e.stderr].filter(Boolean).map(String).join("\n");
      console.error(`  chunk ${i + 1} FAILED:\n${out || e.message}`);
      process.exitCode = 1;
      break;
    }
  }
  if (process.exitCode !== 1) console.log("done.");
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
