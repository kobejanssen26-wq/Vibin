/**
 * End-to-end test of the Owner Command Center authentication flow.
 *
 *   BASE=http://127.0.0.1:8788 node tests/admin-auth.mjs
 *
 * Requires a running Worker whose D1 has NO owner yet (first-run setup is part
 * of the flow) and `ENCRYPTION_KEY` configured. Covers: first-time setup,
 * TOTP enrolment + recovery codes, the owner gate blocking pre-MFA sessions,
 * normal user sessions being denied, no-session denial, single-use recovery
 * codes, admin CSRF enforcement and session revocation.
 */
import { createHmac } from "node:crypto";

const BASE = process.env.BASE ?? "http://127.0.0.1:8788";
let pass = 0, fail = 0;
const ok = (n, c) => (c ? (pass++, console.log("  ✓", n)) : (fail++, console.error("  ✗", n)));

function jar() {
  const store = new Map();
  return {
    header: () => [...store].map(([k, v]) => `${k}=${v}`).join("; "),
    absorb: (res) => {
      const sc = res.headers.getSetCookie?.() ?? [];
      for (const line of sc) { const s = line.split(";")[0]; const i = s.indexOf("="); store.set(s.slice(0, i), s.slice(i + 1)); }
    },
    get: (k) => store.get(k),
  };
}

async function call(j, method, path, body, extraHeaders = {}) {
  const h = { "content-type": "application/json", ...extraHeaders };
  const c = j.header(); if (c) h.cookie = c;
  const res = await fetch(BASE + path, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
  j.absorb(res);
  let data; try { data = await res.json(); } catch { data = null; }
  return { status: res.status, data };
}

// base32 decode + RFC6238 TOTP (SHA1, 6 digits, 30s) — matches the worker impl
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function b32dec(s) {
  s = s.replace(/=+$/,"").toUpperCase();
  let bits = 0, val = 0; const out = [];
  for (const ch of s) { val = (val << 5) | B32.indexOf(ch); bits += 5; if (bits >= 8) { out.push((val >>> (bits - 8)) & 0xff); bits -= 8; } }
  return Buffer.from(out);
}
function totp(secretB32, at = Math.floor(Date.now() / 1000)) {
  const counter = Math.floor(at / 30);
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const mac = createHmac("sha1", b32dec(secretB32)).update(buf).digest();
  const off = mac[mac.length - 1] & 0x0f;
  const bin = ((mac[off] & 0x7f) << 24) | ((mac[off + 1] & 0xff) << 16) | ((mac[off + 2] & 0xff) << 8) | (mac[off + 3] & 0xff);
  return (bin % 1e6).toString().padStart(6, "0");
}

const admin = jar();

// 1. state
let r = await call(admin, "GET", "/api/admin/auth/state");
ok("state: not set up, encryption configured", r.status === 200 && r.data.setupComplete === false && r.data.encryptionConfigured === true);

// 2. setup/begin
const email = `owner${Date.now()}@vibin.local`;
r = await call(admin, "POST", "/api/admin/auth/setup/begin", { email, password: "owner-super-secret-123" });
ok("setup/begin returns a secret + otpauth uri", r.status === 200 && /^[A-Z2-7]{32}$/.test(r.data.secret) && r.data.otpauthUri.startsWith("otpauth://totp/"));
const secret = r.data.secret;
ok("setup/begin set an admin cookie", !!admin.get("vibin_admin") && !!admin.get("vibin_admin_csrf"));
const acsrf = () => ({ "x-vibin-admin-csrf": admin.get("vibin_admin_csrf") });

// 3. session is pending, stage=enroll
r = await call(admin, "GET", "/api/admin/auth/session");
ok("session stage is 'enroll' before confirming TOTP", r.data.user?.email === email && r.data.stage === "enroll");

// 3b. owner routes blocked until MFA done
r = await call(admin, "GET", "/api/admin/cc/stats");
ok("owner route blocked before MFA (403)", r.status === 403);

// 4. confirm enrolment with a live code
r = await call(admin, "POST", "/api/admin/auth/mfa/enroll/confirm", { code: totp(secret) }, acsrf());
ok("enroll/confirm returns 10 recovery codes", r.status === 200 && Array.isArray(r.data.recoveryCodes) && r.data.recoveryCodes.length === 10);
const recoveryCodes = r.data.recoveryCodes;

// 5. now ready
r = await call(admin, "GET", "/api/admin/auth/session");
ok("session stage is 'ready' + setup complete", r.data.stage === "ready" && r.data.setupComplete === true);

// 6. owner data route works
r = await call(admin, "GET", "/api/admin/cc/stats");
ok("owner can read /api/admin/cc/stats", r.status === 200 && typeof r.data.users === "number");

// 7. NO admin cookie -> blocked
r = await call(jar(), "GET", "/api/admin/cc/stats");
ok("no admin session -> 401", r.status === 401);

// 8. a normal user session must NOT reach admin
const user = jar();
r = await call(user, "POST", "/api/auth/signup", { displayName: "Norm", email: `norm${Date.now()}@x.com`, password: "normal-user-pw-123" });
ok("normal user signup ok", r.status === 201);
r = await call(user, "GET", "/api/admin/cc/stats", undefined, { "x-vibin-csrf": user.get("vibin_csrf") });
ok("normal user session -> 401 on /api/admin/cc/stats", r.status === 401);

// 9. state now reports setupComplete
r = await call(jar(), "GET", "/api/admin/auth/state");
ok("state: setupComplete true after setup", r.data.setupComplete === true);

// 10. second setup/begin is refused
r = await call(jar(), "POST", "/api/admin/auth/setup/begin", { email, password: "another-pw-123456" });
ok("setup/begin refused once complete (403)", r.status === 403);

// 11. fresh login + TOTP
const admin2 = jar();
r = await call(admin2, "POST", "/api/admin/auth/login", { email, password: "owner-super-secret-123" });
ok("login password step -> next=totp", r.status === 200 && r.data.next === "totp");
r = await call(admin2, "POST", "/api/admin/auth/mfa", { code: totp(secret) }, { "x-vibin-admin-csrf": admin2.get("vibin_admin_csrf") });
ok("login mfa step ok", r.status === 200 && r.data.ok === true);
r = await call(admin2, "GET", "/api/admin/cc/stats");
ok("second session reaches admin data", r.status === 200);

// 12. wrong TOTP is rejected
const admin3 = jar();
await call(admin3, "POST", "/api/admin/auth/login", { email, password: "owner-super-secret-123" });
r = await call(admin3, "POST", "/api/admin/auth/mfa", { code: "000000" }, { "x-vibin-admin-csrf": admin3.get("vibin_admin_csrf") });
ok("wrong TOTP -> 401", r.status === 401);

// 13. recovery code works once
r = await call(admin3, "POST", "/api/admin/auth/mfa", { code: recoveryCodes[0] }, { "x-vibin-admin-csrf": admin3.get("vibin_admin_csrf") });
ok("recovery code accepted, remaining reported", r.status === 200 && r.data.usedRecoveryCode === true && r.data.remaining === 9);
const admin4 = jar();
await call(admin4, "POST", "/api/admin/auth/login", { email, password: "owner-super-secret-123" });
r = await call(admin4, "POST", "/api/admin/auth/mfa", { code: recoveryCodes[0] }, { "x-vibin-admin-csrf": admin4.get("vibin_admin_csrf") });
ok("used recovery code rejected the second time", r.status === 401);

// 14. wrong password
r = await call(jar(), "POST", "/api/admin/auth/login", { email, password: "nope" });
ok("bad password -> 401", r.status === 401);

// 15. admin CSRF enforced
r = await call(admin2, "POST", "/api/admin/auth/logout", {});  // no csrf header
ok("admin mutation without CSRF header -> 403", r.status === 403);

// 16. sessions list + revoke-all
r = await call(admin2, "GET", "/api/admin/auth/sessions");
ok("sessions list returns rows", r.status === 200 && Array.isArray(r.data.sessions) && r.data.sessions.some((s) => s.current));
r = await call(admin2, "POST", "/api/admin/auth/sessions/revoke-all", {}, { "x-vibin-admin-csrf": admin2.get("vibin_admin_csrf") });
ok("revoke-all keeps current session alive", r.status === 200);
r = await call(admin2, "GET", "/api/admin/cc/stats");
ok("current session still works after revoke-all", r.status === 200);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
