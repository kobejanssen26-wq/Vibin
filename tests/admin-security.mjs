/**
 * Security-focused checks for the Owner Command Center, run against a Worker
 * whose D1 has NO owner yet.
 *
 *   BASE=http://127.0.0.1:8788 node tests/admin-security.mjs
 *
 * Covers: unauthorized access to every cc surface, privilege escalation from a
 * normal user, CSRF enforcement on cc mutations, the credential vault (no
 * ciphertext in list/detail, password-gated reveal, wrong password -> 403),
 * audit rows never containing the secret, and maintenance mode leaving the
 * command center reachable.
 */
import { createHmac } from "node:crypto";

const BASE = process.env.BASE ?? "http://127.0.0.1:8788";
let pass = 0,
  fail = 0;
const ok = (n, c) =>
  c ? (pass++, console.log("  ✓", n)) : (fail++, console.error("  ✗", n));

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function b32dec(s) {
  let bits = "";
  for (const ch of s.replace(/=+$/, "").toUpperCase())
    bits += B32.indexOf(ch).toString(2).padStart(5, "0");
  const out = [];
  for (let i = 0; i + 8 <= bits.length; i += 8)
    out.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(out);
}
function totp(secret) {
  const ctr = Math.floor(Date.now() / 1000 / 30);
  const buf = Buffer.alloc(8);
  buf.writeBigInt64BE(BigInt(ctr));
  const h = createHmac("sha1", b32dec(secret)).update(buf).digest();
  const o = h[h.length - 1] & 0xf;
  const n =
    ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1_000_000).padStart(6, "0");
}
function jar() {
  const s = new Map();
  return {
    header: () => [...s].map(([k, v]) => `${k}=${v}`).join("; "),
    absorb: (r) => {
      for (const line of r.headers.getSetCookie?.() ?? []) {
        const seg = line.split(";")[0];
        const i = seg.indexOf("=");
        s.set(seg.slice(0, i), seg.slice(i + 1));
      }
    },
    get: (k) => s.get(k),
  };
}
async function call(j, method, path, body, extra = {}) {
  const h = { "content-type": "application/json", ...extra };
  const c = j.header();
  if (c) h.cookie = c;
  const res = await fetch(BASE + path, {
    method,
    headers: h,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  j.absorb(res);
  let data;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status: res.status, data };
}

const CC_GET = [
  "/overview?range=30d",
  "/users",
  "/users/x",
  "/groups",
  "/activities",
  "/rankings/activities?range=30d",
  "/providers",
  "/funnel?range=30d",
  "/retention",
  "/errors?range=30d",
  "/system",
  "/audit",
  "/flags",
  "/settings",
  "/vault",
];

const run = async () => {
  // 1. no session -> every cc surface is 401
  const anon = jar();
  let all401 = true;
  for (const p of CC_GET) {
    const r = await call(anon, "GET", `/api/admin/cc${p}`);
    if (r.status !== 401) {
      all401 = false;
      console.error(`     ${p} -> ${r.status}`);
    }
  }
  ok("no admin session: every /cc GET is 401", all401);

  // 2. normal user session cannot reach cc
  const user = jar();
  await call(user, "POST", "/api/auth/signup", {
    displayName: "Sec",
    email: `sec${Date.now()}@x.com`,
    password: "normal-user-pw-123",
  });
  const ru = await call(user, "GET", "/api/admin/cc/overview?range=7d", undefined, {
    "x-vibin-csrf": user.get("vibin_csrf") ?? "",
  });
  ok("normal user -> 401 on /cc/overview", ru.status === 401);
  const ru2 = await call(
    user,
    "PUT",
    "/api/admin/cc/flags/x",
    { enabled: true },
    { "x-vibin-csrf": user.get("vibin_csrf") ?? "" },
  );
  ok("normal user -> 401 on /cc mutation", ru2.status === 401);

  // 2b. a POST to /api/admin/* while ALSO holding a normal vibin_session must
  //     not be tripped by the app's own CSRF check (the admin tree has its own
  //     session + CSRF). Regression: this used to 403 with "missing CSRF token".
  const both = jar();
  await call(both, "POST", "/api/auth/signup", {
    displayName: "Both",
    email: `both${Date.now()}@x.com`,
    password: "normal-user-pw-123",
  });
  const rb = await call(both, "POST", "/api/admin/auth/setup/begin", {
    email: `owner-both${Date.now()}@vibin.local`,
    password: "owner-super-secret-123",
  });
  ok(
    "admin setup POST works even with a normal vibin_session present",
    rb.status === 200 && /^[A-Z2-7]{32}$/.test(rb.data?.secret ?? ""),
  );

  // 3. become the owner (fresh jar — setup/begin above left a half-owner which
  //    /setup/begin here demotes, per the single-owner invariant)
  const admin = jar();
  const email = `secowner${Date.now()}@vibin.local`;
  const PW = "owner-super-secret-123";
  let r = await call(admin, "POST", "/api/admin/auth/setup/begin", {
    email,
    password: PW,
  });
  ok("setup/begin ok", r.status === 200 && /^[A-Z2-7]{32}$/.test(r.data.secret));
  const secret = r.data.secret;
  const csrf = () => ({ "x-vibin-admin-csrf": admin.get("vibin_admin_csrf") });
  r = await call(
    admin,
    "POST",
    "/api/admin/auth/mfa/enroll/confirm",
    { code: totp(secret) },
    csrf(),
  );
  ok("mfa enrol confirm ok", r.status === 200);

  // 4. cc mutation without the admin CSRF header -> 403
  r = await call(admin, "PUT", "/api/admin/cc/flags/sec_flag", {
    enabled: true,
  });
  ok("cc mutation without admin CSRF -> 403", r.status === 403);
  r = await call(
    admin,
    "PUT",
    "/api/admin/cc/flags/sec_flag",
    { enabled: true },
    csrf(),
  );
  ok("cc mutation with admin CSRF -> 200", r.status === 200);

  // 5. credential vault: no ciphertext, password-gated reveal
  r = await call(
    admin,
    "POST",
    "/api/admin/cc/vault",
    {
      name: "sec test",
      category: "development",
      username: "u",
      secret: "TOP-SECRET-VALUE-42",
    },
    csrf(),
  );
  ok("vault create -> 201", r.status === 201);
  const credId = r.data.id;

  r = await call(admin, "GET", "/api/admin/cc/vault");
  const row = r.data.rows.find((x) => x.id === credId);
  ok(
    "vault list omits ciphertext + plaintext",
    row &&
      !("secretEnc" in row) &&
      !("secret" in row) &&
      !JSON.stringify(r.data).includes("TOP-SECRET-VALUE-42"),
  );

  r = await call(
    admin,
    "POST",
    `/api/admin/cc/vault/${credId}/reveal`,
    { password: "wrong-password" },
    csrf(),
  );
  ok("reveal with wrong password -> 403", r.status === 403);

  r = await call(
    admin,
    "POST",
    `/api/admin/cc/vault/${credId}/reveal`,
    { password: PW },
    csrf(),
  );
  ok(
    "reveal with correct password returns the plaintext",
    r.status === 200 && r.data.secret === "TOP-SECRET-VALUE-42",
  );

  r = await call(admin, "GET", `/api/admin/cc/vault/${credId}/access-log`);
  ok(
    "access log records created + viewed",
    r.status === 200 &&
      r.data.rows.some((x) => x.action === "viewed") &&
      r.data.rows.some((x) => x.action === "created"),
  );

  // 6. the audit trail names the action but never the secret value
  r = await call(
    admin,
    "GET",
    "/api/admin/cc/audit?range=today&action=credential.viewed",
  );
  ok(
    "audit has credential.viewed, without the secret value",
    r.status === 200 &&
      r.data.rows.length >= 1 &&
      !JSON.stringify(r.data).includes("TOP-SECRET-VALUE-42"),
  );

  // 6b. user moderation: password-gated delete, owner protected
  const victim = jar();
  const vEmail = `victim${Date.now()}@x.com`;
  await call(victim, "POST", "/api/auth/signup", {
    displayName: "Victim",
    email: vEmail,
    password: "victim-pw-123456",
  });
  const vId = (await call(victim, "GET", "/api/auth/session")).data?.user?.id;
  r = await call(
    admin,
    "POST",
    `/api/admin/cc/users/${vId}/status`,
    { status: "suspended" },
    csrf(),
  );
  ok("owner can suspend a normal user", r.status === 200);
  r = await call(
    admin,
    "DELETE",
    `/api/admin/cc/users/${vId}`,
    { password: "wrong" },
    csrf(),
  );
  ok("delete user with wrong password -> 403", r.status === 403);
  r = await call(
    admin,
    "DELETE",
    `/api/admin/cc/users/${vId}`,
    { password: PW },
    csrf(),
  );
  ok("delete user with correct password -> 200", r.status === 200);
  const ownerId = (await call(admin, "GET", "/api/admin/auth/session")).data
    ?.user?.id;
  r = await call(
    admin,
    "DELETE",
    `/api/admin/cc/users/${ownerId}`,
    { password: PW },
    csrf(),
  );
  ok("owner account cannot be deleted -> 400", r.status === 400);

  // 7. maintenance mode: normal API 503, command center still 200
  await call(
    admin,
    "PUT",
    "/api/admin/cc/settings",
    { key: "maintenance_mode", value: "1" },
    csrf(),
  );
  await new Promise((res) => setTimeout(res, 16_000)); // status cache TTL
  const guest = jar();
  const gs = await call(guest, "GET", "/api/status");
  ok("public /api/status reports maintenance", gs.data?.maintenance === true);
  const gm = await call(guest, "GET", "/api/activities/anything");
  ok("normal API returns 503 during maintenance", gm.status === 503);
  const am = await call(admin, "GET", "/api/admin/cc/overview?range=7d");
  ok("command center still 200 during maintenance", am.status === 200);
  await call(
    admin,
    "PUT",
    "/api/admin/cc/settings",
    { key: "maintenance_mode", value: "0" },
    csrf(),
  );

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
};

run();
