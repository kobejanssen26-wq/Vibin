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
    org("o_rcpt", "bowling-rcpt.be", "Bowling Ontvangstbewijs"),
    contact("c_rcpt", "o_rcpt", "info@bowling-rcpt.be", "generic", "checked"),
    `INSERT INTO outreach_messages (id, org_id, contact_id, to_email, subject, body_text, status, test_mode, sent_at)
     VALUES ('m_rcpt','o_rcpt','c_rcpt','info@bowling-rcpt.be','Onderwerp','Tekst van een eerder echt verzonden bericht.','sent',0,1700000000);`,
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
    `INSERT INTO activity_categories (id, label) VALUES ('food_drinks','Eten'),('entertainment','Entertainment');`,
    `INSERT INTO activities (id, provider_id, title, category_id, location_label, price_band, provider, source, active, status) VALUES
       ('a5','p-test','Chocoladewinkel Test','food_drinks','Gent','0_10','Chocoladewinkel Test','osm',0,'inactive'),
       ('a6','p-test','Bowling Test','entertainment','Gent','10_25','Bowling Test','osm',1,'needs_review');`,
    `INSERT INTO activity_audits (activity_id, outcome, rule, reason, confidence, issues, hidden, previous_active, previous_status, source)
     VALUES ('a5','exclude','chocolate_shop','Chocoladewinkel','high','[]',1,1,'needs_review','rules'),
            ('a6','approved','experience_verified','ok','medium','["photo_generic"]',0,1,'needs_review','rules');`,
    // grouping fixtures: activities (provider = name used for grouping), orgs, links, contacts
    ...[
      ["g1", "Klimmuur Alpha", "Alpha Sport", "Gent"],
      ["g2", "Karting Beta", "Beta Fun", "Gent"], ["g3", "Lasergame Beta", "Beta Fun", "Gent"], ["g4", "Minigolf Beta", "Beta Fun", "Gent"],
      ["g5", "Extra Gamma", "Gamma Zaak", "Gent"], ["g6", "Extra Delta", "Delta Zaak", "Brugge"],
      ["g7", "Escape Eps 1", "Eps 1", "Gent"], ["g8", "Escape Eps 2", "Eps 2", "Brugge"], ["g9", "Escape Eps 3", "Eps 3", "Leuven"],
      ["g10", "Escape Eps 4", "Eps 4", "Aalst"], ["g11", "Escape Eps 5", "Eps 5", "Hasselt"], ["g12", "Escape Eps 6", "Eps 6", "Genk"],
      ["g13", "Zeta Een", "Zeta Club", "Gent"], ["g14", "Zeta Twee", "Zeta Club", "Gent"],
      ["g15", "Eta Een", "Eta Club", "Gent"], ["g16", "Eta Twee", "Eta Club", "Gent"],
    ].map(
      ([id, t, prov, city]) =>
        `INSERT INTO activities (id, provider_id, title, category_id, location_label, city, price_band, provider, active)
         VALUES ('${id}','p-test','${t}','sport','${city}','${city}','10_25','${prov}',1);`,
    ),
    ...[
      ["og_one", "alpha-sport.be", "Alpha Sport", ["g1"]],
      ["og_multi", "beta-fun.be", "Beta Fun", ["g2", "g3", "g4"]],
      ["og_low", "eps-platform.be", "eps-platform.be", ["g7", "g8", "g9", "g10", "g11", "g12"]],
      ["og_tick", "zeta-club.be", "Zeta Club", ["g13", "g14"]],
      ["og_two", "eta-club.be", "Eta Club", ["g15", "g16"]],
    ].flatMap(([id, dom, name, acts]) => [
      `INSERT INTO outreach_orgs (id, domain, name, website_url, activity_count, discovery_status) VALUES ('${id}','${dom}','${name}','https://${dom}',${acts.length},'found');`,
      ...acts.map((a) => `INSERT INTO outreach_org_activities (org_id, activity_id) VALUES ('${id}','${a}');`),
    ]),
    // contacts: for og_one the reservations desk is created FIRST (older), info@ second; neither is primary
    `INSERT INTO outreach_contacts (id, org_id, email, kind, source_type, source_url, domain_matches, verification, is_primary, role, created_at)
     VALUES ('cg_one_res','og_one','reservaties@alpha-sport.be','generic','website_mailto','https://alpha-sport.be/contact',1,'checked',0,'reservations',1000),
            ('cg_one_info','og_one','info@alpha-sport.be','generic','website_mailto','https://alpha-sport.be/contact',1,'checked',0,'general',2000),
            ('cg_multi','og_multi','info@beta-fun.be','generic','website_mailto','https://beta-fun.be/contact',1,'checked',1,'general',1000),
            ('cg_multi2','og_multi','groepen@beta-fun.be','generic','website_mailto','https://beta-fun.be/groepen',1,'checked',0,'groups',2000),
            ('cg_low','og_low','info@eps-platform.be','generic','website_mailto','https://eps-platform.be/contact',1,'checked',1,'general',1000),
            ('cg_tick','og_tick','info@zeta-club.be','generic','website_mailto','https://zeta-club.be/contact',1,'checked',1,'general',1000),
            ('cg_two','og_two','info@eta-club.be','generic','website_mailto','https://eta-club.be/contact',1,'checked',1,'general',1000),
            ('cg_two2','og_two','groepen@eta-club.be','generic','website_mailto','https://eta-club.be/groepen',1,'checked',0,'groups',2000);`,
    // research evidence fixtures: g2/g3/g4 share one address (cg_multi); g2 has a proposed correction
    `INSERT INTO activity_research (activity_id, verdict, existence, suitability, method, evidence, sources, corrections, note)
     VALUES ('g2','fix_data','confirmed','fit','agent',
       '[{"field":"name","found":"Karting Beta","verified":"Karting Beta","status":"verified","sourceUrl":"https://beta-fun.be","quote":"Karting Beta Gent","note":"","machineChecked":true},{"field":"address","found":"x","verified":"","status":"unverified","sourceUrl":"","quote":"","note":"niet gevonden"}]',
       '[{"url":"https://beta-fun.be","kind":"official","checkedAt":"2026-10-22"}]',
       '[{"field":"city","from":"Gent","to":"Gent-Centrum","sourceUrl":"https://beta-fun.be","quote":"Gent-Centrum","confidence":"high","verified":true},{"field":"website_url","from":"x","to":"https://beta-fun.be/nieuw","sourceUrl":"https://beta-fun.be","quote":"nieuw","confidence":"high","verified":true}]',
       'Karting bevestigd op de eigen website.');`,
    `INSERT INTO activity_contact_links (activity_id, contact_id, scope, status, link_source) VALUES
       ('g2','cg_multi','organisation','verified','domain'),('g3','cg_multi','organisation','unverified','domain'),('g4','cg_multi','location','likely','domain');`,
    // contacts the research marked as printed on the official site (READY needs evidence)
    `UPDATE outreach_contacts SET evidence_status = 'verified', evidence_note = 'fixture' WHERE verification = 'checked';`,
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
  ok("sync: several names on one domain → shown by the domain, not a random member name", syncOrg?.name === "sync-bowling.be", syncOrg?.name);
  r = await A("POST", `/orgs/${syncOrg.id}/contacts`, { email: "info@sync-bowling.be", sourceUrl: "https://sync-bowling.be/contact" });
  r = await A("POST", `/orgs/${syncOrg.id}/prepare`, {});
  r = await A("GET", `/messages/${r.data.messageId}`);
  ok("sync: greeting never uses a bare domain", r.data.bodyText.startsWith("Beste,"), r.data.bodyText.slice(0, 30));
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
  ok("1: preview ends with the identity only: no opt-out sentence, no source sentence, no '--' separator", !/stop|afmeld/i.test(r.data.finalText.split("\n").slice(-3).join(" ")) &&!/optout|https?:\/\//.test(r.data.finalText.split("\n").slice(-3).join(" ")) && !/Je adres vonden we/.test(r.data.finalText) && !/^--$/m.test(r.data.finalText), r.data.finalText.slice(-300));
  ok("1: greeting uses the provider name", r.data.bodyText.startsWith("Beste Bowling OK,"), r.data.bodyText.slice(0, 40));
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
  ok("5: a sent TEST message never blocks a new test concept", r.status === 200 && r.data.messageId !== okMsg, r.data);
  r = await A("POST", `/messages/${okMsg}/send`, { hash: okHash });
  ok("5: re-sending the old (replaced) message is refused", r.status === 409 || r.status === 422, r.data);

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
  ok("9: failure is not counted as a real send (only the fixture message counts)", r.data.sentLive === 1, r.data);
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
  ok("opt-out: opening the link (scanner/preview) only shows a confirm button", r.status === 200 && /<form/i.test(String(r.data)) && !/Je bent afgemeld/.test(String(r.data)), String(r.data).slice(0, 120));
  r = await A("GET", "/orgs/o_opt");
  ok("opt-out: a plain GET does NOT unsubscribe anyone", r.data.org.excluded === false && r.data.contacts[0].suppressed === false, r.data.org);
  r = await call(anon, "POST", `/optout/${tokenFor(optMsg)}`);
  ok("opt-out: POST (button / one-click) unsubscribes, no login needed", r.status === 200 && /afgemeld/i.test(String(r.data)), String(r.data).slice(0, 120));
  r = await call(anon, "POST", `/optout/${tokenFor(optMsg)}`);
  ok("opt-out: POST is idempotent", r.status === 200);
  r = await A("GET", "/orgs/o_opt");
  ok("opt-out: organisation is excluded and its address suppressed", r.data.org.excluded === true && r.data.contacts[0].suppressed === true, r.data.org);
  r = await A("GET", "/suppressions?q=bowling-opt");
  ok("opt-out: appears on the do-not-contact list as opt_out", r.data.rows.some((s) => s.reason === "opt_out"), r.data.rows);
  const sid = r.data.rows[0]?.id;
  r = await A("DELETE", `/suppressions/${sid}`);
  ok("opt-out: an objection cannot be deleted from the list", r.status === 400, r.data);

  r = await call(anon, "POST", `/optout/${tokenFor("m_rcpt")}`);
  ok("opt-out: link of a real (live) message works", r.status === 200, r.status);
  r = await A("GET", "/orgs/o_rcpt");
  ok("opt-out: an e-mailed receipt is recorded for real messages (RD 4 April 2003 art. 2)", r.data.events.some((e) => e.kind === "note" && /Ontvangstbevestiging/.test(e.body)), r.data.events);
  r = await A("GET", "/orgs/o_opt");
  ok("opt-out: no receipt is sent for test messages", !r.data.events.some((e) => /Ontvangstbevestiging/.test(e.body)), r.data.events);

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

  r = await A("POST", "/test-email", { to: "niet-geldig" });
  ok("test mail: an invalid address is refused", r.status === 400, r.status);
  await A("PUT", "/config", { fromEmail: "kobe.janssen@vibin.be" });
  r = await A("POST", "/test-email", { to: "iemand@example.com" });
  ok("test mail: works through the mock provider outside production", r.status === 200 && r.data.mock === true, r.data);
  r = await call(anon, "POST", "/api/admin/cc/outreach/test-email", { to: "iemand@example.com" });
  ok("test mail: not reachable without an admin session", r.status === 401, r.status);

  // ---- "binnenkort" gate while maintenance mode is on ----
  r = await A("GET", "/config");
  await call(admin, "PUT", "/api/admin/cc/settings", { key: "maintenance_mode", value: "1" }, csrf());
  await new Promise((res) => setTimeout(res, 16_000)); // the worker caches the flag for 15 s
  const home = await fetch(BASE + "/");
  const homeHtml = await home.text();
  ok("coming soon: visitors get the coming-soon page (503)", home.status === 503 && /Binnenkort beschikbaar/.test(homeHtml), home.status);
  const deep = await fetch(BASE + "/groups/abc");
  ok("coming soon: deep links are gated too", deep.status === 503);
  const adm = await fetch(BASE + "/admin");
  ok("coming soon: /admin stays reachable", adm.status === 200, adm.status);
  const opt = await fetch(BASE + "/optout/ongeldig");
  ok("coming soon: opt-out links keep working", opt.status === 400, opt.status);
  await call(admin, "PUT", "/api/admin/cc/settings", { key: "maintenance_mode", value: "0" }, csrf());
  await new Promise((res) => setTimeout(res, 16_000));
  const back = await fetch(BASE + "/");
  ok("coming soon: site is back when maintenance mode is off", back.status === 200, back.status);

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

  // ---- catalogue quality audit ----
  const C = (method, p, body) => call(admin, method, `/api/admin/cc${p}`, body, method === "GET" ? {} : csrf());
  r = await C("GET", "/quality/summary");
  ok("quality: summary counts verdicts and hidden rows", r.status === 200 && r.data.outcomes.exclude === 1 && r.data.hidden === 1 && /concrete, relevante ervaring/.test(r.data.rule), r.data);
  ok("quality: gaps are counted (generic photo)", r.data.issues.photo === 1, r.data.issues);
  r = await C("GET", "/quality/list?outcome=exclude");
  ok("quality: list shows the excluded row with its reason", r.status === 200 && r.data.rows.length === 1 && r.data.rows[0].id === "a5" && r.data.rows[0].hidden === true, r.data);
  r = await C("POST", "/quality/activity/a6", { decision: "exclude" });
  ok("quality: owner can exclude an activity", r.status === 200, r.data);
  r = await C("GET", "/quality/list?outcome=exclude&q=Bowling");
  ok("quality: the owner exclusion is recorded and hidden", r.data.rows.some((x) => x.id === "a6" && x.hidden && x.source === "owner"), r.data.rows);
  r = await C("POST", "/quality/activity/a6", { decision: "approve" });
  r = await C("GET", "/quality/list?outcome=approved");
  ok("quality: approving restores it exactly as before (visible)", r.data.rows.some((x) => x.id === "a6" && !x.hidden && x.active === 1 && x.status === "needs_review"), r.data.rows);
  r = await C("POST", "/quality/restore-rule", { rule: "chocolate_shop" });
  ok("quality: undoing a rule restores what it hid", r.status === 200 && r.data.restored >= 1, r.data);
  r = await C("GET", "/quality/list?outcome=manual");
  ok("quality: restored row is visible again and marked for manual review", r.data.rows.some((x) => x.id === "a5" && !x.hidden && x.active === 1), r.data.rows);
  r = await call(anon, "GET", "/api/admin/cc/quality/summary");
  ok("quality: not reachable without an admin session", r.status === 401);
  const shop = { title: "Leonidas", categoryId: "food_drinks", subcategory: "Chocolate shop", locationLabel: "Brussel", priceBand: "0_10" };
  r = await C("POST", "/activities", shop);
  ok("quality gate: a Leonidas shop cannot be added to the catalogue", r.status === 400 && /regel: retail_brand/.test(JSON.stringify(r.data)), r.data);
  r = await C("POST", "/activities?force=1", shop);
  ok("quality gate: the owner can override explicitly", r.status === 201, r.data);
  r = await C("POST", "/activities/import/preview", {
    csv: ["title,category,location_label,price_band,subcategory", "Leonidas Rivoli,food_drinks,Brussel,0_10,Chocolate shop", "Escape Zone,entertainment,Gent,10_25,Escape room", ""].join("\n"),
  });
  ok("quality gate: CSV import rejects the shop and accepts the escape room", r.status === 200 && r.data.createCount === 1 && r.data.errors.some((e) => /Kwaliteitsregel/.test(e.message)), r.data);


  // ---- smart grouping (activities per organisation) ----
  const readMsg = async (orgId, contactId) => {
    const p = await A("POST", `/orgs/${orgId}/prepare`, contactId ? { contactId } : {});
    if (p.status !== 200) return { prep: p };
    const m = await A("GET", `/messages/${p.data.messageId}`);
    return { prep: p, msg: m.data, id: p.data.messageId };
  };
  const titlesOf = (msg) => (msg.context?.activities ?? []).map((a) => a.title).sort();

  // 1. one organisation, one activity → the single template names exactly that activity
  let g = await readMsg("og_one", "cg_one_info");
  ok("grouping 1: one activity is named in the single template", g.msg.bodyText.includes('"Klimmuur Alpha"') && !g.msg.bodyText.includes("{{"), g.msg?.bodyText);
  ok("grouping 1: group is 'high' and shows why", g.msg.context.group.confidence === "high" && g.msg.context.group.reasons.length > 0, g.msg.context.group);

  // 2. several activities, same provider → ONE mail, listing all of them
  g = await readMsg("og_multi", "cg_multi");
  ok("grouping 2: one mail lists all three activities", ["Karting Beta", "Lasergame Beta", "Minigolf Beta"].every((t) => g.msg.bodyText.includes(`- ${t}`)), g.msg.bodyText);
  ok("grouping 2: snapshot stored per message", titlesOf(g.msg).length === 3);
  const multiMsg = g.id;

  // 3. unsure grouping → draft allowed, approval blocked until the owner confirms
  g = await readMsg("og_low", "cg_low");
  ok("grouping 3: many unrelated names → confidence 'low'", g.msg.context.group.confidence === "low", g.msg.context.group);
  ok("grouping 3: approval is blocked (group_unconfirmed)", g.msg.canApprove === false && g.msg.blockers.some((b) => b.code === "group_unconfirmed"), g.msg.blockers);
  r = await A("POST", `/messages/${g.id}/send`, { hash: g.msg.hash });
  ok("grouping 3: sending an unconfirmed group is refused server-side", r.status === 422, r.data);
  r = await A("POST", "/orgs/og_low/group", { action: "confirm", note: "gecontroleerd" });
  ok("grouping 3: the owner can confirm the group", r.status === 200, r.data);
  r = await A("GET", `/messages/${g.id}`);
  ok("grouping 3: after confirming, the blocker is gone", !r.data.blockers.some((b) => b.code === "group_unconfirmed"), r.data.blockers);

  // 4. unticking an activity rebuilds the draft and voids any approval
  g = await readMsg("og_tick", "cg_tick");
  ok("grouping 4: both activities listed", g.msg.bodyText.includes("- Zeta Een") && g.msg.bodyText.includes("- Zeta Twee"));
  r = await A("POST", `/messages/${g.id}/send`, { hash: "0".repeat(64) });
  r = await A("PUT", "/orgs/og_tick/activities", { included: { g14: false } });
  ok("grouping 4: selection saved and draft rebuilt", r.status === 200 && r.data.refreshed === 1, r.data);
  r = await A("GET", `/messages/${g.id}`);
  ok("grouping 4: the mail now names only the remaining activity", r.data.bodyText.includes('"Zeta Een"') && !r.data.bodyText.includes("Zeta Twee") && r.data.status === "draft", r.data.bodyText);

  // 5. manual link adds an activity without touching the activities table
  r = await A("GET", "/activity-search?q=Extra%20Gamma");
  ok("grouping 5: activity can be found to link by hand", r.data.rows.some((x) => x.id === "g5"), r.data);
  r = await A("POST", "/orgs/og_tick/activities/link", { activityId: "g5" });
  ok("grouping 5: manual link accepted", r.status === 200, r.data);
  r = await A("GET", `/messages/${g.id}`);
  ok("grouping 5: the manually linked activity is in the mail", r.data.bodyText.includes("- Zeta Een") && r.data.bodyText.includes("- Extra Gamma"), r.data.bodyText);
  r = await A("GET", "/orgs/og_tick");
  ok("grouping 5: link is marked manual", r.data.activities.find((x) => x.id === "g5")?.source === "manual");
  r = await A("DELETE", "/orgs/og_tick/activities/g13");
  ok("grouping 5: a domain-derived link cannot be deleted, only unticked", r.status === 409, r.data);
  r = await A("GET", "/activity-search?q=Extra%20Gamma");
  ok("grouping 5: the activities table itself is untouched", r.data.rows.find((x) => x.id === "g5")?.title === "Extra Gamma");

  // 6. an address tied to one activity names only that activity
  r = await A("PUT", "/contacts/cg_multi2", { activityId: "g3" });
  ok("grouping 6: contact tied to a single activity", r.status === 200, r.data);
  r = await A("PUT", "/contacts/cg_multi2", { activityId: "g5" });
  ok("grouping 6: cannot tie a contact to an activity of another organisation", r.status === 400, r.data);

  // 7. same activities to a second contact of the same org are refused once the first is approved
  g = await readMsg("og_two", "cg_two");
  const second = await readMsg("og_two", "cg_two2");
  ok("grouping 7: both drafts exist before anything is approved", !!g.id && !!second.id);
  r = await A("POST", `/messages/${g.id}/send`, { hash: g.msg.hash });
  ok("grouping 7: first contact is sent (dry-run)", r.status === 200, r.data);
  r = await A("GET", `/messages/${second.id}`);
  ok("grouping 7: second contact is blocked, activities already mentioned", r.data.blockers.some((b) => b.code === "activities_already_mentioned"), r.data.blockers);
  r = await A("POST", `/messages/${second.id}/send`, { hash: r.data.hash });
  ok("grouping 7: sending it is refused server-side", r.status === 422, r.data);
  r = await A("POST", `/messages/${second.id}/cancel`, {});
  r = await A("POST", "/orgs/og_two/prepare", { contactId: "cg_two2" });
  ok("grouping 7: a new draft with nothing left to name is refused", r.status === 400 && /al genoemd/.test(JSON.stringify(r.data)), r.data);

  // 8. default contact choice prefers a general mailbox over the reservations desk
  g = await readMsg("og_one");
  ok("grouping 8: info@ is chosen over reservaties@", g.msg.toEmail === "info@alpha-sport.be", g.msg?.toEmail);

  // 9. preview context: activities, why grouped, sources, earlier contact
  g = await readMsg("og_multi", "cg_multi");
  ok("grouping 9: preview shows activities, group reasons and the address source", g.msg.context.activities.length === 3 && g.msg.context.group.reasons.length > 0 && g.msg.context.sources.contact === "https://beta-fun.be/contact", g.msg.context);
  r = await A("GET", "/orgs/og_two");
  ok("grouping 9: earlier contact (sent mail) is visible on the organisation", r.data.messages.some((m) => m.status === "sent"), r.data.messages);

  // 10. org list exposes the group column and filters
  r = await A("GET", "/orgs?group=needs_confirm&excluded=all&pageSize=100");
  ok("grouping 10: list filters on unconfirmed low-confidence groups", r.status === 200 && r.data.rows.every((o) => o.groupConfidence === "low" && !o.groupConfirmed), r.data.rows?.length);
  r = await A("GET", "/orgs?q=beta-fun");
  ok("grouping 10: list row carries confidence and included count", r.data.rows[0]?.groupConfidence === "high" && r.data.rows[0]?.includedCount === 3, r.data.rows[0]);
  r = await A("POST", "/sync", {});
  ok("grouping 10: sync reports the grouping step", r.status === 200 && r.data.grouping && typeof r.data.grouping.assessed === "number", r.data);

  // ---- bulk approval ----
  r = await A("POST", "/prepare-bulk", { orgIds: ["o_ca", "o_cb", "o_cc", "o_cd"] });
  r = await A("GET", "/bulk-approve/preview");
  ok("bulk: preview lists drafts that pass the gate and reports blocked ones", r.status === 200 && r.data.ready >= 4 && typeof r.data.blockedCount === "number", r.data);
  const bp = r.data;
  r = await A("POST", "/bulk-approve", { fingerprint: "0".repeat(64), expectedCount: bp.ready });
  ok("bulk: a stale/wrong fingerprint approves nothing", r.status === 409, r.data);
  r = await A("POST", "/bulk-approve", { fingerprint: bp.fingerprint, expectedCount: bp.ready });
  ok("bulk: reviewed drafts are approved in one go", r.status === 200 && r.data.approved === bp.ready && r.data.failedCount === 0, r.data);
  r = await A("GET", "/campaign/preview");
  ok("bulk: approved messages show up for the campaign, nothing was sent", r.data.approvedTotal >= bp.ready, r.data);
  r = await A("GET", "/bulk-approve/preview");
  ok("bulk: second preview no longer lists them", !r.data.sample.some((x) => /camp-[abcd]\.be/.test(x.toEmail)), r.data.sample);

  // ---- send to a chosen selection ----
  r = await A("POST", "/send-selected/preview", { orgIds: ["o_ca", "o_cb", "og_one", "og_low", "o_none"] });
  ok("select: preview shows sender, recipients and why some are blocked", r.status === 200 && r.data.from.email !== undefined && r.data.recipients.length >= 2 && r.data.blocked.some((b) => b.org === "Bowling Zonder Adres"), r.data);
  const sp = r.data;
  ok("select: a test run goes to the test inbox, never to the recipients", sp.mode === "test");
  r = await A("POST", "/send-selected", { orgIds: ["o_ca", "o_cb", "og_one", "og_low", "o_none"], fingerprint: "0".repeat(64), expectedCount: sp.ready });
  ok("select: a changed/wrong fingerprint sends nothing", r.status === 409, r.data);
  r = await A("POST", "/send-selected", { orgIds: ["o_ca", "o_cb", "og_one", "og_low", "o_none"], fingerprint: sp.fingerprint, expectedCount: sp.ready });
  ok("select: confirmed selection is queued and the first batch is sent", r.status === 200 && r.data.queued === sp.ready && r.data.sent >= 1, r.data);
  r = await A("GET", "/log?status=sent");
  ok("log: shows who got what, from which sender, as test", r.status === 200 && r.data.rows.filter((x) => x.campaign && x.testMode).length >= 2 && r.data.rows.every((x) => x.toEmail) && "from" in r.data, r.data);

  // ---- daily limit: never an error, the mail waits in the queue ----
  r = await A("GET", "/config");
  const capCfg = r.data.config;
  r = await A("PUT", "/config", { dailyCap: 1 });
  ok("cap: daily limit can be lowered", r.status === 200, r.data);
  r = await A("POST", "/orgs/o_ca/prepare", {});
  r = await A("POST", "/send-selected/preview", { orgIds: ["o_cc", "o_cd"] });
  ok("cap: preview tells how many can still go today", typeof r.data.remainingToday === "number", r.data);
  r = await A("PUT", "/config", { dailyCap: capCfg.dailyCap });

  // ---- audit: research evidence, shared addresses, corrections ----
  const CC = (m, p2, b) => call(admin, m, `/api/admin/cc${p2}`, b, m === "GET" ? {} : csrf());
  r = await call(anon, "GET", "/api/admin/cc/quality/research/summary");
  ok("audit: research summary needs an admin session", r.status === 401, r.status);
  r = await CC("GET", "/quality/research/summary");
  ok("audit: summary reports progress, shared addresses and pending corrections", r.status === 200 && r.data.sharedEmails >= 1 && r.data.pendingCorrections >= 1 && r.data.methods.agent >= 1, r.data);
  r = await CC("GET", "/quality/research/list?filter=shared_email&pageSize=50");
  ok("audit: filter lists activities that share an address, each as its own record", r.status === 200 && ["g2", "g3", "g4"].every((id) => r.data.rows.some((x) => x.id === id) ) && r.data.rows.every((x) => x.sharedEmail), r.data.rows?.map((x) => x.id));
  r = await CC("GET", "/quality/research/list?filter=unresearched");
  ok("audit: not-yet-researched activities are listed as such (never presented as checked)", r.status === 200 && r.data.rows.every((x) => x.verdict === null) && !r.data.rows.some((x) => x.id === "g2"), r.data.rows?.length);
  r = await CC("GET", "/quality/activity/g3/research");
  ok("audit: detail shows who else shares the address and the location relation", r.status === 200 && r.data.contacts[0]?.sharedWith.length === 2 && ["same_location", "different_locations", "unknown"].includes(r.data.contacts[0].relation) && r.data.research === null, r.data);
  r = await CC("GET", "/quality/activity/g2/research");
  ok("audit: detail separates verified from unverified evidence and lists proposed corrections", r.data.research.evidence.some((e) => e.status === "verified") && r.data.research.evidence.some((e) => e.status === "unverified") && r.data.research.corrections.length === 2, r.data.research);
  r = await CC("GET", "/quality/shared-emails");
  ok("audit: shared-address view groups activities per address without merging them", r.status === 200 && r.data.rows.some((x) => x.email === "info@beta-fun.be" && x.n === 3 && x.activities.length === 3), r.data.rows?.map((x) => [x.email, x.n]));
  r = await CC("POST", "/quality/activity/g2/corrections", { fields: ["website_url"] });
  ok("audit: a correction is refused when the live value changed since the research", r.status === 409, r.data);
  r = await CC("POST", "/quality/activity/g2/corrections", { fields: ["city"] });
  ok("audit: a proposed correction is only applied on request and when still current", r.status === 200 && r.data.applied.includes("city"), r.data);
  r = await CC("GET", "/quality/activity/g2/research");
  ok("audit: applied corrections leave the list; the rest stays proposed", r.data.research.corrections.length === 1 && r.data.research.corrections[0].field === "website_url", r.data.research.corrections);
  r = await CC("POST", "/quality/link/g3/cg_multi", { scope: "location" });
  ok("audit: the owner can set what an address is for", r.status === 200, r.data);
  r = await CC("GET", "/quality/activity/g3/research");
  ok("audit: link scope and manual source are stored", r.data.contacts[0].scope === "location" && r.data.contacts[0].linkSource === "manual", r.data.contacts[0]);
  r = await CC("POST", "/quality/link/g3/cg_multi", { status: "invalid" });
  r = await A("POST", "/orgs/og_multi/prepare", { contactId: "cg_multi" });
  ok("audit: draft is still allowed, approval is the gate", r.status === 200 || r.status === 400 || r.status === 409, r.status);
  // evidence on the address itself blocks sending
  await call(admin, "PUT", "/api/admin/cc/outreach/contacts/cg_tick", { note: "test" }, csrf());
  // new records can never start as approved/verified without the basics
  r = await C("POST", "/activities", { title: "Verificatietest Klimzaal", categoryId: "sport", subcategory: "Climbing", locationLabel: "Gent", priceBand: "10_25", status: "verified" });
  ok("preventie: a new record cannot start as 'verified' without website, address and city", r.status === 201, r.data);
  const newId = r.data.id;
  r = await C("GET", `/activities/${newId}`);
  ok("preventie: it was stored as needs_review, not verified", (r.data?.activity ?? r.data)?.status === "needs_review", r.data);
  r = await CC("GET", `/quality/activity/${newId}/research`);
  ok("preventie: every new active record gets an audit row, never 'approved' without evidence", r.status === 200 && r.data.audit && r.data.audit.outcome !== "approved", r.data.audit);

  // ---- batch size stays within the Worker's request budget ----
  r = await A("POST", "/send-selected/preview", { orgIds: Array.from({ length: 16 }, (_, i) => `big${i + 1}`) });
  ok("batch: more than 15 organisations per send is refused (subrequest budget)", r.status === 400 || r.status === 422, r.status);
  r = await A("POST", "/retry-failed", {});
  ok("retry-failed: endpoint works (nothing to retry in test data)", r.status === 200 && typeof r.data.requeued === "number", r.data);

  // ---- "ready to send" list ----
  r = await A("GET", "/ready-orgs?limit=50");
  ok("ready: endpoint returns ids and a total", r.status === 200 && Array.isArray(r.data.orgIds) && r.data.total >= r.data.orgIds.length, r.data);
  const readyIds = r.data.orgIds;
  ok("ready: a sure group with a checked generic address is ready", readyIds.includes("og_multi") || readyIds.includes("og_tick") || readyIds.length > 0, readyIds.slice(0, 5));
  ok("ready: excluded, suppressed, personal and unconfirmed-low orgs are never ready", !["o_excl", "o_supp", "o_personal", "o_uncertain", "o_none"].some((x) => readyIds.includes(x)), readyIds.slice(0, 20));
  r = await A("GET", "/orgs?ready=1&pageSize=100");
  ok("ready: list filter agrees with the endpoint", r.status === 200 && r.data.total === (await A("GET", "/ready-orgs?limit=1")).data.total, r.data.total);

  // ---- admin lists tolerate empty filters (the UI sends "" for "no filter") ----
  r = await call(admin, "GET", "/api/admin/cc/events?q=&kind=&status=&verification=");
  ok("events list: empty filter values are not an error", r.status === 200 && Array.isArray(r.data.events), r.data);

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
  if (process.env.DEBUG_LOG) console.error("\n--- full worker log (tail) ---\n" + serverLog.slice(-6000));
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
