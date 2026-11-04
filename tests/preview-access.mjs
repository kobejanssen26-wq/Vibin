/**
 * "Binnenkort" preview access code — end-to-end on a throw-away local D1 + `wrangler dev`.
 *
 *   npm run build && node tests/preview-access.mjs      (repo root; needs .dev.vars like the other suites)
 *
 * Covers: coming-soon page shows the code form · no code configured = nobody gets in · wrong
 * code (form + JSON) · right code (any case / spaces / dashes) sets an HttpOnly cookie · with
 * the cookie the page, /api/status and the API open up · tampered cookie stays out · changing
 * the code invalidates passes · /admin stays reachable · the maintenance message is escaped ·
 * the owner sets/clears the code from the Command Center (stored hashed, never readable back).
 * (The per-IP rate limit is disabled when APP_ENV=development, so it is not exercised here.)
 */
import { spawn, execFileSync } from "node:child_process";
import { createHash, createHmac } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const PORT = Number(process.env.PORT ?? 8797);
const BASE = `http://127.0.0.1:${PORT}`;
const STATE = fs.mkdtempSync(path.join(os.tmpdir(), "vibin-preview-"));
const IS_WIN = process.platform === "win32";

let pass = 0;
let fail = 0;
const ok = (name, cond, extra) => {
  if (cond) {
    pass++;
    console.log("  ✓", name);
  } else {
    fail++;
    console.error("  ✗", name, extra !== undefined ? `\n      ${JSON.stringify(extra).slice(0, 500)}` : "");
  }
};

function wrangler(args) {
  return execFileSync(IS_WIN ? "npx.cmd" : "npx", ["wrangler", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], shell: IS_WIN });
}
const sql = (command) => wrangler(["d1", "execute", "vibin-db", "--local", "--persist-to", STATE, "--command", command]);

/** Same recipe as src/worker/lib/preview-access.ts: "salt:sha256(salt:NORMALISED_CODE)". */
const storedFor = (code) => {
  const salt = "a1b2c3d4e5f6a7b8c9d0e1f2";
  return `${salt}:${createHash("sha256").update(`${salt}:${code.replace(/[\s-]+/g, "").toUpperCase()}`).digest("hex")}`;
};
const setSetting = (key, value) =>
  sql(`INSERT INTO system_settings (key, value) VALUES ('${key}', '${value.replace(/'/g, "''")}') ON CONFLICT(key) DO UPDATE SET value = excluded.value;`);

async function req(method, p, { json, form, cookie } = {}) {
  const headers = { connection: "close" };
  let body;
  if (json !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(json);
  } else if (form) {
    headers["content-type"] = "application/x-www-form-urlencoded";
    body = new URLSearchParams(form).toString();
  }
  if (cookie) headers.cookie = cookie;
  const res = await fetch(BASE + p, { method, headers, body, redirect: "manual" });
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    /* html */
  }
  return { status: res.status, text, data, setCookie: res.headers.get("set-cookie") ?? "", location: res.headers.get("location") ?? "" };
}

/* ---- owner session (same recipe as tests/swipe.mjs) ---- */
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function totp(secret) {
  let bits = "";
  for (const ch of secret.replace(/=+$/, "").toUpperCase()) bits += B32.indexOf(ch).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const buf = Buffer.alloc(8);
  buf.writeBigInt64BE(BigInt(Math.floor(Date.now() / 1000 / 30)));
  const h = createHmac("sha1", key).update(buf).digest();
  const o = h[h.length - 1] & 0xf;
  return String((((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1_000_000).padStart(6, "0");
}
const jarMap = new Map();
async function adminCall(method, p, body) {
  const headers = { connection: "close", "content-type": "application/json" };
  if (jarMap.size) headers.cookie = [...jarMap].map(([k, v]) => `${k}=${v}`).join("; ");
  if (method !== "GET" && jarMap.get("vibin_admin_csrf")) headers["x-vibin-admin-csrf"] = jarMap.get("vibin_admin_csrf");
  const res = await fetch(BASE + p, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  for (const line of res.headers.getSetCookie?.() ?? []) {
    const seg = line.split(";")[0];
    const i = seg.indexOf("=");
    jarMap.set(seg.slice(0, i), seg.slice(i + 1));
  }
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    /* not json */
  }
  return { status: res.status, data, text };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CACHE_WAIT = 16_000; // the worker caches maintenance settings for 15 s

let server;
function stop() {
  if (!server) return;
  try {
    if (IS_WIN) execFileSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore" });
    else process.kill(-server.pid, "SIGTERM");
  } catch {
    /* gone */
  }
}

async function main() {
  console.log("• migrating throw-away local D1 …");
  wrangler(["d1", "migrations", "apply", "vibin-db", "--local", "--persist-to", STATE]);
  setSetting("maintenance_mode", "1");
  setSetting("maintenance_message", "We bouwen <b>aan</b> iets & meer");

  console.log("• starting wrangler dev on", BASE);
  server = spawn(IS_WIN ? "npx.cmd" : "npx", ["wrangler", "dev", "--port", String(PORT), "--persist-to", STATE], { stdio: "ignore", shell: IS_WIN, detached: !IS_WIN });
  const t0 = Date.now();
  for (;;) {
    try {
      if ((await fetch(`${BASE}/api/health`)).ok) break;
    } catch {
      /* not up yet */
    }
    if (Date.now() - t0 > 120_000) throw new Error("wrangler dev did not start");
    await sleep(700);
  }

  console.log("\n[A] maintenance ON, no access code configured");
  let r = await req("GET", "/");
  ok("page is the coming-soon page (503)", r.status === 503 && r.text.includes("Binnenkort beschikbaar"), r.status);
  ok("page offers the access-code form", r.text.includes('action="/api/access"') && r.text.includes('name="code"'));
  ok("maintenance message is HTML-escaped", r.text.includes("&lt;b&gt;aan&lt;/b&gt; iets &amp; meer") && !r.text.includes("<b>aan</b>"));
  r = await req("GET", "/api/status");
  ok("status: maintenance on, no preview", r.data?.maintenance === true && r.data?.preview === false, r.data);
  r = await req("POST", "/api/access", { json: { code: "anything-123" } });
  ok("no code configured → nobody gets in (401)", r.status === 401 && !r.setCookie, r.status);
  r = await req("POST", "/api/access", { json: { code: "" } });
  ok("empty code → 401", r.status === 401);
  r = await req("GET", "/api/categories");
  ok("normal API is 503", r.status === 503, r.status);

  console.log("\n[B] access code configured");
  const CODE = "K7QM-2XZP-9HTA";
  setSetting("preview_access_code", storedFor(CODE));
  console.log(`  (waiting ${CACHE_WAIT / 1000}s for the worker's settings cache)`);
  await sleep(CACHE_WAIT);

  r = await req("POST", "/api/access", { form: { code: "WRONG-CODE-1" } });
  ok("wrong code via form → 303 back with ?toegang=fout, no cookie", r.status === 303 && r.location === "/?toegang=fout" && !r.setCookie, { s: r.status, l: r.location });
  r = await req("GET", "/?toegang=fout");
  ok("page shows 'Die code klopt niet.' with the form open", r.text.includes("Die code klopt niet.") && r.text.includes("<details open"));
  r = await req("POST", "/api/access", { json: { code: "WRONG-CODE-1" } });
  ok("wrong code via JSON → 401, no cookie", r.status === 401 && !r.setCookie && r.data?.error === "invalid_code", r.status);
  r = await req("POST", "/api/access", { json: { code: 12345 } });
  ok("non-string code → 401", r.status === 401);

  r = await req("POST", "/api/access", { json: { code: "k7qm 2xzp 9hta" } });
  ok("right code (any case/spaces) via JSON → 200", r.status === 200 && r.data?.ok === true, r.status);
  const cookieLine = r.setCookie;
  ok("cookie is HttpOnly, SameSite=Lax, ~30 days", /vibin_preview=/.test(cookieLine) && /HttpOnly/i.test(cookieLine) && /SameSite=Lax/i.test(cookieLine) && /Max-Age=2592000/i.test(cookieLine), cookieLine);
  ok("cookie value does not contain the code", !cookieLine.toUpperCase().includes("K7QM"));
  const pass1 = cookieLine.split(";")[0];

  r = await req("POST", "/api/access", { form: { code: CODE } });
  ok("right code via form → 303 to / with cookie", r.status === 303 && r.location === "/" && /vibin_preview=/.test(r.setCookie), { s: r.status, l: r.location });

  console.log("\n[C] with the pass cookie");
  r = await req("GET", "/", { cookie: pass1 });
  ok("page opens the real app (200, not coming-soon)", r.status === 200 && !r.text.includes("Binnenkort beschikbaar"), r.status);
  r = await req("GET", "/groups/abc", { cookie: pass1 });
  ok("deep link opens the app too", r.status === 200 && !r.text.includes("Binnenkort beschikbaar"), r.status);
  r = await req("GET", "/api/status", { cookie: pass1 });
  ok("status: maintenance false, preview true", r.data?.maintenance === false && r.data?.preview === true, r.data);
  r = await req("GET", "/api/categories", { cookie: pass1 });
  ok("API no longer 503", r.status !== 503, r.status);

  console.log("\n[D] without / with a forged pass");
  r = await req("GET", "/");
  ok("no cookie → still the coming-soon page", r.status === 503);
  const [name, val] = pass1.split("=");
  const [exp, sig] = val.split(".");
  r = await req("GET", "/", { cookie: `${name}=${Number(exp) + 100000}.${sig}` });
  ok("tampered expiry → coming-soon", r.status === 503);
  r = await req("GET", "/", { cookie: `${name}=${exp}.${"0".repeat(64)}` });
  ok("forged signature → coming-soon", r.status === 503);
  r = await req("GET", "/api/categories", { cookie: `${name}=garbage` });
  ok("garbage cookie → API 503", r.status === 503);
  r = await req("GET", "/admin");
  ok("/admin stays reachable without a pass", r.status === 200, r.status);
  r = await req("GET", "/api/admin/auth/session");
  ok("admin auth API stays reachable", r.status !== 503, r.status);

  console.log("\n[E] changing the code invalidates earlier passes");
  setSetting("preview_access_code", storedFor("NEW-CODE-7777"));
  await sleep(CACHE_WAIT);
  r = await req("GET", "/", { cookie: pass1 });
  ok("old pass no longer works", r.status === 503, r.status);
  r = await req("POST", "/api/access", { json: { code: CODE } });
  ok("old code rejected", r.status === 401);
  r = await req("POST", "/api/access", { json: { code: "new-code-7777" } });
  ok("new code accepted", r.status === 200 && /vibin_preview=/.test(r.setCookie));

  console.log("\n[F] clearing the code closes the door again");
  const pass2 = r.setCookie.split(";")[0];
  setSetting("preview_access_code", "");
  await sleep(CACHE_WAIT);
  r = await req("GET", "/", { cookie: pass2 });
  ok("pass stops working once the code is cleared", r.status === 503, r.status);
  r = await req("POST", "/api/access", { json: { code: "new-code-7777" } });
  ok("cleared code cannot be used", r.status === 401);

  console.log("\n[G] the owner manages the code from the Command Center");
  r = await req("PUT", "/api/admin/cc/settings", { json: { key: "preview_access_code", value: "Owner-Set-4321" } });
  ok("anonymous cannot set the code (401)", r.status === 401, r.status);
  r = await adminCall("POST", "/api/admin/auth/setup/begin", { email: `owner${Date.now()}@vibin.local`, password: "owner-super-secret-123" });
  r = await adminCall("POST", "/api/admin/auth/mfa/enroll/confirm", { code: totp(r.data.secret) });
  ok("owner signed in with MFA", r.status === 200, r.data);
  r = await adminCall("PUT", "/api/admin/cc/settings", { key: "preview_access_code", value: "abc" });
  ok("too-short code rejected (400)", r.status === 400, r.status);
  r = await adminCall("PUT", "/api/admin/cc/settings", { key: "preview_access_code", value: "Owner-Set-4321" });
  ok("owner sets a code", r.status === 200, r);
  r = await adminCall("GET", "/api/admin/cc/settings");
  ok("settings say a code is set, and never reveal it", r.data?.previewAccessSet === true && !r.text.includes("Owner-Set") && !/[0-9a-f]{64}/.test(r.text), r.data);
  const stored = JSON.parse(wrangler(["d1", "execute", "vibin-db", "--local", "--persist-to", STATE, "--command", "SELECT value FROM system_settings WHERE key='preview_access_code'", "--json"]).replace(/^[^[]*/, ""))[0].results[0].value;
  ok("database holds a salted hash, not the code", /^[0-9a-f]{24}:[0-9a-f]{64}$/.test(stored) && !stored.toLowerCase().includes("owner-set"), stored);
  const audit = JSON.parse(wrangler(["d1", "execute", "vibin-db", "--local", "--persist-to", STATE, "--command", "SELECT COUNT(*) AS n FROM audit_log WHERE action='preview_access.set'", "--json"]).replace(/^[^[]*/, ""))[0].results[0].n;
  ok("setting the code is audited", audit === 1, audit);
  console.log(`  (waiting ${CACHE_WAIT / 1000}s for the worker's settings cache)`);
  await sleep(CACHE_WAIT);
  r = await req("POST", "/api/access", { json: { code: "owner-set-4321" } });
  ok("the code the owner set opens the site", r.status === 200 && /vibin_preview=/.test(r.setCookie), r.status);
  const pass3 = r.setCookie.split(";")[0];
  r = await req("GET", "/", { cookie: pass3 });
  ok("…and the page loads with that pass", r.status === 200 && !r.text.includes("Binnenkort beschikbaar"), r.status);
  r = await adminCall("PUT", "/api/admin/cc/settings", { key: "preview_access_code", value: "" });
  ok("owner clears the code", r.status === 200, r);
  r = await adminCall("GET", "/api/admin/cc/settings");
  ok("settings say no code is set", r.data?.previewAccessSet === false, r.data);
  await sleep(CACHE_WAIT);
  r = await req("GET", "/", { cookie: pass3 });
  ok("the old pass stops working after clearing", r.status === 503, r.status);
}

try {
  await main();
} catch (e) {
  fail++;
  console.error("✗ suite crashed:", e);
} finally {
  stop();
  fs.rmSync(STATE, { recursive: true, force: true });
}
console.log(`\n${fail === 0 ? "✔" : "✘"} ${pass} geslaagd, ${fail} mislukt`);
process.exit(fail === 0 ? 0 : 1);
