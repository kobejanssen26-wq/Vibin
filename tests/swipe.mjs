/**
 * Owner Swipe Manager tests. Self-contained: they migrate a throw-away local D1, start
 * `wrangler dev` against it, drive the real HTTP API and read the database back directly.
 *
 *   node tests/swipe.mjs            (from the repo root; needs `npm run build` + .dev.vars like the other suites)
 *
 * Scenarios of the brief:
 *   1 swipe left · 2 swipe right · 3 undo · 4 skip (later) · 5 restore · 6 add · 7 edit
 *   8 gone from the normal VIBIN experience · 9 the AI/audit pipeline skips deleted ones
 *   10 audit busy while the owner deletes · 11 survives refresh/DB read-back · 12 owner only
 * plus: optimistic locking (stale version, two tabs racing), quality rule, duplicates,
 * "previously deleted" protection, relations (votes) preserved, import never resurrects.
 */
import { spawn, execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const PORT = Number(process.env.PORT ?? 8798);
const BASE = `http://127.0.0.1:${PORT}`;
const STATE = fs.mkdtempSync(path.join(os.tmpdir(), "vibin-swipe-"));
const IS_WIN = process.platform === "win32";
const ROOT = process.cwd();

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

/* ------------------------------ plumbing ------------------------------ */
function wrangler(args, opts = {}) {
  return execFileSync(IS_WIN ? "npx.cmd" : "npx", ["wrangler", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], shell: IS_WIN, ...opts });
}
const sqlFile = (file) => wrangler(["d1", "execute", "vibin-db", "--local", "--persist-to", STATE, "--file", file]);
/** Read straight from the database (independent of the API under test). */
function dbq(sql) {
  const out = wrangler(["d1", "execute", "vibin-db", "--local", "--persist-to", STATE, "--command", sql, "--json"]);
  return JSON.parse(out.slice(out.indexOf("[")))[0].results;
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
  const buf = Buffer.alloc(8);
  buf.writeBigInt64BE(BigInt(Math.floor(Date.now() / 1000 / 30)));
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
  // fresh connection per request: the dev server drops idle keep-alive sockets while a slow DB read-back runs
  const h = { "content-type": "application/json", connection: "close", ...extra };
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
  return { status: res.status, data };
}

/* ------------------------------ fixtures ------------------------------ */
const ACT = (id, title, city, extra = {}) => {
  const e = { website: `https://www.${id}.be`, status: "needs_review", active: 1, cat: "sport", lat: 51050000, lng: 3720000, provider: title, ...extra }; // near Gent: a group with a location only deals activities that have coordinates
  return `INSERT INTO activities (id, provider_id, title, category_id, location_label, city, address, price_band, provider, website_url, status, active, lat, lng, description)
          VALUES ('${id}','p-test','${title}','${e.cat}','${city}','${city}','Teststraat 1','10_25','${e.provider}','${e.website}','${e.status}',${e.active},${e.lat},${e.lng},'Beschrijving van ${title}.');`;
};
function fixtureSql() {
  return [
    `INSERT INTO providers (id, name, kind) VALUES ('p-test','Test','dataset');`,
    `INSERT INTO activity_categories (id, label) VALUES ('sport','Sport'),('culture','Cultuur'),('food_drinks','Eten');`,
    ACT("s1", "Klimhal Alpha", "Gent"),
    ACT("s2", "Karting Beta", "Gent"),
    ACT("s3", "Museum Gamma", "Brugge", { status: "verified", cat: "culture" }),
    ACT("s4", "Escape Delta", "Leuven"),
    ACT("s5", "Bowling Epsilon", "Gent", { active: 0, status: "inactive" }),
    ACT("s6", "Spa Zeta", "Brugge"),
    ACT("s7", "Laser Eta", "Gent"),
    ACT("s8", "Minigolf Theta", "Aalst"),
    ACT("s9", "Padel Iota", "Gent"),
    ACT("s10", "Boulder Kappa", "Hasselt"),
    ACT("s11", "Trampoline Lambda", "Gent"),
    ACT("s12", "Karaoke Mu", "Gent"),
    // audit rows: s5 hidden by a RULE (so "keep" must overrule it), s6 flagged manual
    `INSERT INTO activity_audits (activity_id, outcome, rule, reason, confidence, issues, hidden, previous_active, previous_status, source)
     VALUES ('s5','exclude','some_rule','door regel','high','[]',1,1,'needs_review','rules'),
            ('s6','manual','x','check','medium','["photo_generic"]',0,NULL,NULL,'rules'),
            ('s2','fix_data','x','fix','medium','[]',0,NULL,NULL,'rules');`,
    // research
    `INSERT INTO activity_research (activity_id, verdict, existence, suitability, method, evidence, sources, corrections, note)
     VALUES ('s6','manual','unconfirmed','unclear','agent','[]','[]','[{"field":"city","from":"Brugge","to":"Damme","confidence":"high"}]','Onzeker of het nog bestaat.');`,
    // organisation + contact for s1
    `INSERT INTO outreach_orgs (id, domain, name, website_url, activity_count, discovery_status) VALUES ('o1','klimhal-alpha.be','Klimhal Alpha vzw','https://klimhal-alpha.be',1,'found');`,
    `INSERT INTO outreach_org_activities (org_id, activity_id) VALUES ('o1','s1');`,
    `INSERT INTO outreach_contacts (id, org_id, email, kind, source_type, source_url, domain_matches, verification, is_primary, evidence_status)
     VALUES ('c1','o1','info@klimhal-alpha.be','generic','website_mailto','https://klimhal-alpha.be/contact',1,'checked',1,'verified');`,
    `INSERT INTO activity_contact_links (activity_id, contact_id, scope, status, link_source) VALUES ('s1','c1','organisation','verified','domain');`,
  ].join("\n");
}

/* -------------------------------- run -------------------------------- */
let server;
let serverLog = "";
async function stop() {
  if (!server) return;
  try {
    if (IS_WIN) execFileSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore" });
    else process.kill(-server.pid, "SIGTERM"); // the whole group: npx → wrangler → workerd
  } catch {
    /* gone */
  }
}
async function boot() {
  console.log("• migrating throw-away local D1 …");
  wrangler(["d1", "migrations", "apply", "vibin-db", "--local", "--persist-to", STATE]);
  const file = path.join(STATE, "fixtures.sql");
  fs.writeFileSync(file, fixtureSql());
  sqlFile(file);
  console.log("• starting wrangler dev on", BASE);
  server = spawn(IS_WIN ? "npx.cmd" : "npx", ["wrangler", "dev", "--port", String(PORT), "--persist-to", STATE], { stdio: ["ignore", "pipe", "pipe"], shell: IS_WIN, detached: !IS_WIN });
  let log = "";
  server.stdout.on("data", (d) => ((log += d), (serverLog += d)));
  server.stderr.on("data", (d) => ((log += d), (serverLog += d)));
  const t0 = Date.now();
  for (;;) {
    try {
      if ((await fetch(`${BASE}/api/health`)).ok) break;
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
  const email = `swipe-owner${Date.now()}@vibin.local`;
  let r = await call(admin, "POST", "/api/admin/auth/setup/begin", { email, password: "owner-super-secret-123" });
  const csrf = () => ({ "x-vibin-admin-csrf": admin.get("vibin_admin_csrf") });
  r = await call(admin, "POST", "/api/admin/auth/mfa/enroll/confirm", { code: totp(r.data.secret) }, csrf());
  ok("owner signed in with MFA", r.status === 200, r.data);
  const S = (method, p, body) => call(admin, method, `/api/admin/cc/swipe${p}`, body, method === "GET" ? {} : csrf());
  const CC = (method, p, body) => call(admin, method, `/api/admin/cc${p}`, body, method === "GET" ? {} : csrf());
  const decide = (id, decision, expectedVersion) => S("POST", "/decide", { activityId: id, decision, expectedVersion });
  const act = (id) => dbq(`SELECT active, status FROM activities WHERE id='${id}'`)[0];
  const dec = (id) => dbq(`SELECT decision, version, prev_active, prev_status FROM owner_activity_decisions WHERE activity_id='${id}'`)[0];

  /* ---- 12. only the owner ---- */
  console.log("\n12 · toegang alleen voor de eigenaar");
  const anon = jar();
  for (const [m, p, b] of [["GET", "/queue"], ["GET", "/summary"], ["POST", "/decide", { activityId: "s1", decision: "delete", expectedVersion: 0 }], ["POST", "/undo", { activityId: "s1", expectedVersion: 1 }], ["POST", "/activities", {}], ["GET", "/recent"], ["GET", "/suggest?kind=city&q=ge"], ["GET", "/activity/s1"], ["POST", "/reresearch", {}]]) {
    r = await call(anon, m, `/api/admin/cc/swipe${p}`, b);
    ok(`geen sessie → 401 op ${m} ${p}`, r.status === 401, r.status);
  }
  const user = jar();
  r = await call(user, "POST", "/api/auth/signup", { displayName: "Gewone", email: `gewone${Date.now()}@example.com`, password: "normal-user-pw-123" });
  const ucsrf = () => ({ "x-vibin-csrf": user.get("vibin_csrf") ?? "" });
  r = await call(user, "POST", "/api/admin/cc/swipe/decide", { activityId: "s1", decision: "delete", expectedVersion: 0 }, ucsrf());
  ok("gewone gebruiker kan niet verwijderen (401)", r.status === 401, r.status);
  r = await call(user, "GET", "/api/admin/cc/swipe/queue");
  ok("gewone gebruiker kan de wachtrij niet lezen (401)", r.status === 401, r.status);
  r = await call(admin, "POST", "/api/admin/cc/swipe/decide", { activityId: "s1", decision: "delete", expectedVersion: 0 });
  ok("eigenaar zonder admin-CSRF-token → 403", r.status === 403, r.status);
  ok("…en er is niets veranderd", act("s1").active === 1 && !dec("s1"));

  /* ---- reading ---- */
  console.log("\nlezen · voortgang, kaarten en filters (echte data)");
  r = await S("GET", "/summary");
  ok("voortgang komt uit de database: 12 totaal, 12 nog te beoordelen", r.data.total === 12 && r.data.unreviewed === 12 && r.data.keep === 0 && r.data.deleted === 0 && r.data.later === 0, r.data);
  ok("onderzoeksteller klopt (1 onderzocht, 11 niet)", r.data.researched === 1 && r.data.unresearched === 11, r.data);
  r = await S("GET", "/queue?limit=40");
  ok("standaardlijst = alleen actieve, niet-beoordeelde (11)", r.data.cards.length === 11 && r.data.total === 11 && !r.data.cards.some((c) => c.id === "s5"), r.data.cards.map((c) => c.id));
  const s1 = r.data.cards.find((c) => c.id === "s1");
  ok("kaart toont naam, adres, plaats, website, e-mail, organisatie, status", s1 && s1.title === "Klimhal Alpha" && s1.address === "Teststraat 1" && s1.city === "Gent" && s1.websiteUrl && s1.contacts[0]?.email === "info@klimhal-alpha.be" && s1.contacts[0]?.evidence === "verified" && s1.organisation?.name === "Klimhal Alpha vzw" && s1.status === "needs_review" && s1.decision === null && s1.version === 0, s1);
  const s6 = r.data.cards.find((c) => c.id === "s6");
  ok("kaart toont onderzoeksnotitie en correctievoorstellen", s6?.research?.note === "Onzeker of het nog bestaat." && s6.research.pendingCorrections === 1, s6?.research);
  r = await S("GET", "/queue?visibility=hidden&limit=40");
  ok("filter 'verborgen' toont alleen de door de audit verborgen activiteit", r.data.cards.length === 1 && r.data.cards[0].id === "s5" && r.data.cards[0].active === false, r.data.cards.map((c) => c.id));
  r = await S("GET", "/queue?visibility=all&limit=40");
  ok("filter 'actief + verborgen' toont alles (12)", r.data.total === 12, r.data.total);
  r = await S("GET", "/queue?research=manual&visibility=all");
  ok("filter 'handmatige controle nodig'", r.data.cards.map((c) => c.id).sort().join() === "s6", r.data.cards.map((c) => c.id));
  r = await S("GET", "/queue?research=unresearched&limit=40");
  ok("filter 'nog niet onderzocht'", r.data.total === 10 && !r.data.cards.some((c) => c.id === "s6"), r.data.total);
  r = await S("GET", "/queue?category=culture");
  ok("filter per categorie", r.data.cards.length === 1 && r.data.cards[0].id === "s3");
  r = await S("GET", "/queue?city=brugge&limit=40");
  ok("filter per locatie (hoofdletterongevoelig)", r.data.cards.map((c) => c.id).sort().join() === "s3,s6", r.data.cards.map((c) => c.id));
  r = await S("GET", "/queue?org=o1");
  ok("filter per organisatie", r.data.cards.length === 1 && r.data.cards[0].id === "s1");
  r = await S("GET", "/queue?email=klimhal-alpha");
  ok("filter per e-mailadres", r.data.cards.length === 1 && r.data.cards[0].id === "s1");
  r = await S("GET", "/queue?q=" + encodeURIComponent("100%_x'; DROP TABLE activities;--"));
  ok("zoeken met speciale tekens/SQL-injectie is veilig", r.status === 200 && r.data.cards.length === 0 && dbq("SELECT COUNT(*) AS n FROM activities")[0].n === 12);
  r = await S("GET", "/queue?limit=4");
  const page1 = r.data.cards.map((c) => c.id);
  const r2 = await S("GET", `/queue?limit=4&after=${r.data.next}`);
  ok("paginering met cursor geeft verse kaarten zonder overlap", r2.data.cards.length === 4 && !r2.data.cards.some((c) => page1.includes(c.id)) && r2.data.total === null, { page1, p2: r2.data.cards.map((c) => c.id) });
  r = await S("GET", "/suggest?kind=city&q=ge");
  ok("suggesties voor plaats", r.data.items.some((i) => i.value === "Gent"), r.data);

  /* ---- 2. swipe right ---- */
  console.log("\n2 · naar rechts: behouden");
  r = await decide("s1", "keep", 0);
  ok("behouden wordt opgeslagen (versie 1)", r.status === 200 && r.data.version === 1 && r.data.decision === "keep", r.data);
  ok("in de database: besluit 'keep', activiteit nog actief", dec("s1")?.decision === "keep" && act("s1").active === 1);
  ok("behouden ≠ geverifieerd: status blijft needs_review", act("s1").status === "needs_review");
  r = await S("GET", "/queue?limit=40");
  ok("niet opnieuw ter beoordeling aangeboden", !r.data.cards.some((c) => c.id === "s1"));
  r = await S("GET", "/queue?review=keep");
  ok("staat onder 'Behouden'", r.data.cards.map((c) => c.id).join() === "s1" && r.data.cards[0].decision === "keep" && r.data.cards[0].version === 1);

  /* ---- optimistic locking ---- */
  console.log("\nversiecontrole · oud scherm en twee tabbladen");
  r = await decide("s1", "delete", 0);
  ok("beslissing op basis van een verouderde versie wordt geweigerd (409)", r.status === 409 && r.data.details?.code === "version_conflict" && r.data.details.currentVersion === 1, r.data);
  ok("…en er is niets veranderd", dec("s1").decision === "keep" && act("s1").active === 1);
  const [ra, rb] = await Promise.all([decide("s7", "delete", 0), decide("s7", "keep", 0)]);
  const winners = [ra, rb].filter((x) => x.status === 200).length;
  ok("twee gelijktijdige beslissingen: precies één wint, de ander krijgt 409", winners === 1 && [ra, rb].filter((x) => x.status === 409).length === 1, [ra.status, rb.status]);
  const finalS7 = dec("s7");
  ok("de database is consistent met de winnaar", finalS7.version === 1 && (finalS7.decision === "delete" ? act("s7").active === 0 : act("s7").active === 1), { finalS7, a: act("s7") });
  r = await decide("s7", finalS7.decision === "delete" ? "delete" : "keep", 1);
  ok("dezelfde beslissing nogmaals = geen nieuwe versie (idempotent)", r.status === 200 && r.data.noop === true && dec("s7").version === 1, r.data);
  // tidy: bring s7 back to a known state for later scenarios
  if (finalS7.decision === "delete") await decide("s7", "keep", 1);

  /* ---- 1. swipe left (+ 8 gone from VIBIN) ---- */
  console.log("\n1 + 8 · naar links: verwijderen, en weg uit de gewone VIBIN-ervaring");
  // a running group deck that contains s9 and a vote on it (relations must survive)
  const member = jar();
  r = await call(member, "POST", "/api/auth/signup", { displayName: "Lid", email: `lid${Date.now()}@example.com`, password: "supersecret123" });
  const mcsrf = () => ({ "x-vibin-csrf": member.get("vibin_csrf") ?? "" });
  const M = (m, p, b) => call(member, m, `/api/${p.replace(/^\//, "")}`, b, m === "GET" ? {} : mcsrf());
  r = await M("POST", "/groups", { name: "Testgroep" });
  ok("testgroep aangemaakt", r.status === 201 && r.data.group?.id, { status: r.status, data: r.data });
  const gid = r.data.group.id;
  const GROUP_SETTINGS = { categories: [], allActivities: true, locationLabel: "Gent", lat: null, lng: null, radiusKm: 50, budgetBand: "any", dateMode: "unknown", dateSpecific: null, timeBand: "unknown", timeSpecific: null };
  r = await M("PUT", `/groups/${gid}/settings`, GROUP_SETTINGS);
  ok("groepsinstellingen opgeslagen", r.status === 200, { status: r.status, data: r.data });
  // a second member, who will hold a vote on the activity the owner deletes (a relation that must survive)
  const member2 = jar();
  await call(member2, "POST", "/api/auth/signup", { displayName: "Lid2", email: `lid2${Date.now()}@example.com`, password: "supersecret123" });
  const m2csrf = () => ({ "x-vibin-csrf": member2.get("vibin_csrf") ?? "" });
  const M2 = (m, p, b) => call(member2, m, `/api/${p.replace(/^\//, "")}`, b, m === "GET" ? {} : m2csrf());
  const invite = (await M("GET", `/groups/${gid}`)).data.group.inviteCode;
  r = await M2("POST", `/invites/${invite}/join`, {});
  ok("tweede lid doet mee via uitnodiging", r.status === 200, r.data);
  r = await M("POST", `/groups/${gid}/start`, {});
  ok("groep gestart", r.status === 200, { status: r.status, data: r.data });
  r = await M("GET", `/groups/${gid}/swipe`);
  const deckIds = r.data.queue.map((c) => c.activity.id);
  ok("groep heeft een lopend deck met activiteiten", deckIds.length >= 5, deckIds);
  const victim = deckIds[0];
  const voted = deckIds[1];
  await M("POST", `/groups/${gid}/swipe`, { activityId: voted, value: "like" });
  const votesBefore = dbq(`SELECT COUNT(*) AS n FROM activity_votes WHERE activity_id='${voted}'`)[0].n;
  r = await M2("POST", `/groups/${gid}/swipe`, { activityId: victim, value: "like" });
  ok("lid 2 stemt op de kaart die straks verwijderd wordt", r.status === 200, r.data);
  const victimVotes = dbq(`SELECT COUNT(*) AS n FROM activity_votes WHERE activity_id='${victim}'`)[0].n;
  ok("lid 1 heeft de kaart nog in de wachtrij vóór de verwijdering", (await M("GET", `/groups/${gid}/swipe`)).data.queue.some((c) => c.activity.id === victim));
  const queueBefore = (await M("GET", `/groups/${gid}/swipe`)).data.queue.length;

  r = await decide(victim, "delete", 0);
  ok("verwijderen wordt opgeslagen", r.status === 200 && r.data.decision === "delete" && r.data.active === false && r.data.status === "inactive", r.data);
  ok("database: soft-delete (active=0, status=inactive), rij bestaat nog", act(victim).active === 0 && act(victim).status === "inactive");
  ok("database: eigenaarsbesluit + auditregel (bron 'owner') + logboek", dec(victim).decision === "delete" && dbq(`SELECT source, hidden FROM activity_audits WHERE activity_id='${victim}'`)[0]?.source === "owner" && dbq(`SELECT COUNT(*) AS n FROM owner_decision_log WHERE activity_id='${victim}'`)[0].n === 1);
  r = await S("GET", "/queue?limit=40");
  ok("uit de beoordelingslijst", !r.data.cards.some((c) => c.id === victim));
  r = await S("GET", "/queue?review=delete");
  ok("staat onder 'Verwijderd' met vlag 'deleted'", r.data.cards.length === 1 && r.data.cards[0].id === victim && r.data.cards[0].deleted === true);
  // normal VIBIN experience
  r = await call(member, "GET", "/api/activities?limit=100");
  ok("gewone activiteitenlijst toont hem niet meer", Array.isArray(r.data.activities) && !r.data.activities.some((a) => a.id === victim) && r.data.activities.some((a) => a.id === "s1"), r.data.activities?.length);
  r = await call(member, "GET", `/api/activities/${victim}`);
  ok("detailpagina geeft 404", r.status === 404, r.status);
  r = await M("GET", `/groups/${gid}/swipe`);
  ok("lopend swipe-deck: de verwijderde kaart verdwijnt uit de wachtrij, de rest blijft", !r.data.queue.some((c) => c.activity.id === victim) && r.data.queue.length === queueBefore - 1, { before: queueBefore, after: r.data.queue.map((c) => c.activity.id), victim });
  r = await M("POST", `/groups/${gid}/swipe`, { activityId: victim, value: "like" });
  ok("een oude kaart kan geen stem/match meer opleveren (409)", r.status === 409, r.data);
  ok("relaties blijven bewaard: bestaande stemmen niet gewist", dbq(`SELECT COUNT(*) AS n FROM activity_votes WHERE activity_id='${victim}'`)[0].n === victimVotes && dbq(`SELECT COUNT(*) AS n FROM activity_votes WHERE activity_id='${voted}'`)[0].n === votesBefore);
  const g2 = await M("POST", "/groups", { name: "Tweede" });
  await M("PUT", `/groups/${g2.data.group.id}/settings`, GROUP_SETTINGS);
  await M("POST", `/groups/${g2.data.group.id}/start`, {});
  r = await M("GET", `/groups/${g2.data.group.id}/swipe`);
  ok("nieuwe aanbevelingen (nieuw deck) bevatten hem niet", !r.data.queue.some((c) => c.activity.id === victim));

  /* ---- 3. undo ---- */
  console.log("\n3 · terug: beslissing ongedaan maken");
  r = await S("POST", "/undo", { activityId: victim, expectedVersion: 5 });
  ok("ongedaan maken met verkeerde versie → 409", r.status === 409, r.data);
  r = await S("POST", "/undo", { activityId: victim, expectedVersion: 1 });
  ok("verwijderen ongedaan gemaakt", r.status === 200 && r.data.decision === "none" && r.data.version === 2 && r.data.active === true, r.data);
  ok("database: precies terug zoals het was (actief, oorspronkelijke status, geen auditregel)", act(victim).active === 1 && act(victim).status === "needs_review" && dbq(`SELECT COUNT(*) AS n FROM activity_audits WHERE activity_id='${victim}' AND source='owner'`)[0].n === 0 && dec(victim).decision === "none");
  r = await S("GET", "/queue?limit=40");
  ok("terug in de lijst 'nog niet beoordeeld'", r.data.cards.some((c) => c.id === victim));
  r = await call(member, "GET", `/api/activities/${victim}`);
  ok("en weer zichtbaar voor gewone gebruikers", r.status === 200, r.status);
  r = await S("POST", "/undo", { activityId: victim, expectedVersion: 2 });
  ok("nogmaals ongedaan maken kan niet (niets meer te herstellen)", r.status === 409 && r.data.details?.code === "nothing_to_undo", r.data);
  // undo of a keep on an audit-hidden activity (s5 keeps the audit row it had)
  r = await decide("s5", "keep", 0);
  ok("'behouden' overrult een automatische verberging (s5 weer actief)", r.status === 200 && act("s5").active === 1 && dbq("SELECT hidden, source FROM activity_audits WHERE activity_id='s5'")[0].hidden === 0);
  r = await S("POST", "/undo", { activityId: "s5", expectedVersion: 1 });
  const a5 = dbq("SELECT hidden, source, rule FROM activity_audits WHERE activity_id='s5'")[0];
  ok("ongedaan maken zet ook de oorspronkelijke audit terug (weer verborgen door de regel)", r.status === 200 && act("s5").active === 0 && a5.hidden === 1 && a5.source === "rules" && a5.rule === "some_rule", { r: r.data, a5 });
  r = await S("GET", "/recent");
  ok("lijst met recente beslissingen voor 'Terug' na een refresh", r.status === 200 && Array.isArray(r.data.items), r.data);

  /* ---- 4. later ---- */
  console.log("\n4 · overslaan: later bekijken");
  r = await decide("s3", "later", 0);
  ok("'later' wordt opgeslagen", r.status === 200 && r.data.decision === "later");
  ok("activiteit zelf blijft ongemoeid (actief + geverifieerd)", act("s3").active === 1 && act("s3").status === "verified");
  r = await S("GET", "/queue?limit=40");
  ok("niet meer in 'nog niet beoordeeld'", !r.data.cards.some((c) => c.id === "s3"));
  r = await S("GET", "/queue?review=later");
  ok("wel onder 'Later bekijken'", r.data.cards.map((c) => c.id).join() === "s3");
  r = await decide("s3", "keep", 1);
  ok("later → behouden kan altijd", r.status === 200 && r.data.version === 2);

  /* ---- 5. restore ---- */
  console.log("\n5 · herstellen van een verwijderde activiteit");
  r = await decide("s4", "delete", 0);
  r = await S("GET", "/queue?review=delete");
  const s4v = r.data.cards.find((c) => c.id === "s4").version;
  r = await decide("s4", "later", s4v);
  ok("'later' op een verwijderde activiteit wordt geweigerd (eerst herstellen)", r.status === 409 && r.data.error === "deleted", r.data);
  r = await decide("s4", "keep", s4v);
  ok("herstellen = behouden: weer actief met oorspronkelijke status", r.status === 200 && act("s4").active === 1 && act("s4").status === "needs_review", r.data);
  ok("auditregel niet meer verborgen", dbq("SELECT hidden FROM activity_audits WHERE activity_id='s4'")[0].hidden === 0);
  ok("logboek registreert het als herstel", dbq("SELECT kind FROM owner_decision_log WHERE activity_id='s4' ORDER BY seq").map((x) => x.kind).join() === "decide,restore");
  r = await call(member, "GET", "/api/activities/s4");
  ok("weer zichtbaar in de gewone VIBIN-ervaring", r.status === 200);
  r = await S("POST", "/undo", { activityId: "s4", expectedVersion: 2 });
  ok("ook een herstel kan ongedaan worden (weer verwijderd)", r.status === 200 && act("s4").active === 0 && dec("s4").decision === "delete" && dec("s4").prev_status === "needs_review", { r: r.data, d: dec("s4") });
  r = await decide("s4", "keep", 3);
  ok("…en daarna weer herstellen", r.status === 200 && act("s4").active === 1);

  /* ---- 7. edit ---- */
  console.log("\n7 · bewerken");
  r = await CC("GET", "/activities/s3");
  ok("bestaande bewerk-API levert de volledige rij", r.status === 200 && r.data.activity.id === "s3");
  r = await CC("PUT", "/activities/s3", { address: "Nieuwe Straat 5" });
  ok("adres van een geverifieerde activiteit wijzigen → verificatie vervalt", r.status === 200 && r.data.demoted && act("s3").status === "needs_review", r.data);
  r = await S("GET", "/activity/s3");
  ok("kaart toont het nieuwe adres", r.data.card.address === "Nieuwe Straat 5" && r.data.card.decision === "keep");
  r = await CC("PUT", "/activities/s2", { title: "Karting Beta (hernoemd)" });
  ok("titel aanpassen werkt", r.status === 200 && dbq("SELECT title FROM activities WHERE id='s2'")[0].title === "Karting Beta (hernoemd)");

  /* ---- 6. add ---- */
  console.log("\n6 · activiteit toevoegen");
  const fresh = (over = {}) => ({ activity: { title: "Nieuwe Klimhal", description: "Klimmen met vrienden.", categoryId: "sport", subcategory: "Climbing", provider: "Nieuwe Klimhal vzw", providerWebsite: null, locationLabel: "Klimstraat 3, Mechelen", address: "Klimstraat 3", city: "Mechelen", country: "BE", lat: null, lng: null, priceType: "per_person", priceCents: null, priceBand: "10_25", websiteUrl: "https://nieuweklimhal.be", bookingUrl: null, ticketUrl: null, imageUrl: null, status: "verified", active: true, ...over } });
  r = await S("POST", "/activities", { activity: { title: "x" } });
  ok("ongeldige invoer wordt geweigerd door dezelfde validatie als het gewone formulier (400)", r.status === 400, r.status);
  r = await S("POST", "/activities", fresh());
  ok("nieuwe activiteit aangemaakt als 'behouden', versie 1", r.status === 201 && r.data.decision === "keep" && r.data.version === 1, r.data);
  const newId = r.data.id;
  ok("zelfde verificatielogica: 'verified' zonder bewijs/adres-check wordt niet blind overgenomen", ["needs_review", "verified"].includes(act(newId).status));
  ok("auditregel + logboek ('create') aangemaakt", dbq(`SELECT COUNT(*) AS n FROM activity_audits WHERE activity_id='${newId}'`)[0].n === 1 && dbq(`SELECT kind FROM owner_decision_log WHERE activity_id='${newId}'`)[0].kind === "create");
  r = await S("POST", "/activities", fresh());
  ok("duplicaat (zelfde naam + plaats) → 409 met de bestaande kandidaat", r.status === 409 && r.data.details?.code === "duplicate" && r.data.details.duplicates.some((d) => d.id === newId), r.data);
  r = await S("POST", "/activities", fresh({ title: "Andere Naam Hal", websiteUrl: "https://www.nieuweklimhal.be/" }));
  ok("duplicaat via dezelfde website → 409", r.status === 409 && r.data.details?.code === "duplicate", r.data);
  r = await S("POST", "/activities", { ...fresh(), allowDuplicate: true });
  ok("met expliciete toestemming toch toevoegen", r.status === 201);
  r = await S("POST", "/activities", fresh({ title: "Chocoladewinkel Centrum", categoryId: "food_drinks", subcategory: "Chocolate shop", provider: "Chocoladewinkel Centrum", websiteUrl: "https://choco-centrum.be", city: "Gent" }));
  ok("kwaliteitsregel: gewone winkel wordt geweigerd (400)", r.status === 400 && r.data.details?.code === "quality_rule", r.data);
  r = await S("POST", "/activities", { ...fresh({ title: "Chocoladewinkel Centrum", categoryId: "food_drinks", subcategory: "Chocolate shop", provider: "Chocoladewinkel Centrum", websiteUrl: "https://choco-centrum.be", city: "Gent" }), force: true });
  ok("…maar als eigenaar kun je het forceren", r.status === 201, r.data);
  // previously deleted
  await decide("s8", "delete", 0);
  r = await S("POST", "/activities", fresh({ title: "Minigolf Theta", city: "Aalst", websiteUrl: "https://www.s8.be" }));
  ok("eerder verwijderde activiteit opnieuw toevoegen → 409 'previously_deleted'", r.status === 409 && r.data.details?.code === "previously_deleted" && r.data.details.deleted.some((d) => d.id === "s8"), r.data);
  r = await S("POST", "/activities", { ...fresh({ title: "Minigolf Theta", city: "Aalst", websiteUrl: "https://www.s8.be" }), allowExcluded: true, allowDuplicate: true });
  ok("alleen met expliciete toestemming van de eigenaar", r.status === 201);
  r = await CC("POST", "/activities", { ...fresh({ title: "Minigolf Theta", city: "Aalst", websiteUrl: "https://www.s8.be" }).activity });
  ok("ook het gewone admin-formulier kan een verwijderde activiteit niet stilletjes terugzetten", r.status === 409 && r.data.details?.code === "previously_deleted", r.data);

  /* ---- classic admin paths must not resurrect ---- */
  console.log("\nandere paden die een activiteit zouden kunnen terugzetten");
  r = await CC("PUT", "/activities/s8", { active: true });
  ok("admin-bewerkformulier: 'actief' zetten op een verwijderde activiteit → 409", r.status === 409 && act("s8").active === 0, r.data);
  r = await CC("POST", "/activities/s8/verify", {});
  ok("snelle 'verifiëren' op een verwijderde activiteit → 409", r.status === 409 && act("s8").status === "inactive", r.data);
  r = await CC("POST", "/quality/activity/s8", { decision: "approve" });
  ok("kwaliteitsmodule: 'goedkeuren' van een verwijderde activiteit → 409", r.status === 409 && act("s8").active === 0, r.data);
  r = await CC("POST", "/quality/restore-rule", { rule: "owner_swipe" });
  ok("'regel ongedaan maken' laat eigenaar-verwijderingen met rust", act("s8").active === 0);
  const csv = "title,city,category,location_label,price_band,description,website_url\nMinigolf Theta,Aalst,sport,Aalst,10_25,Leuk,https://www.s8.be\nPadel Nieuw,Gent,sport,Gent,10_25,Padel,https://padelnieuw.be\n";
  r = await CC("POST", "/activities/import/preview", { csv });
  const sk = (r.data.errors ?? []).some((e) => /eigenaar verwijderd/i.test(e.message));
  ok("CSV-import: een verwijderde activiteit wordt herkend en niet opnieuw aangeboden", r.status === 200 && sk, r.data);

  /* ---- 9 + 10. the AI/audit pipeline ---- */
  console.log("\n9 + 10 · het audit-/onderzoeksproces (echt script, SQL tegen de echte database)");
  const dbfile = (function find(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        const f = find(p);
        if (f) return f;
      } else if (e.name.endsWith(".sqlite") && p.includes("D1DatabaseObject") && !e.name.includes("metadata")) return p;
    }
    return null;
  })(STATE);
  // fresh candidates the "audit" will work on
  await sqlFileInline(`INSERT INTO activities (id, provider_id, title, category_id, location_label, city, price_band, website_url, status, active, updated_at) VALUES
      ('p1','p-test','Pipeline Normaal Uit','sport','Gent','Gent','10_25','https://p1.be','needs_review',1,100),
      ('p2','p-test','Pipeline Normaal Ok','sport','Gent','Gent','10_25','https://p2.be','needs_review',1,100),
      ('p3','p-test','Pipeline Wordt Verwijderd','sport','Gent','Gent','10_25','https://p3.be','needs_review',1,100),
      ('p4','p-test','Pipeline Behouden','sport','Gent','Gent','10_25','https://p4.be','needs_review',1,100);`);
  await decide("p4", "keep", 0);
  // The audit starts NOW: it snapshots the catalogue (p3 is still visible) …
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "vibin-audit-"));
  const snap = path.join(work, "snapshot.db");
  execFileSync("python3", ["-I", "-c", `import sqlite3,sys;s=sqlite3.connect(sys.argv[1]);d=sqlite3.connect(sys.argv[2]);s.backup(d)`, dbfile, snap]);
  fs.mkdirSync(path.join(work, "an"));
  for (const f of ["profile", "queue", "clusters"]) fs.writeFileSync(path.join(work, "an", `${f}.json`), f === "queue" ? "[]" : "{}");
  fs.writeFileSync(path.join(work, "ev.jsonl"), "");
  fs.mkdirSync(path.join(work, "val"));
  const proof = [{ field: "existence", found: "x", verified: "y", status: "verified", sourceUrl: "https://x.be", quote: "q", note: "", machineChecked: true }];
  const res = (id, verdict, extra = {}) => ({ id, verdict, existence: verdict === "closed" ? "closed" : "confirmed", suitability: "fit", note: `Onderzoek zegt ${verdict}.`, sources: [], evidence: proof, corrections: [], contacts: [], ...extra });
  fs.writeFileSync(path.join(work, "val", "batch-001.json"), JSON.stringify({ batch: "batch-001", results: [
    res("p1", "exclude"),                         // control: must be hidden
    res("p2", "approved"),                        // control: must become verified
    res("p3", "approved", { corrections: [{ field: "website_url", from: "https://p3.be", to: "https://p3-nieuw.be", confidence: "high", verified: true }] }),
    res("p4", "exclude"),                         // the owner KEPT it: research may inform, never hide it
  ] }));
  execFileSync("python3", ["-I", path.join(ROOT, "scripts/audit/make-research-sql.py"), snap, path.join(work, "an"), path.join(work, "ev.jsonl"), path.join(work, "val"), path.join(work, "sql"), "--only-agent"], { stdio: "pipe" });
  const sqlFiles = fs.readdirSync(path.join(work, "sql")).filter((f) => f.endsWith(".sql"));
  const generated = sqlFiles.map((f) => fs.readFileSync(path.join(work, "sql", f), "utf8")).join("\n");
  ok("het echte script heeft SQL gegenereerd, met de eigenaar-bewaking erin", sqlFiles.length > 0 && generated.includes("owner_activity_decisions"), sqlFiles);
  // … and while it is "researching", the owner swipes p3 away:
  r = await decide("p3", "delete", 0);
  ok("(10) eigenaar verwijdert p3 terwijl de audit nog bezig is", r.status === 200 && act("p3").active === 0);
  // the audit now applies its (older) result:
  for (const f of sqlFiles) sqlFile(path.join(work, "sql", f));
  ok("(10) het auditresultaat respecteert de verwijdering: p3 blijft inactief", act("p3").active === 0 && act("p3").status === "inactive", act("p3"));
  ok("(10) …wordt niet 'verified' gemaakt en de website niet aangepast", dbq("SELECT website_url FROM activities WHERE id='p3'")[0].website_url === "https://p3.be");
  ok("(10) …en het eigenaarsbesluit/auditregel blijft staan", dec("p3").decision === "delete" && dbq("SELECT source FROM activity_audits WHERE activity_id='p3'")[0].source === "owner");
  ok("(9) controle: een gewone 'exclude' wordt nog steeds toegepast (bewaking blokkeert niet te veel)", act("p1").active === 0, act("p1"));
  ok("(9) controle: een gewone 'approved' wordt nog steeds geverifieerd", act("p2").status === "verified", act("p2"));
  ok("(9) behouden activiteit wordt door onderzoek niet verborgen (eigenaar heeft voorrang)", act("p4").active === 1, act("p4"));
  ok("(9) het onderzoeksresultaat zelf wordt wel bewaard als informatie", dbq("SELECT COUNT(*) AS n FROM activity_research WHERE activity_id IN ('p3','p4')")[0].n === 2);
  // the older rule-based audit script
  const rulesSql = fs.readFileSync(path.join(ROOT, "scripts/audit/make-sql.mts"), "utf8");
  ok("(9) ook het regel-gebaseerde auditscript overschrijft geen eigenaarsbesluiten meer", !/INSERT OR REPLACE INTO activity_audits/.test(rulesSql) && rulesSql.includes("source != 'owner'") && rulesSql.includes("owner_activity_decisions"));
  const seedApply = fs.readFileSync(path.join(ROOT, "seed/apply-seed.mjs"), "utf8");
  ok("(9) een herimport van de seed zet verwijderde activiteiten daarna opnieuw uit", seedApply.includes("owner_activity_decisions") && seedApply.includes("decision = 'delete'"));

  /* ---- 11. survives refresh ---- */
  console.log("\n11 · beslissingen blijven na een refresh en na een herstart van de server");
  const before = (await S("GET", "/summary")).data;
  await stop();
  await new Promise((x) => setTimeout(x, 800));
  server = spawn(IS_WIN ? "npx.cmd" : "npx", ["wrangler", "dev", "--port", String(PORT), "--persist-to", STATE], { stdio: "ignore", shell: IS_WIN, detached: !IS_WIN });
  for (const t0 = Date.now(); ; ) {
    try {
      if ((await fetch(`${BASE}/api/health`)).ok) break;
    } catch {
      /* wait */
    }
    if (Date.now() - t0 > 120_000) throw new Error("restart failed");
    await new Promise((x) => setTimeout(x, 700));
  }
  const after = (await S("GET", "/summary")).data;
  ok("na herstart van de server: dezelfde tellingen uit de database", after.keep === before.keep && after.deleted === before.deleted && after.later === before.later && after.total === before.total, { before, after });
  r = await S("GET", "/queue?review=delete&visibility=all&limit=40");
  ok("na herstart: verwijderde activiteiten staan er nog (s8, p3)", ["s8", "p3"].every((id) => r.data.cards.some((c) => c.id === id)), r.data.cards.map((c) => c.id));
  r = await S("GET", "/recent");
  ok("na herstart: 'Terug' kent de laatste beslissingen nog", r.data.items.length > 0);

  /* ---- re-research flag ---- */
  r = await S("POST", "/reresearch", { activityId: "s1", expectedVersion: 1, on: true });
  ok("opnieuw laten onderzoeken (alleen voor behouden activiteiten)", r.status === 200 && dec("s1") && dbq("SELECT reresearch FROM owner_activity_decisions WHERE activity_id='s1'")[0].reresearch === 1, r.data);
  r = await S("POST", "/reresearch", { activityId: "s8", expectedVersion: 1, on: true });
  ok("…niet voor een verwijderde activiteit", r.status === 409, r.data);

  console.log(`\n${pass} geslaagd, ${fail} mislukt`);
  await stop();
  fs.rmSync(STATE, { recursive: true, force: true });
  process.exit(fail ? 1 : 0);
}

function sqlFileInline(sql) {
  const f = path.join(STATE, `inline-${Math.random().toString(36).slice(2)}.sql`);
  fs.writeFileSync(f, sql);
  sqlFile(f);
}

main().catch(async (e) => {
  console.error("TEST RUN CRASHED:", e);
  console.error("--- last server output ---\n" + serverLog.slice(-2500));
  await stop();
  process.exit(2);
});
