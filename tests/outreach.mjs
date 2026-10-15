/**
 * Provider-outreach tests. Self-contained: they migrate a throw-away local D1,
 * start `wrangler dev` against it, run the checks over HTTP and shut down.
 *
 *   node tests/outreach.mjs            (from the repo root)
 *
 * NOTHING can leave the machine: the worker runs with APP_ENV=development, in
 * which the outreach provider is a mock, and EMAIL_API_KEY is empty locally.
 * The suite covers the 12 scenarios of the outreach brief:
 *   1 correct record · 2 missing address · 3 faulty address · 4 address of the
 *   wrong provider · 5 already contacted · 6 do-not-contact list · 7 no approval
 *   · 8 double click · 9 provider error · 10 mixed campaign · 11 non-admin ·
 *   12 large dataset
 */
import { spawn, execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const PORT = Number(process.env.PORT ?? 8799);
const BASE = `http://127.0.0.1:${PORT}`;
const STATE = fs.mkdtempSync(path.join(os.tmpdir(), "vibin-outreach-"));
const IS_WIN = process.platform === "win32";

let pass = 0;
let fail = 0;
const ok = (name, cond, extra) => {
  if (cond) {
    pass++;
    console.log("  ✓", name);
  } else {
    fail++;
    console.error("  ✗", name, extra !== undefined ? `\n      ${JSON.stringify(extra)}` : "");
  }
};

/* ------------------------------ plumbing ------------------------------ */

function wrangler(args, opts = {}) {
  return execFileSync(IS_WIN ? "npx.cmd" : "npx", ["wrangler", ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    shell: IS_WIN,
    ...opts,
  });
}
function sql(file) {
  wrangler(["d1", "execute", "vibin-db", "--local", "--persist-to", STATE, "--file", file]);
}

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function b32dec(s) {
  let bits = "";
  for (const ch of s.replace(/=+$/, "").toUpperCase()) bits += B32.indexOf(ch).toString(2).padStart(5, "0");
  const out = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(out);
}
function totp(secret) {
  const ctr = Math.floor(Date.now() / 1000 / 30);
  const buf = Buffer.alloc(8);
  buf.writeBigInt64BE(BigInt(ctr));
  const h = createHmac("sha1", b32dec(secret)).update(buf).digest();
  const o = h[h.length - 1] & 0xf;
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
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
async function call(j, method, p, body, extra = {}) {
  const h = { "content-type": "application/json", ...extra };
  const c = j.header();
  if (c) h.cookie = c;
  const res = await fetch(BASE + p, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
  j.absorb(res);
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, data, headers: res.headers };
}

/* ------------------------------ fixtures ------------------------------ */

function fixtureSql() {
  const org = (id, domain, name, extra = "") =>
    `INSERT INTO outreach_orgs (id, domain, name, website_url, activity_count, discovery_status${extra ? ", excluded, excluded_reason" : ""}) VALUES ('${id}','${domain}','${name}','https://${domain}',1,'found'${extra ? `,${extra}` : ""});`;
  const contact = (id, orgId, email, kind, verification, dm = 1, primary = 1) =>
    `INSERT INTO outreach_contacts (id, org_id, email, kind, source_type, source_url, domain_matches, verification, is_primary)
     VALUES ('${id}','${orgId}','${email}','${kind}','website_mailto','https://example-source.be/contact',${dm},'${verification}',${primary});`;
  const lines = [
    // 1 correct, 2 missing address, 3/4 personal + uncertain + other-domain
    org("o_ok", "bowling-ok.be", "Bowling OK"),
    contact("c_ok", "o_ok", "info@bowling-ok.be", "generic", "checked"),
    org("o_none", "bowling-none.be", "Bowling Zonder Adres"),
    org("o_personal", "bowling-personal.be", "Bowling Persoonlijk"),
    contact("c_personal", "o_personal", "jan.peeters@bowling-personal.be", "personal", "checked"),
    org("o_uncertain", "bowling-uncertain.be", "Bowling Onzeker"),
    contact("c_uncertain", "o_uncertain", "info@bowling-uncertain.be", "generic", "uncertain"),
    org("o_other", "bowling-other.be", "Bowling Ander Domein"),
    contact("c_other", "o_other", "info@somebody-else.be", "generic", "uncertain", 0),
    // excluded org, suppressed address
    org("o_excl", "bowling-excl.be", "Bowling Uitgesloten", "1,'handmatig'"),
    contact("c_excl", "o_excl", "info@bowling-excl.be", "generic", "checked"),
    org("o_supp", "bowling-supp.be", "Bowling Op Lijst"),
    contact("c_supp", "o_supp", "info@bowling-supp.be", "generic", "checked"),
    `INSERT INTO outreach_suppressions (id, kind, value, reason) VALUES ('s1','email','info@bowling-supp.be','opt_out');`,
    // double click + provider failure + opt-out
    org("o_dbl", "bowling-dbl.be", "Bowling Dubbel"),
    contact("c_dbl", "o_dbl", "info@bowling-dbl.be", "generic", "checked"),
    org("o_fail", "bowling-fail.be", "Bowling Provider Fout"),
    contact("c_fail", "o_fail", "providerfail@bowling-fail.be", "generic", "checked"),
    org("o_opt", "bowling-opt.be", "Bowling Afmelding"),
    contact("c_opt", "o_opt", "info@bowling-opt.be", "generic", "checked"),
    // mixed campaign
    ...["a", "b", "c", "d"].flatMap((x) => [
      org(`o_c${x}`, `camp-${x}.be`, `Campagne ${x.toUpperCase()}`),
      contact(`c_c${x}`, `o_c${x}`, `info@camp-${x}.be`, "generic", "checked"),
    ]),
    // sync fixtures
    `INSERT INTO providers (id, name, kind) VALUES ('p-test','Test','dataset');`,
    `INSERT INTO activity_categories (id, label) VALUES ('sport','Sport');`,
    ...[
      ["a1", "Karting Sync", "https://www.sync-bowling.be/karting", "alive"],
      ["a2", "Bowling Sync", "https://sync-bowling.be/bowling?utm=x", "alive"],
      ["a3", "Via Facebook", "https://www.facebook.com/someplace", "alive"],
      ["a4", "Dode Site", "https://dead-site.be", "dead"],
    ].map(
      ([id, t, url, ws]) =>
        `INSERT INTO activities (id, provider_id, title, category_id, location_label, price_band, provider, website_url, provider_website, web_status, active)
         VALUES ('${id}','p-test','${t}','sport','Gent','10_25','${t}','${url}','${url}','${ws}',1);`,
    ),
    // large dataset: 5,000 organisations with 5,000 contacts
    `WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 5000)
     INSERT INTO outreach_orgs (id, domain, name, website_url, activity_count, discovery_status)
     SELECT 'big' || i, 'big-' || i || '.be', 'Grote Dataset ' || i, 'https://big-' || i || '.be', 1 + (i % 4), 'found' FROM n;`,
    `INSERT INTO outreach_contacts (id, org_id, email, kind, source_type, source_url, domain_matches, verification, is_primary)
     SELECT 'bigc' || substr(id, 4), id, 'info@' || domain, 'generic', 'website_mailto', 'https://' || domain || '/contact', 1, 'checked', 1
       FROM outreach_orgs WHERE id LIKE 'big%';`,
  ];
  return lines.join("\n");
}

/* -------------------------------- run -------------------------------- */

let server;
let serverLog = "";
async function stop() {
  if (!server) return;
  try {
    if (IS_WIN) execFileSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore" });
    else server.kill("SIGTERM");
  } catch {
    /* already gone */
  }
}

async function boot() {
  console.log("• migrating throw-away local D1 …");
  wrangler(["d1", "migrations", "apply", "vibin-db", "--local", "--persist-to", STATE]);
  const file = path.join(STATE, "fixtures.sql");
  fs.writeFileSync(file, fixtureSql());
  sql(file);
  console.log("• starting wrangler dev on", BASE);
  server = spawn(IS_WIN ? "npx.cmd" : "npx", ["wrangler", "dev", "--port", String(PORT), "--persist-to", STATE], {
    stdio: ["ignore", "pipe", "pipe"],
    shell: IS_WIN,
  });
  let log = "";
  server.stdout.on("data", (d) => (log += d, (serverLog += d)));
  server.stderr.on("data", (d) => (log += d, (serverLog += d)));
  const t0 = Date.now();
  for (;;) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) break;
    } catch {
      /* not up yet */
    }
    if (Date.now() - t0 > 120_000) throw new Error("wrangler dev did not start:\n" + log.slice(-1500));
    await new Promise((r) => setTimeout(r, 700));
  }
}

async function main() {
  await boot();

  // ---- become the owner ----
  const admin = jar();
  const email = `outreach-owner${Date.now()}@vibin.local`;
  const PW = "owner-super-secret-123";
  let r = await call(admin, "POST", "/api/admin/auth/setup/begin", { email, password: PW });
  ok("owner setup begins", r.status === 200 && /^[A-Z2-7]{32}$/.test(r.data.secret ?? ""), r.data);
  const csrf = () => ({ "x-vibin-admin-csrf": admin.get("vibin_admin_csrf") });
  r = await call(admin, "POST", "/api/admin/auth/mfa/enroll/confirm", { code: totp(r.data.secret) }, csrf());
  ok("owner MFA enrolled", r.status === 200, r.data);

  const A = (method, p, body) => call(admin, method, `/api/admin/cc/outreach${p}`, body, method === "GET" ? {} : csrf());

  // ---- 11. non-admin / no CSRF ----
  const anon = jar();
  r = await call(anon, "POST", "/api/admin/cc/outreach/messages/x/send", { hash: "a".repeat(64) });
  ok("11: no session → 401 on send", r.status === 401);
  r = await call(anon, "GET", "/api/admin/cc/outreach/orgs");
  ok("11: no session → 401 on list", r.status === 401);
  const user = jar();
  await call(user, "POST", "/api/auth/signup", {
    displayName: "Gewone",
    email: `gewone${Date.now()}@example.com`,
    password: "normal-user-pw-123",
  });
  r = await call(user, "POST", "/api/admin/cc/outreach/messages/x/send", { hash: "a".repeat(64) }, { "x-vibin-csrf": user.get("vibin_csrf") ?? "" });
  ok("11: normal user → 401 on send API", r.status === 401);
  r = await call(user, "POST", "/api/admin/cc/outreach/campaign/start", { name: "x", expectedCount: 1 }, { "x-vibin-csrf": user.get("vibin_csrf") ?? "" });
  ok("11: normal user → 401 on campaign start", r.status === 401);
  r = await call(admin, "POST", "/api/admin/cc/outreach/messages/x/send", { hash: "a".repeat(64) });
  ok("11: owner without admin CSRF → 403", r.status === 403);

  // ---- configuration defaults ----
  r = await A("GET", "/config");
  ok("config: starts in test mode, legal review not confirmed", r.data.config.mode === "test" && r.data.config.legalReview.status === "not_reviewed", r.data);
  ok("config: default template is the introduction mail", r.data.config.subject === "Mag ik VIBIN kort aan jullie voorstellen?" && r.data.config.body.includes("Zouden jullie interesse hebben"));
  ok("config: real delivery is not possible outside production", r.data.runtime.realDeliveryPossible === false);
  r = await A("PUT", "/config", { mode: "live" });
  ok("config: cannot switch to live while blockers exist", r.status === 400 && Array.isArray(r.data?.details?.blockers) && r.data.details.blockers.length > 0, r.data);
  r = await A("POST", "/legal-review", { approved: true, note: "kort" });
  ok("legal review: needs a documented basis", r.status === 400);

  // ---- sync + discovery bookkeeping ----
  r = await A("POST", "/sync", {});
  ok("sync: builds organisations from activities", r.status === 200 && r.data.orgs >= 5000, r.data);
  r = await A("GET", "/orgs?q=sync&excluded=all&pageSize=50");
  const syncOrg = r.data.rows.find((o) => o.domain === "sync-bowling.be");
  ok("sync: two activities on one domain → one organisation", syncOrg && syncOrg.activityCount === 2, r.data.rows.map((x) => x.domain));
  r = await A("GET", "/orgs?q=facebook&excluded=all");
  ok("sync: social network is skipped, not treated as a provider", r.data.rows.every((o) => o.discoveryStatus === "skipped"), r.data.rows);
  r = await A("GET", "/orgs?q=dead-site&excluded=all");
  ok("sync: organisation with only a dead site is skipped", r.data.rows[0]?.discoveryStatus === "skipped", r.data.rows);

  // ---- 2/3/4. contact data problems ----
  r = await A("POST", "/orgs/o_none/prepare", {});
  ok("2: missing address → no draft can be made", r.status === 400, r.data);
  r = await A("POST", "/orgs/o_none/contacts", { email: "not-an-email", sourceUrl: "https://bowling-none.be/contact" });
  ok("3: faulty address is rejected", r.status === 400, r.data);
  r = await A("POST", "/orgs/o_none/contacts", { email: "info@bowling-none.be", sourceUrl: "ftp://nope" });
  ok("3: source must be an http(s) page", r.status === 400 || r.status === 422, r.data);

  r = await A("POST", "/orgs/o_other/prepare", {});
  ok("4: wrong-provider address: draft is allowed but flagged", r.status === 200, r.data);
  const otherMsg = r.data.messageId;
  r = await A("GET", `/messages/${otherMsg}`);
  ok("4: preview blocks it (unverified, other domain)", r.data.canApprove === false && r.data.blockers.some((b) => b.code === "unverified_contact"), r.data.blockers);
  r = await A("POST", `/messages/${otherMsg}/send`, { hash: r.data.hash });
  ok("4: sending it is refused server-side (422), nothing sent", r.status === 422, r.data);

  r = await A("POST", "/orgs/o_personal/prepare", {});
  const persMsg = r.data.messageId;
  r = await A("GET", `/messages/${persMsg}`);
  ok("3: personal address is blocked", r.data.blockers.some((b) => b.code === "personal_address"), r.data.blockers);

  r = await A("POST", "/orgs/o_uncertain/prepare", {});
  r = await A("GET", `/messages/${r.data.messageId}`);
  ok("uncertain verification blocks approval", r.data.canApprove === false);

  // ---- 6. exclusion + suppression ----
  r = await A("POST", "/orgs/o_excl/prepare", {});
  ok("6: excluded organisation gets no draft", r.status === 400, r.data);
  r = await A("POST", "/orgs/o_supp/prepare", {});
  r = await A("GET", `/messages/${r.data.messageId}`);
  ok("6: suppressed address is blocked at preview", r.data.blockers.some((b) => b.code === "suppressed"), r.data.blockers);
  const suppHash = r.data.hash;
  const suppId = r.data.id;
  r = await A("POST", `/messages/${suppId}/send`, { hash: suppHash });
  ok("6: suppressed address cannot be sent", r.status === 422 && /uitsluitingslijst/.test(r.data.message), r.data);

  // ---- 7. selecting never sends; wrong hash never approves ----
  r = await A("POST", "/prepare-bulk", { orgIds: ["o_ca", "o_cb", "o_cc", "o_cd"] });
  ok("7: bulk selection only prepares drafts", r.status === 200 && r.data.created === 4, r.data);
  r = await A("GET", "/orgs?q=Campagne&excluded=all");
  ok("7: all four are 'klaar voor controle', none approved or sent", r.data.rows.length === 4 && r.data.rows.every((o) => o.messageStatus === "draft"), r.data.rows.map((x) => x.messageStatus));
  r = await A("GET", "/campaign/preview");
  ok("7: campaign sees zero approved messages", r.data.approvedTotal === 0, r.data);
  r = await A("POST", "/campaign/start", { name: "Leeg", expectedCount: 1 });
  ok("7: campaign cannot start without individually approved messages", r.status === 409, r.data);
  r = await A("POST", "/orgs/o_ok/prepare", {});
  const okMsg = r.data.messageId;
  r = await A("POST", `/messages/${okMsg}/send`, { hash: "f".repeat(64) });
  ok("7: a wrong/stale preview hash never approves or sends", r.status === 422, r.data);
  r = await A("GET", `/messages/${okMsg}`);
  ok("7: message is still a draft", r.data.status === "draft");

  // ---- 1. the happy path (test mode → dry-run) ----
  ok("1: preview carries opt-out line, identity-free footer and source", /afmeld|Meld je af/i.test(r.data.finalText) && r.data.finalText.includes("https://example-source.be/contact"), r.data.finalText.slice(-400));
  ok("1: greeting uses the provider name", r.data.bodyText.startsWith("Hallo Bowling OK,"), r.data.bodyText.slice(0, 40));
  const okHash = r.data.hash;
  r = await A("POST", `/messages/${okMsg}/send`, { hash: okHash });
  ok("1: approve-and-send succeeds in test mode as a dry-run", r.status === 200 && r.data.dryRun === true && r.data.test === true, r.data);
  r = await A("GET", `/messages/${okMsg}`);
  ok("1: result is stored (sent, dry-run, approver recorded)", r.data.status === "sent" && r.data.approvedAt, r.data);
  r = await A("GET", "/orgs/o_ok");
  const sentMsg = r.data.messages.find((m) => m.id === okMsg);
  ok("1: history lists it as sent test message with provider id", sentMsg && sentMsg.providerMessageId === "dry-run" && sentMsg.testMode === 1, sentMsg);
  ok("1: history stores subject and body", sentMsg.subject.length > 5 && sentMsg.bodyText.includes("Wij zijn VIBIN"));

  // ---- 5. already contacted ----
  r = await A("POST", "/orgs/o_ok/prepare", {});
  ok("5: already-sent address cannot be prepared again", r.status === 409, r.data);
  r = await A("POST", `/messages/${okMsg}/send`, { hash: okHash });
  ok("5: re-sending an already sent message is refused", r.status === 409, r.data);

  // ---- 8. two quick clicks ----
  r = await A("POST", "/orgs/o_dbl/prepare", {});
  const dblMsg = r.data.messageId;
  r = await A("GET", `/messages/${dblMsg}`);
  const dblHash = r.data.hash;
  const clicks = await Promise.all([
    A("POST", `/messages/${dblMsg}/send`, { hash: dblHash }),
    A("POST", `/messages/${dblMsg}/send`, { hash: dblHash }),
    A("POST", `/messages/${dblMsg}/send`, { hash: dblHash }),
  ]);
  const wins = clicks.filter((x) => x.status === 200).length;
  ok("8: of three simultaneous clicks exactly one delivers", wins === 1, clicks.map((c) => c.status));
  r = await A("GET", "/orgs/o_dbl");
  ok("8: exactly one message exists, delivered once", r.data.messages.length === 1 && r.data.messages[0].status === "sent", r.data.messages);

  // ---- 9. provider error ----
  r = await A("PUT", "/config", { testInbox: "inbox@vibin.test" });
  ok("9: test inbox configured", r.status === 200, r.data);
  r = await A("POST", "/orgs/o_fail/prepare", {});
  const failMsg = r.data.messageId;
  r = await A("GET", `/messages/${failMsg}`);
  const failHash = r.data.hash;
  ok("9: with a test inbox the mode label is TEST, never the real recipient", /TEST/.test(`${r.data.mode}`.toUpperCase()) && r.data.testInbox === "inbox@vibin.test", r.data);
  r = await A("POST", `/messages/${failMsg}/send`, { hash: failHash });
  ok("9: provider error is reported (502) and recorded", r.status === 502, r.data);
  r = await A("GET", `/messages/${failMsg}`);
  ok("9: message is 'failed' with the error kept", r.data.status === "failed" && r.data.attempts === 1, r.data);
  r = await A("GET", "/summary");
  ok("9: failure is not counted as a real send", r.data.sentLive === 0, r.data);
  r = await A("POST", `/messages/${failMsg}/retry`, {});
  ok("9: failed message can be retried explicitly", r.status === 200, r.data);
  await A("POST", `/messages/${failMsg}/cancel`, {}); // keep the campaign scenario below clean

  // test inbox real delivery path (mock provider) for a healthy message
  r = await A("POST", "/orgs/o_opt/prepare", {});
  const optMsg = r.data.messageId;
  r = await A("GET", `/messages/${optMsg}`);
  r = await A("POST", `/messages/${optMsg}/send`, { hash: r.data.hash });
  ok("test inbox: message goes through the (mock) provider, not as a dry-run", r.status === 200 && r.data.test === true && r.data.dryRun === false, r.data);

  // ---- opt-out link ----
  const dev = fs.readFileSync(".dev.vars", "utf8");
  const secret = /^ENCRYPTION_KEY=(.+)$/m.exec(dev)?.[1]?.trim();
  const tokenFor = (id) => `${id}.${createHmac("sha256", `vibin-outreach-optout:${secret}`).update(id).digest("hex").slice(0, 32)}`;
  r = await call(anon, "GET", `/optout/${tokenFor(optMsg).replace(/.$/, "0")}`);
  ok("opt-out: tampered link is rejected", r.status === 400, r.status);
  r = await call(anon, "GET", `/optout/${tokenFor(optMsg)}`);
  ok("opt-out: valid link confirms and works without login", r.status === 200 && /afgemeld/i.test(String(r.data)), String(r.data).slice(0, 120));
  r = await call(anon, "POST", `/optout/${tokenFor(optMsg)}`);
  ok("opt-out: one-click POST is idempotent", r.status === 200);
  r = await A("GET", "/orgs/o_opt");
  ok("opt-out: organisation is excluded and its address suppressed", r.data.org.excluded === true && r.data.contacts[0].suppressed === true, r.data.org);
  r = await A("GET", "/suppressions?q=bowling-opt");
  ok("opt-out: appears on the do-not-contact list as opt_out", r.data.rows.some((s) => s.reason === "opt_out"), r.data.rows);
  const sid = r.data.rows[0]?.id;
  r = await A("DELETE", `/suppressions/${sid}`);
  ok("opt-out: an objection cannot be deleted from the list", r.status === 400, r.data);

  // ---- 10. campaign with some approved, others not ----
  r = await A("GET", "/orgs?q=Campagne&excluded=all");
  const camp = Object.fromEntries(r.data.rows.map((o) => [o.domain, o.messageId]));
  for (const x of ["a", "b"]) {
    const id = camp[`camp-${x}.be`];
    const pv = await A("GET", `/messages/${id}`);
    const ap = await A("POST", `/messages/${id}/approve`, { hash: pv.data.hash });
    ok(`10: campaign ${x.toUpperCase()} approved individually`, ap.status === 200, ap.data);
  }
  r = await A("GET", "/campaign/preview");
  ok("10: preview counts exactly the two approved messages", r.data.approvedTotal === 2 && r.data.ready === 2, r.data);
  r = await A("POST", "/campaign/start", { name: "Gemengd", expectedCount: 3 });
  ok("10: start refuses a count that differs from the reviewed list", r.status === 409, r.data);
  r = await A("POST", "/campaign/start", { name: "Gemengd", expectedCount: 2 });
  ok("10: campaign starts with the two approved", r.status === 201, r.data);
  const campId = r.data.id;
  r = await A("POST", `/campaigns/${campId}/run-now`, {});
  ok("10: batch processed", r.status === 200, r.data);
  r = await A("GET", "/campaigns");
  const row = r.data.rows.find((x) => x.id === campId);
  ok("10: both approved messages were delivered, nothing else", row && row.sent === 2 && row.pending === 0, row);
  r = await A("GET", "/orgs?q=Campagne&excluded=all");
  const st = Object.fromEntries(r.data.rows.map((o) => [o.domain, o.messageStatus]));
  ok("10: unapproved campaign members stay drafts", st["camp-c.be"] === "draft" && st["camp-d.be"] === "draft", st);

  // ---- editing after approval voids it ----
  const cd = camp["camp-c.be"];
  let pv = await A("GET", `/messages/${cd}`);
  await A("POST", `/messages/${cd}/approve`, { hash: pv.data.hash });
  r = await A("PUT", `/messages/${cd}`, { bodyText: pv.data.bodyText + "\n\nPS: extra regel." });
  ok("approval is voided by an edit", r.status === 200);
  pv = await A("GET", `/messages/${cd}`);
  ok("…the message is a draft again", pv.data.status === "draft", pv.data.status);

  // ---- test reset ----
  r = await A("POST", "/test-reset", {});
  ok("test reset removes test messages only", r.status === 200 && r.data.removed >= 4, r.data);

  // ---- 12. large dataset ----
  const t0 = Date.now();
  r = await A("GET", "/orgs?page=1&pageSize=25&usable=1&sort=activities");
  const ms = Date.now() - t0;
  ok("12: 5,000+ records page server-side", r.status === 200 && r.data.rows.length === 25 && r.data.total >= 5000, { total: r.data.total, rows: r.data.rows.length });
  ok(`12: list responds quickly (${ms} ms)`, ms < 4000, ms);
  const t1 = Date.now();
  r = await A("GET", "/orgs?q=Grote%20Dataset%204999&pageSize=25");
  ok("12: search across thousands of records works", r.status === 200 && r.data.rows.some((o) => o.name === "Grote Dataset 4999"), r.data.rows?.length);
  r = await A("GET", "/summary");
  ok(`12: summary over thousands of records (${Date.now() - t1} ms)`, r.status === 200 && r.data.orgs >= 5000);
  r = await A("POST", "/prepare-bulk", { orgIds: Array.from({ length: 101 }, (_, i) => `big${i + 1}`) });
  ok("12: bulk prepare is capped (≤100) to protect the worker", r.status === 400, r.status);
  const t2 = Date.now();
  r = await A("POST", "/prepare-bulk", { orgIds: Array.from({ length: 60 }, (_, i) => `big${i + 1}`) });
  ok(`12: 60 drafts in one request (${Date.now() - t2} ms)`, r.status === 200 && r.data.created === 60, r.data);

  // ---- csv export / import ----
  const exp = await fetch(`${BASE}/api/admin/cc/outreach/export.csv`, { headers: { cookie: admin.header() } });
  const raw = Buffer.from(await exp.arrayBuffer());
  const csv = raw.toString("utf8");
  ok("export: CSV with UTF-8 BOM and header", exp.status === 200 && raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf && csv.includes("org_id,naam,domein"), csv.slice(0, 60));
  r = await A("POST", "/import/preview", {
    csv: "domain,email,source_url\nbowling-none.be,info@bowling-none.be,https://bowling-none.be/contact\nbowling-none.be,info@bowling-none.be,https://bowling-none.be/contact\nbowling-ok.be,info@bowling-ok.be,https://bowling-ok.be/contact\nbowling-none.be,kapot,https://x.be\nonbekend.be,info@onbekend.be,https://onbekend.be\nbowling-none.be,info@bowling-ok.be,https://bowling-none.be/contact\n",
  });
  ok("import: preview classifies new / duplicate / existing / invalid / unknown / conflict", r.status === 200 && r.data.counts.new === 1 && r.data.counts.duplicate === 1 && r.data.counts.exists === 1 && r.data.counts.invalid === 1 && r.data.counts.unknown_org === 1 && r.data.counts.conflict === 1, r.data);
  r = await A("POST", "/import/confirm", { csv: "domain,email,source_url\nbowling-none.be,info@bowling-none.be,https://bowling-none.be/contact\n", expectedNew: 1 });
  ok("import: confirm adds only new rows", r.status === 200 && r.data.added === 1, r.data);
  r = await A("GET", "/orgs/o_none");
  ok("import: new address starts unverified (never auto-trusted)", r.data.contacts[0]?.verification === "unverified" && r.data.contacts[0]?.sourceType === "csv", r.data.contacts);

  // ---- audit trail records the actions ----
  r = await call(admin, "GET", "/api/admin/cc/audit?range=today&action=outreach.sent");
  ok("audit: sends are recorded", r.status === 200 && r.data.rows.length >= 1, r.data);
}

try {
  await main();
} catch (e) {
  fail++;
  console.error("  ✗ test run crashed:", e?.stack ?? e);
} finally {
  await stop();
  try {
    fs.rmSync(STATE, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}
if (fail) {
  // Only the worker's error blocks (the full log is mostly request lines).
  const lines = serverLog.split("\n");
  const out = [];
  lines.forEach((l, i) => {
    if (/ERROR|Unhandled error|D1_ERROR/.test(l)) out.push(...lines.slice(i, i + 4));
  });
  console.error("\n--- worker errors ---\n" + out.join("\n").slice(0, 6000));
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
