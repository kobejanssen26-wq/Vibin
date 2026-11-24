/**
 * Developer access + File Manager — real-browser check (Chromium via Playwright). Needs `npm run build` first.
 *
 *   node tests/developer-access-ui.mjs
 *
 * Boots a throw-away local D1, a mock GitHub and `wrangler dev`; signs in as owner through the API, then drives the
 * pages like a person: invite a developer on the Team page, accept the invitation in a second browser, enrol an
 * authenticator, check the developer only sees what they may, open/edit/save files in the editor, the unsaved-changes
 * warning, syntax highlighting and a phone-sized screen. Screenshots go to SHOTS (default: tmp).
 */
import { spawn, execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { createMockGitHub } from "./helpers/mock-github.mjs";

const require = createRequire(path.join(process.cwd(), "package.json"));
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  ({ chromium } = require("/usr/lib/node_modules/playwright"));
}

const PORT = Number(process.env.PORT ?? 8813);
const MOCK_PORT = Number(process.env.MOCK_PORT ?? 9932);
const BASE = `http://127.0.0.1:${PORT}`;
const STATE = fs.mkdtempSync(path.join(os.tmpdir(), "vibin-devui-"));
const SHOTS = process.env.SHOTS ?? fs.mkdtempSync(path.join(os.tmpdir(), "vibin-devui-shots-"));
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const w = (a) => execFileSync(IS_WIN ? "npx.cmd" : "npx", ["wrangler", ...a], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], shell: IS_WIN });

const { mock, repo, commits } = createMockGitHub();

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const totp = (s) => {
  let bits = "";
  for (const c of s) bits += B32.indexOf(c).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const buf = Buffer.alloc(8);
  buf.writeBigInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const h = createHmac("sha1", key).update(buf).digest();
  const o = h[19] & 15;
  return String((((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1e6).padStart(6, "0");
};

let server;
const stop = () => {
  try {
    mock.close();
  } catch {
    /* closed */
  }
  try {
    if (IS_WIN) execFileSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore" });
    else process.kill(-server.pid, "SIGTERM");
  } catch {
    /* gone */
  }
};

async function api(jar, method, p, body) {
  const headers = { "content-type": "application/json", connection: "close" };
  if (jar.size) headers.cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  if (method !== "GET" && jar.get("vibin_admin_csrf")) headers["x-vibin-admin-csrf"] = jar.get("vibin_admin_csrf");
  const res = await fetch(BASE + p, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  for (const line of res.headers.getSetCookie?.() ?? []) {
    const seg = line.split(";")[0];
    const i = seg.indexOf("=");
    jar.set(seg.slice(0, i), seg.slice(i + 1));
  }
  return { status: res.status, data: await res.json().catch(() => null) };
}

async function main() {
  console.log("• migrating throw-away local D1 …");
  w(["d1", "migrations", "apply", "vibin-db", "--local", "--persist-to", STATE]);
  await new Promise((r) => mock.listen(MOCK_PORT, "127.0.0.1", r));
  const vars = [
    "APP_ENV:development",
    `APP_URL:${BASE}`,
    "ENCRYPTION_KEY:ZGV2LW9ubHktMzItYnl0ZS1rZXktZG8tbm90LXNoaXA=",
    "GITHUB_TOKEN:test-token",
    "GITHUB_REPO:acme/vibin",
    "GITHUB_BRANCH:main",
    `GITHUB_API_BASE:http://127.0.0.1:${MOCK_PORT}`,
  ].flatMap((v) => ["--var", v]);
  server = spawn(IS_WIN ? "npx.cmd" : "npx", ["wrangler", "dev", "--port", String(PORT), "--persist-to", STATE, ...vars], {
    stdio: "ignore",
    shell: IS_WIN,
    detached: !IS_WIN,
  });
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

  // owner through the API, then hand the cookies to the browser
  const ownerJar = new Map();
  const r = await api(ownerJar, "POST", "/api/admin/auth/setup/begin", { email: "owner@test.local", password: "correct-horse-battery-1" });
  await api(ownerJar, "POST", "/api/admin/auth/mfa/enroll/confirm", { code: totp(r.data.secret) });

  const browser = await chromium.launch();
  const cookiesFor = (jar) => [...jar].map(([name, value]) => ({ name, value, url: BASE }));

  /* ------------------------------- owner: Team ------------------------------ */
  console.log("\n[1] owner → Team / Developers");
  const octx = await browser.newContext({ viewport: { width: 1366, height: 860 } });
  await octx.addCookies(cookiesFor(ownerJar));
  const op = await octx.newPage();
  const errors = [];
  op.on("pageerror", (e) => errors.push(e.message));
  op.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await op.goto(`${BASE}/admin/team`);
  await op.getByRole("heading", { name: "Team / Developers" }).waitFor();
  ok("Team page opens for the owner", true);
  ok("owner is listed and can't be edited", (await op.getByText("Owner", { exact: true }).count()) > 0 && (await op.getByRole("button", { name: "Remove" }).count()) === 0);
  await op.getByPlaceholder("developer@example.com").fill("dev.ui@test.local");
  ok("files:edit and manage-developers start unticked", !(await op.getByLabel(/Files: edit/).isChecked()) && !(await op.getByLabel(/Manage developers/).isChecked()));
  await op.getByRole("button", { name: "Create invite link" }).click();
  const linkEl = op.locator("code", { hasText: "/admin/invite/" });
  await linkEl.waitFor();
  const link = (await linkEl.innerText()).trim();
  ok("an invitation link is shown", /\/admin\/invite\/[\w-]{64}$/.test(link), link);
  ok("the pending invitation is listed", (await op.getByText("dev.ui@test.local").count()) > 0);
  await op.screenshot({ path: path.join(SHOTS, "team-owner.png"), fullPage: true });

  /* ----------------------- developer: accept + authenticator ---------------- */
  console.log("\n[2] developer accepts the invitation");
  const dctx = await browser.newContext({ viewport: { width: 1366, height: 860 } });
  const dp = await dctx.newPage();
  dp.on("pageerror", (e) => errors.push(e.message));
  await dp.goto(link);
  await dp.getByRole("heading", { name: "Join the VIBIN team" }).waitFor();
  ok("invitation page shows the invited address", (await dp.getByText("dev.ui@test.local").count()) > 0);
  await dp.getByLabel("Your name").fill("Dev UI");
  await dp.getByLabel("Choose a password").fill("correct-horse-battery-1");
  await dp.screenshot({ path: path.join(SHOTS, "invite.png") });
  await dp.getByRole("button", { name: "Accept and continue" }).click();
  await dp.getByText("Enrol two-factor").waitFor();
  ok("after accepting, the authenticator step follows", true);
  const secret = (await dp.locator("code").first().innerText()).trim();
  await dp.getByPlaceholder("123456").fill(totp(secret));
  await dp.getByRole("button", { name: "Confirm" }).click();
  await dp.getByText("Two-factor enabled").waitFor();
  await dp.getByRole("button", { name: "I've saved them" }).click();
  await dp.getByRole("heading", { name: /Welcome, Dev UI/ }).waitFor();
  ok("developer lands on their own dashboard", true);
  const nav = (await dp.locator("aside").innerText()).replace(/\s+/g, " ");
  ok("sidebar shows only permitted areas", /File Manager/.test(nav) && /Activities/.test(nav) && !/Users/.test(nav) && !/Settings/.test(nav) && !/Credential vault/.test(nav) && !/Outreach/.test(nav) && !/Team \/ Developers/.test(nav) && !/Swipe/.test(nav), nav);
  await dp.screenshot({ path: path.join(SHOTS, "dev-dashboard.png") });
  await dp.goto(`${BASE}/admin/users`);
  await dp.getByText("No access").waitFor();
  ok("typing an owner-only address shows 'No access'", true);
  const apiBlocked = await dp.evaluate(async () => (await fetch("/api/admin/cc/users")).status);
  ok("…and the API itself says 403", apiBlocked === 403, apiBlocked);

  /* -------------------- developer: read-only File Manager ------------------- */
  console.log("\n[3] developer (view only) in the File Manager");
  await dp.goto(`${BASE}/admin/files`);
  await dp.getByRole("heading", { name: "File Manager" }).waitFor();
  await dp.getByText("View only").waitFor();
  await dp.getByRole("treeitem", { name: "README.md" }).click();
  await dp.locator(".cm-content").waitFor();
  ok("a file opens in the editor", (await dp.locator(".cm-content").innerText()).includes("hello"));
  ok("read-only: no Save button, 'Read-only' badge", (await dp.getByRole("button", { name: "Save", exact: true }).count()) === 0 && (await dp.getByText("Read-only").count()) > 0);
  ok("environment files are not in the tree", (await dp.getByRole("treeitem", { name: ".env" }).count()) === 0);
  await dp.getByRole("treeitem", { name: "src" }).click();
  await dp.getByRole("treeitem", { name: "worker" }).click();
  await dp.getByRole("treeitem", { name: /index\.ts/ }).click();
  await dp.getByText("Owner-only file").waitFor();
  ok("protected files are marked owner-only", true);
  await dctx.close();

  /* ------------------------- owner: edit + save + warning ------------------- */
  console.log("\n[4] owner edits and saves");
  await op.goto(`${BASE}/admin/files`);
  await op.getByRole("heading", { name: "File Manager" }).waitFor();
  await op.getByRole("treeitem", { name: "README.md" }).click();
  await op.locator(".cm-content").waitFor();
  const dialogs = [];
  op.on("dialog", async (d) => {
    dialogs.push(d.message());
    await d.dismiss();
  });
  await op.locator(".cm-content").click();
  await op.keyboard.press("Control+End");
  await op.keyboard.type("EDITED-BY-TEST");
  await op.getByText("● Unsaved").waitFor();
  ok("typing marks the file as unsaved (dot + status)", (await op.getByLabel("Unsaved changes").count()) > 0);
  await op.getByRole("treeitem", { name: "docs" }).click();
  await op.getByRole("treeitem", { name: "guide.md" }).click();
  await sleep(300);
  ok("opening another file asks before discarding", dialogs.some((d) => /unsaved/i.test(d)), dialogs);
  ok("…and stays on README.md when you say no", (await op.locator(".cm-content").innerText()).includes("EDITED-BY-TEST"));
  await op.getByRole("link", { name: "Dashboard" }).click();
  await sleep(300);
  ok("leaving the page asks too (in-app navigation)", dialogs.filter((d) => /unsaved/i.test(d)).length >= 2 && op.url().endsWith("/admin/files"), { n: dialogs.length, url: op.url() });
  await op.locator(".cm-content").click();
  await op.keyboard.press("Control+s");
  await op.getByText(/Saved to main/).waitFor();
  ok("Ctrl+S saves and says which branch/commit", true);
  ok("a commit with the new content reached the repository", commits.at(-1)?.path === "README.md" && repo.get("README.md").content.toString().includes("EDITED-BY-TEST"), commits.at(-1));
  ok("status bar is back to Saved", (await op.getByText("Saved", { exact: true }).count()) > 0);
  await op.getByRole("treeitem", { name: "guide.md" }).click();
  await sleep(400);
  ok("after saving, switching files doesn't warn again", dialogs.length === 2, dialogs);

  console.log("\n[5] syntax highlighting");
  await op.getByRole("treeitem", { name: "src" }).click();
  await op.getByRole("treeitem", { name: "client" }).click();
  await op.getByRole("treeitem", { name: "pages" }).click();
  await op.getByRole("treeitem", { name: "Home.tsx" }).click();
  await op.getByText("TypeScript JSX").waitFor();
  const coloured = await op.evaluate(() => {
    const spans = [...document.querySelectorAll(".cm-content .cm-line span")];
    return new Set(spans.map((s) => getComputedStyle(s).color)).size;
  });
  ok("TSX is highlighted (several token colours)", coloured >= 3, coloured);
  await op.screenshot({ path: path.join(SHOTS, "files-desktop.png") });

  /* --------------------------------- phone ---------------------------------- */
  console.log("\n[6] phone-sized screen");
  const mctx = await browser.newContext({ viewport: { width: 390, height: 800 }, deviceScaleFactor: 2 });
  await mctx.addCookies(cookiesFor(ownerJar));
  const mp = await mctx.newPage();
  await mp.goto(`${BASE}/admin/files`);
  await mp.getByRole("heading", { name: "File Manager" }).waitFor();
  const fits = await mp.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  ok("no horizontal page scroll on a phone", fits);
  await mp.getByRole("button", { name: "Open file list" }).click();
  await mp.getByRole("treeitem", { name: "README.md" }).click();
  await mp.locator(".cm-content").waitFor();
  ok("the file list is a drawer that closes after choosing a file", (await mp.getByRole("button", { name: "Close file list" }).count()) === 0);
  await mp.screenshot({ path: path.join(SHOTS, "files-phone.png") });
  await mp.goto(`${BASE}/admin/team`);
  await mp.getByRole("heading", { name: "Team / Developers" }).waitFor();
  ok("Team page fits a phone", await mp.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await mp.screenshot({ path: path.join(SHOTS, "team-phone.png"), fullPage: true });

  ok("no page errors in the browser console", errors.length === 0, errors.slice(0, 5));
  await browser.close();
}

try {
  await main();
} catch (e) {
  fail++;
  console.error("\nTEST CRASHED:", e);
} finally {
  stop();
  fs.rmSync(STATE, { recursive: true, force: true });
}
console.log(`\n${pass} passed, ${fail} failed — screenshots in ${SHOTS}`);
process.exit(fail ? 1 : 0);
