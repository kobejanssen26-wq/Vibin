/**
 * Developer accounts (RBAC) + admin File Manager — end-to-end on a throw-away local D1, `wrangler dev`
 * and a mock GitHub API.
 *
 *   node tests/developer-access.mjs          (repo root; no .dev.vars needed, vars are passed on the command line)
 *
 * Covers: invite link -> account + authenticator -> developer session · what a developer can and can't
 * reach (default deny, owner-only areas, per-permission areas) · the owner can never be changed or
 * downgraded and nobody edits their own access · a delegated manager can only hand out what they hold ·
 * removing access kills the session at once · File Manager: listing/reading/saving through GitHub,
 * protected & sensitive files, traversal attempts, stale-version conflicts, owner-only files ·
 * maintenance (coming-soon) bypass for signed-in staff.
 */
import { spawn, execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { createMockGitHub } from "./helpers/mock-github.mjs";

const PORT = Number(process.env.PORT ?? 8799);
const MOCK_PORT = Number(process.env.MOCK_PORT ?? 9931);
const BASE = `http://127.0.0.1:${PORT}`;
const STATE = fs.mkdtempSync(path.join(os.tmpdir(), "vibin-devaccess-"));
const IS_WIN = process.platform === "win32";

let pass = 0;
let fail = 0;
const ok = (name, cond, extra) => {
  if (cond) {
    pass++;
    console.log("  ✓", name);
  } else {
    fail++;
    console.error("  ✗", name, extra !== undefined ? `\n      ${JSON.stringify(extra).slice(0, 600)}` : "");
  }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function wrangler(args) {
  return execFileSync(IS_WIN ? "npx.cmd" : "npx", ["wrangler", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], shell: IS_WIN });
}
const sql = (command) => wrangler(["d1", "execute", "vibin-db", "--local", "--persist-to", STATE, "--json", "--command", command]);
const rows = (command) => {
  const out = sql(command);
  return JSON.parse(out.slice(out.indexOf("[")))[0].results;
};

const { mock, repo, calls, commits } = createMockGitHub();

/* ----------------------------- http / sessions ---------------------------- */
class Client {
  constructor() {
    this.jar = new Map();
  }
  async call(method, p, body) {
    const headers = { connection: "close", "content-type": "application/json" };
    if (this.jar.size) headers.cookie = [...this.jar].map(([k, v]) => `${k}=${v}`).join("; ");
    if (method !== "GET" && this.jar.get("vibin_admin_csrf")) headers["x-vibin-admin-csrf"] = this.jar.get("vibin_admin_csrf");
    const res = await fetch(BASE + p, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    for (const line of res.headers.getSetCookie?.() ?? []) {
      const seg = line.split(";")[0];
      const i = seg.indexOf("=");
      this.jar.set(seg.slice(0, i), seg.slice(i + 1));
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
}
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

let server;
function stop() {
  try {
    mock.close();
  } catch {
    /* closed */
  }
  if (!server) return;
  try {
    if (IS_WIN) execFileSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore" });
    else process.kill(-server.pid, "SIGTERM");
  } catch {
    /* gone */
  }
}

const CC = "/api/admin/cc";
const PW = "correct-horse-battery-1";

/** Accept an invitation as a brand-new person and finish authenticator enrolment. */
async function joinViaInvite(owner, email, permissions, displayName) {
  const inv = await owner.call("POST", `${CC}/team/invite`, permissions ? { email, permissions } : { email });
  const token = inv.data?.link?.split("/").pop();
  const dev = new Client();
  const acc = await dev.call("POST", "/api/admin/auth/invite/accept", { token, password: PW, displayName });
  const enr = await dev.call("GET", "/api/admin/auth/mfa/enroll");
  const conf = await dev.call("POST", "/api/admin/auth/mfa/enroll/confirm", { code: totp(enr.data.secret) });
  return { dev, inv, token, acc, enr, conf };
}

async function main() {
  console.log("• migrating throw-away local D1 …");
  wrangler(["d1", "migrations", "apply", "vibin-db", "--local", "--persist-to", STATE]);
  await new Promise((r) => mock.listen(MOCK_PORT, "127.0.0.1", r));

  console.log("• starting wrangler dev on", BASE);
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

  /* ------------------------------ owner setup ------------------------------ */
  console.log("\n[A] owner");
  const owner = new Client();
  let r = await owner.call("POST", "/api/admin/auth/setup/begin", { email: "owner@test.local", password: PW });
  r = await owner.call("POST", "/api/admin/auth/mfa/enroll/confirm", { code: totp(r.data.secret) });
  ok("owner setup + authenticator", r.status === 200);
  r = await owner.call("GET", "/api/admin/auth/session");
  const ownerId = r.data.user?.id;
  ok("owner session is ready, role owner, permissions *", r.data.stage === "ready" && r.data.user.role === "owner" && r.data.user.permissions?.[0] === "*");
  r = await owner.call("GET", `${CC}/team`);
  ok("owner sees the team (only themselves so far)", r.status === 200 && r.data.members.length === 1 && r.data.members[0].role === "owner" && r.data.members[0].manageable === false);

  /* -------------------------------- invite -------------------------------- */
  console.log("\n[B] invitation → developer account");
  r = await owner.call("POST", `${CC}/team/invite`, { email: "owner@test.local" });
  ok("can't invite the owner's own address", r.status === 400);
  r = await owner.call("POST", `${CC}/team/invite`, { email: "dev.a@test.local", permissions: ["catalogue", "files.read", "nonsense"] });
  ok("invite creates a link (no email sent)", r.status === 200 && /\/admin\/invite\/[\w-]{64}$/.test(r.data.link ?? ""));
  const tokenA = r.data.link.split("/").pop();
  const anon = new Client();
  r = await anon.call("GET", `/api/admin/auth/invite/${tokenA}`);
  ok("invite peek: email + no existing account + unknown permission dropped", r.status === 200 && r.data.email === "dev.a@test.local" && r.data.accountExists === false && JSON.stringify(r.data.permissions) === '["catalogue","files.read"]', r.data);
  r = await anon.call("GET", `/api/admin/auth/invite/${"a".repeat(64)}`);
  ok("unknown invite token is rejected", r.status === 401);
  r = await anon.call("POST", "/api/admin/auth/invite/accept", { token: tokenA, password: "short" });
  ok("weak password is refused", r.status === 400);

  const devA = new Client();
  r = await devA.call("POST", "/api/admin/auth/invite/accept", { token: tokenA, password: PW, displayName: "Dev A" });
  ok("accepting creates the account and starts a pending admin session", r.status === 200 && r.data.next === "enroll");
  r = await devA.call("GET", "/api/admin/auth/session");
  ok("developer session: stage enroll, role developer", r.data.stage === "enroll" && r.data.user.role === "developer");
  const devAId = r.data.user.id;
  r = await devA.call("GET", `${CC}/files/config`);
  ok("no access before the authenticator step (403)", r.status === 403);
  r = await devA.call("GET", "/api/admin/auth/mfa/enroll");
  const secretA = r.data.secret;
  r = await devA.call("POST", "/api/admin/auth/mfa/enroll/confirm", { code: totp(secretA) });
  ok("developer completes authenticator enrolment", r.status === 200 && Array.isArray(r.data.recoveryCodes));
  r = await devA.call("GET", "/api/admin/auth/session");
  ok("developer session is ready with the invited permissions", r.data.stage === "ready" && JSON.stringify(r.data.user.permissions) === '["catalogue","files.read"]', r.data);
  r = await anon.call("POST", "/api/admin/auth/invite/accept", { token: tokenA, password: PW });
  ok("an invitation link works only once", r.status === 401);

  /* -------------------------- what a developer reaches -------------------- */
  console.log("\n[C] developer reach (catalogue + files.read)");
  for (const [p, label] of [
    ["/activities?pageSize=1", "activities (catalogue)"],
    ["/categories", "categories (catalogue)"],
  ]) {
    r = await devA.call("GET", CC + p);
    ok(`allowed: ${label}`, r.status === 200, r.status);
  }
  for (const p of ["/overview", "/users", "/groups", "/settings", "/vault", "/outreach/orgs", "/swipe/queue", "/flags", "/audit", "/system", "/providers", "/stats", "/support/tickets", "/events", "/team", "/quality/shared-emails", "/anything-new"]) {
    r = await devA.call("GET", CC + p);
    ok(`denied (403): ${p}`, r.status === 403, r.status);
  }
  r = await devA.call("POST", `${CC}/users/${ownerId}/status`, { status: "suspended" });
  ok("a developer can't suspend the owner (403)", r.status === 403);
  r = await devA.call("GET", "/api/admin/auth/sessions");
  ok("owner-only session list is closed to developers", r.status === 403);
  r = await devA.call("PUT", `${CC}/settings`, { maintenance_mode: "0" });
  ok("settings are closed to developers", r.status === 403);

  r = await new Client().call("GET", `${CC}/files/list`);
  ok("File Manager needs a session (401)", r.status === 401);
  const normal = new Client();
  r = await normal.call("POST", "/api/auth/signup", { email: "plain@test.local", password: PW, displayName: "Plain User" });
  ok("normal user signup works", r.status === 201);
  r = await normal.call("GET", `${CC}/files/list`);
  ok("a normal user session is not an admin (401)", r.status === 401);

  /* ------------------------------ File Manager ----------------------------- */
  console.log("\n[D] File Manager (developer with files.read)");
  r = await devA.call("GET", `${CC}/files/config`);
  ok("config: configured, repo/branch shown, token never shown, read-only", r.status === 200 && r.data.configured && r.data.repo === "acme/vibin" && r.data.branch === "main" && r.data.canWrite === false && !r.text.includes("test-token"));
  r = await devA.call("GET", `${CC}/files/list`);
  const names = (r.data?.entries ?? []).map((e) => e.name);
  ok("root listing shows folders first and hides .env / .dev.vars", r.status === 200 && names.includes("README.md") && names.includes("src") && !names.includes(".env") && !names.includes(".dev.vars") && r.data.entries[0].type === "dir", names);
  r = await devA.call("GET", `${CC}/files/list?path=config`);
  ok("sensitive file (*.pem) hidden inside a folder", r.status === 200 && r.data.entries.length === 0, r.data);
  r = await devA.call("GET", `${CC}/files/list?path=src/worker`);
  ok("navigate into a folder", r.status === 200 && r.data.entries.some((e) => e.name === "lib" && e.type === "dir") && r.data.entries.some((e) => e.name === "index.ts" && e.ownerOnly === true));
  r = await devA.call("GET", `${CC}/files/read?path=README.md`);
  ok("read a text file: content + sha, not editable without files.write", r.status === 200 && r.data.kind === "text" && r.data.content.includes("hello") && /^[0-9a-f]{40}$/.test(r.data.sha) && r.data.canEdit === false, r.data);
  r = await devA.call("GET", `${CC}/files/read?path=public/logo.png`);
  ok("binary files are not shown", r.status === 200 && r.data.kind === "binary" && r.data.content === null);
  r = await devA.call("GET", `${CC}/files/read?path=big/huge.txt`);
  ok("oversized files are not opened in the editor", r.status === 200 && r.data.kind === "too_large");
  r = await devA.call("GET", `${CC}/files/read?path=does/not/exist.ts`);
  ok("missing file → 404", r.status === 404);
  for (const bad of [".env", ".dev.vars", "config/server.pem", ".git/config", "node_modules/x/y.js", "src/../.env", "../etc/passwd", "..%2f..%2fetc%2fpasswd", "%2e%2e/x", "src//x", "/etc/passwd", "src\\worker\\index.ts", ".env%00.txt"]) {
    r = await devA.call("GET", `${CC}/files/read?path=${encodeURIComponent(bad)}`);
    ok(`blocked read: ${JSON.stringify(bad)}`, r.status === 400 || r.status === 403, r.status);
  }
  r = await devA.call("GET", `${CC}/files/read?path=${bad2()}`);
  ok("blocked read: raw percent-encoded traversal", r.status === 400 || r.status === 403 || r.status === 404, r.status);
  ok("the mock GitHub was never asked for a secret or an outside path", !calls.some((c) => /\.env|dev\.vars|\.pem|passwd|\.git\/|node_modules/.test(c)), calls.filter((c) => /\.env|dev\.vars|\.pem|passwd|\.git\/|node_modules/.test(c)));
  r = await devA.call("PUT", `${CC}/files/write`, { path: "docs/guide.md", content: "hacked", sha: "0".repeat(40) });
  ok("saving without files.write is refused (403)", r.status === 403);

  /* ------------------------------ permissions ------------------------------ */
  console.log("\n[E] owner changes permissions");
  r = await owner.call("PATCH", `${CC}/team/developers/${devAId}`, { permissions: ["catalogue", "files.write"] });
  ok("owner grants files.write (read is implied)", r.status === 200 && JSON.stringify(r.data.permissions) === '["catalogue","files.read","files.write"]', r.data);
  r = await devA.call("GET", `${CC}/files/read?path=docs/guide.md`);
  ok("new permission applies immediately, file is editable", r.data.canEdit === true);
  const guideSha = r.data.sha;
  r = await devA.call("PUT", `${CC}/files/write`, { path: "docs/guide.md", content: "# Guide\nedited by a developer ✓\n", sha: guideSha, message: "Improve guide" });
  ok("save succeeds and returns the new sha + commit", r.status === 200 && r.data.ok && r.data.sha && r.data.commit?.sha, r.data);
  ok("a commit reached the repository on main", commits.length === 1 && commits[0].path === "docs/guide.md" && commits[0].branch === "main" && commits[0].message.startsWith("Improve guide") && /developer/.test(commits[0].message), commits);
  ok("the saved content is stored as UTF-8", repo.get("docs/guide.md").content.toString("utf8") === "# Guide\nedited by a developer ✓\n");
  r = await devA.call("PUT", `${CC}/files/write`, { path: "docs/guide.md", content: "second", sha: guideSha });
  ok("a stale version can't overwrite newer work (409)", r.status === 409);
  r = await devA.call("GET", `${CC}/files/read?path=docs/guide.md`);
  const fresh = r.data.sha;
  r = await devA.call("PUT", `${CC}/files/write`, { path: "docs/guide.md", content: "second", sha: fresh });
  ok("with the fresh version the save works", r.status === 200);
  for (const p of ["src/worker/index.ts", "src/worker/lib/admin-rbac.ts"]) {
    const rd = await devA.call("GET", `${CC}/files/read?path=${p}`);
    ok(`owner-only file is shown read-only to developers: ${p}`, rd.data.ownerOnly === true && rd.data.canEdit === false);
    r = await devA.call("PUT", `${CC}/files/write`, { path: p, content: "// pwned\n", sha: rd.data.sha });
    ok(`developer can't change protected file: ${p}`, r.status === 403);
  }
  for (const p of [".env", ".dev.vars", "../x", "new/file.ts"]) {
    r = await devA.call("PUT", `${CC}/files/write`, { path: p, content: "x", sha: "a".repeat(40) });
    ok(`developer can't write ${JSON.stringify(p)}`, r.status === 400 || r.status === 403 || r.status === 404, r.status);
  }
  r = await devA.call("PUT", `${CC}/files/write`, { path: "README.md", content: "y".repeat(401_000), sha: "a".repeat(40) });
  ok("oversized save is refused", r.status === 400);
  r = await devA.call("PUT", `${CC}/files/write`, { path: "README.md", content: "z" });
  ok("a save without a file version is refused", r.status === 400);
  r = await new Client().call("PUT", `${CC}/files/write`, { path: "README.md", content: "z", sha: "a".repeat(40) });
  ok("saving without a session is refused", r.status === 401);
  // CSRF: a signed-in developer without the admin CSRF header cannot write.
  {
    const cookie = [...devA.jar].map(([k, v]) => `${k}=${v}`).join("; ");
    const res = await fetch(`${BASE}${CC}/files/write`, { method: "PUT", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ path: "README.md", content: "csrf", sha: repo.get("README.md").sha }) });
    ok("a save without the admin CSRF token is refused (403)", res.status === 403);
  }
  const rdOwner = await owner.call("GET", `${CC}/files/read?path=src/worker/index.ts`);
  ok("the owner may edit protected files", rdOwner.data.canEdit === true);
  r = await owner.call("PUT", `${CC}/files/write`, { path: "src/worker/index.ts", content: "// owner edit\n", sha: rdOwner.data.sha });
  ok("owner saves a protected file", r.status === 200 && commits.at(-1).path === "src/worker/index.ts");
  r = await owner.call("GET", `${CC}/audit?action=files.write`);
  ok("saves are in the audit log", r.status === 200 && JSON.stringify(r.data).includes("files.write"), r.status);

  /* ----------------------- team management and escalation ------------------ */
  console.log("\n[F] owner protection + privilege escalation attempts");
  r = await devA.call("POST", `${CC}/team/invite`, { email: "x@test.local" });
  ok("developer without team.manage can't invite (403)", r.status === 403);
  r = await devA.call("PATCH", `${CC}/team/developers/${devAId}`, { permissions: ["team.manage", "files.write", "catalogue", "support", "events"] });
  ok("developer can't promote themselves (403)", r.status === 403);
  r = await devA.call("PATCH", `${CC}/team/developers/${ownerId}`, { permissions: [] });
  ok("developer can't touch the owner (403)", r.status === 403);

  r = await owner.call("PATCH", `${CC}/team/developers/${devAId}`, { permissions: ["catalogue", "files.write", "team.manage"] });
  ok("owner explicitly authorises dev A to manage developers", r.status === 200);
  r = await devA.call("GET", `${CC}/team`);
  ok("delegated manager sees the team; owner row is never manageable", r.status === 200 && r.data.members.find((m) => m.role === "owner").manageable === false && r.data.assignable.includes("catalogue") && !r.data.assignable.includes("team.manage") && !r.data.assignable.includes("support"), r.data);
  for (const [method, body] of [["PATCH", { permissions: ["catalogue"] }], ["DELETE", undefined]]) {
    r = await devA.call(method, `${CC}/team/developers/${ownerId}`, body);
    ok(`manager can't ${method === "DELETE" ? "remove" : "edit"} the owner (403)`, r.status === 403);
  }
  r = await devA.call("DELETE", `${CC}/team/developers/${devAId}`);
  ok("nobody removes their own access (403)", r.status === 403);
  r = await devA.call("PATCH", `${CC}/team/developers/${devAId}`, { permissions: ["catalogue"] });
  ok("nobody edits their own permissions (403)", r.status === 403);
  r = await devA.call("POST", `${CC}/team/invite`, { email: "dev.b@test.local", permissions: ["team.manage"] });
  ok("manager can't hand out team.manage (403)", r.status === 403);
  r = await devA.call("POST", `${CC}/team/invite`, { email: "dev.b@test.local", permissions: ["support"] });
  ok("manager can't hand out permissions they don't hold (403)", r.status === 403);
  r = await devA.call("POST", `${CC}/team/invite`, { email: "owner@test.local", permissions: ["catalogue"] });
  ok("manager can't invite the owner's address (400)", r.status === 400);

  // an existing normal account is added directly
  r = await devA.call("POST", `${CC}/team/developers`, { email: "nobody@test.local", permissions: ["catalogue"] });
  ok("adding an address without an account → 404", r.status === 404);
  r = await devA.call("POST", `${CC}/team/developers`, { email: "plain@test.local", permissions: ["catalogue"] });
  ok("manager adds an existing account as developer (subset of own permissions)", r.status === 200, r.data);
  const plainId = r.data.id;
  r = await devA.call("PATCH", `${CC}/team/developers/${plainId}`, { permissions: ["catalogue", "files.write"] });
  ok("manager may grant a permission they hold", r.status === 200);
  r = await devA.call("PATCH", `${CC}/team/developers/${plainId}`, { permissions: ["support"] });
  ok("manager can't grant what they don't hold (403)", r.status === 403);
  r = await devA.call("PATCH", `${CC}/team/developers/${plainId}`, { permissions: ["team.manage"] });
  ok("manager can't promote a peer to manager (403)", r.status === 403);
  r = await owner.call("PATCH", `${CC}/team/developers/${plainId}`, { permissions: ["catalogue", "team.manage"] });
  ok("owner can make someone a manager", r.status === 200);
  r = await devA.call("DELETE", `${CC}/team/developers/${plainId}`);
  ok("a manager can't remove another manager (403)", r.status === 403);
  r = await devA.call("PATCH", `${CC}/team/developers/${plainId}`, { permissions: [] });
  ok("a manager can't edit another manager (403)", r.status === 403);

  // existing account invited via link: must prove the password
  r = await owner.call("POST", `${CC}/team/invite`, { email: "carol@test.local" });
  const carolSignup = await new Client().call("POST", "/api/auth/signup", { email: "carol@test.local", password: PW, displayName: "Carol" });
  const carolTok = r.data.link.split("/").pop();
  r = await anon.call("GET", `/api/admin/auth/invite/${carolTok}`);
  ok("invite for an existing account says so", r.data?.accountExists === true, r.data);
  r = await new Client().call("POST", "/api/admin/auth/invite/accept", { token: carolTok, password: "not-her-password-1" });
  ok("existing account needs its real password", r.status === 401 && carolSignup.status === 201);
  r = await new Client().call("POST", "/api/admin/auth/invite/accept", { token: carolTok, password: PW });
  ok("…and then becomes a developer", r.status === 200);
  r = await owner.call("GET", `${CC}/team`);
  ok("owner's list: owner + 3 developers, one pending list entry cleared", r.data.members.filter((m) => m.role === "developer").length === 3 && r.data.invites.length === 0, r.data.members.map((m) => m.email));

  // revoked invitation
  r = await owner.call("POST", `${CC}/team/invite`, { email: "late@test.local" });
  const lateTok = r.data.link.split("/").pop();
  const lateId = r.data.id;
  r = await owner.call("DELETE", `${CC}/team/invites/${lateId}`);
  ok("owner revokes an invitation", r.status === 200);
  r = await new Client().call("POST", "/api/admin/auth/invite/accept", { token: lateTok, password: PW });
  ok("a revoked invitation can't be used", r.status === 401);

  /* ---------------------------- maintenance bypass -------------------------- */
  console.log("\n[G] coming-soon mode");
  sql("INSERT INTO system_settings (key, value) VALUES ('maintenance_mode', '1') ON CONFLICT(key) DO UPDATE SET value = excluded.value;");
  await sleep(16_000); // the worker caches maintenance settings for 15 s
  r = await anon.call("GET", "/api/status");
  ok("public visitors see the coming-soon state", r.data?.maintenance === true);
  r = await devA.call("GET", "/api/status");
  ok("a signed-in developer (admin session + MFA) sees the real site", r.data?.maintenance === false && r.data?.preview === true, r.data);
  r = await owner.call("GET", "/api/status");
  ok("so does the owner", r.data?.maintenance === false);
  const pending = new Client();
  await pending.call("POST", "/api/admin/auth/login", { email: "dev.a@test.local", password: PW });
  r = await pending.call("GET", "/api/status");
  ok("password step alone (no MFA) is not enough", r.data?.maintenance === true, r.data);

  /* ------------------------------ remove access ---------------------------- */
  console.log("\n[H] removing a developer");
  r = await owner.call("DELETE", `${CC}/team/developers/${devAId}`);
  ok("owner removes developer access", r.status === 200);
  r = await devA.call("GET", `${CC}/files/config`);
  ok("their existing admin session stops working at once", r.status === 403 || r.status === 401, r.status);
  r = await devA.call("GET", "/api/status");
  ok("…and the maintenance bypass is gone", r.data?.maintenance === true);
  r = await new Client().call("POST", "/api/admin/auth/login", { email: "dev.a@test.local", password: PW });
  ok("admin sign-in is refused for them now", r.status === 401);
  sql("INSERT INTO system_settings (key, value) VALUES ('maintenance_mode', '0') ON CONFLICT(key) DO UPDATE SET value = excluded.value;");
  await sleep(16_000);
  r = await new Client().call("POST", "/api/auth/login", { email: "dev.a@test.local", password: PW });
  ok("their normal VIBIN account still works", r.status === 200, r.status);
  const u = rows("SELECT email, role FROM users ORDER BY email");
  ok("owner row unchanged; removed developer is a plain user again", u.find((x) => x.email === "owner@test.local")?.role === "owner" && u.find((x) => x.email === "dev.a@test.local")?.role === "user", u);
  ok("exactly one owner exists", u.filter((x) => x.role === "owner").length === 1);
  r = await owner.call("GET", `${CC}/audit?action=team.permissions_changed`);
  ok("team changes are audited", r.status === 200 && JSON.stringify(r.data).includes("team.permissions_changed"));
}

function bad2() {
  return "%252e%252e%252fsecrets";
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
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
