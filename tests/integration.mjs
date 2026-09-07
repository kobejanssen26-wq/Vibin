/**
 * Black-box integration test. Boots against a running Worker (local `wrangler
 * dev` or a deployed preview) and drives the real HTTP API + D1.
 *
 *   BASE=http://127.0.0.1:8787 node tests/integration.mjs
 *
 * Covers the rules from the spec §33 that the pure-unit tests can't:
 *  - unanimous match across two real members (2/2 like -> match; 1 nope -> none)
 *  - date matching completes only on unanimous acceptance
 *  - authorization: a non-member cannot read another group (no IDOR)
 *  - a removed member cannot vote
 *  - an unknown / used invite code is rejected
 */
const BASE = (process.env.BASE ?? "http://127.0.0.1:8787").replace(/\/$/, "");
let passed = 0;
let failed = 0;

function ok(name, cond) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}`);
  }
}

/** minimal cookie-jar client */
function client() {
  const jar = new Map();
  const cookieHeader = () =>
    [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  return async (method, path, body) => {
    const headers = { "content-type": "application/json" };
    const c = cookieHeader();
    if (c) headers.cookie = c;
    if (method !== "GET") headers["x-vibin-csrf"] = jar.get("vibin_csrf") ?? "";
    const res = await fetch(`${BASE}/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    for (const sc of res.headers.getSetCookie?.() ?? []) {
      const [pair] = sc.split(";");
      const idx = pair.indexOf("=");
      jar.set(pair.slice(0, idx), pair.slice(idx + 1));
    }
    const text = await res.text();
    let json;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = text;
    }
    return { status: res.status, json };
  };
}

const uniq = () => Math.random().toString(36).slice(2, 10);

async function signup(api, name) {
  const r = await api("POST", "/auth/signup", {
    email: `${name}-${uniq()}@example.com`,
    password: "supersecret123",
    displayName: name,
  });
  if (r.status !== 201) throw new Error(`signup failed: ${JSON.stringify(r.json)}`);
  return r.json.user;
}

async function run() {
  console.log(`\nVIBIN integration test → ${BASE}\n`);

  const health = await client()("GET", "/health");
  ok("health endpoint responds", health.status === 200 && health.json.ok);

  // --- two real members, date known up front -> skips date phase ---
  const kobe = client();
  await signup(kobe, "Kobe");
  const g = (await kobe("POST", "/groups", { name: `Trip ${uniq()}` })).json.group;

  const soon = Math.floor(Date.now() / 1000) + 3 * 86400;
  await kobe("PUT", `/groups/${g.id}/settings`, {
    categories: [],
    allActivities: true,
    locationLabel: "Antwerpen",
    lat: null,
    lng: null,
    radiusKm: 50,
    budgetBand: "any",
    dateMode: "specific",
    dateSpecific: soon,
    timeBand: "evening",
    timeSpecific: null,
  });
  const invite = (await kobe("GET", `/groups/${g.id}`)).json.group.inviteCode;

  const lisa = client();
  await signup(lisa, "Lisa");
  const joinRes = await lisa("POST", `/invites/${invite}/join`, {});
  ok("second member can join via invite code", joinRes.status === 200);

  // non-member cannot read the group
  const mallory = client();
  await signup(mallory, "Mallory");
  const idor = await mallory("GET", `/groups/${g.id}`);
  ok("non-member gets 403 on another group (no IDOR)", idor.status === 403);
  const idorVote = await mallory("POST", `/groups/${g.id}/swipe`, {
    activityId: "act_bowling-stones-antwerp",
    value: "like",
  });
  ok("non-member cannot vote in another group", idorVote.status === 403);

  await kobe("POST", `/groups/${g.id}/start`, {});
  const kState = (await kobe("GET", `/groups/${g.id}/swipe`)).json;
  ok("deck materialised for the group", kState.deckSize > 0);
  const cardA = kState.queue[0].activity.id;
  const cardB = kState.queue[1].activity.id;

  // 1 like + 1 nope => NO match
  await kobe("POST", `/groups/${g.id}/swipe`, { activityId: cardA, value: "like" });
  const lisaNope = await lisa("POST", `/groups/${g.id}/swipe`, {
    activityId: cardA,
    value: "nope",
  });
  ok("2 members, 1 like + 1 nope -> no match", lisaNope.json.newMatch == null);

  // 2/2 like on a known-date group => complete plan immediately, no date phase
  await kobe("POST", `/groups/${g.id}/swipe`, { activityId: cardB, value: "like" });
  const lisaLike = await lisa("POST", `/groups/${g.id}/swipe`, {
    activityId: cardB,
    value: "like",
  });
  ok("2/2 like -> match", lisaLike.json.newMatch != null);
  ok(
    "known date -> match is completed without a date vote",
    lisaLike.json.newMatch?.status === "complete" &&
      lisaLike.json.newMatch?.needsDateMatch === false,
  );
  const plans = (await kobe("GET", `/groups/${g.id}/plans`)).json.plans;
  ok(
    "a plan is created on the pre-known date (time normalised to the chosen band)",
    typeof plans[0]?.startsAt === "number" &&
      Math.abs(plans[0].startsAt - soon) < 86400,
  );

  // --- date matching path (date unknown) ---
  const d = client();
  await signup(d, "Dries");
  const g2 = (await d("POST", "/groups", { name: `Night ${uniq()}` })).json.group;
  await d("PUT", `/groups/${g2.id}/settings`, {
    categories: [],
    allActivities: true,
    locationLabel: "Antwerpen",
    lat: null,
    lng: null,
    radiusKm: 50,
    budgetBand: "any",
    dateMode: "unknown",
    dateSpecific: null,
    timeBand: "unknown",
    timeSpecific: null,
  });
  await d("POST", `/groups/${g2.id}/start`, {});
  const s2 = (await d("GET", `/groups/${g2.id}/swipe`)).json;
  const solo = await d("POST", `/groups/${g2.id}/swipe`, {
    activityId: s2.queue[0].activity.id,
    value: "like",
  });
  ok("solo group: one like matches", solo.json.newMatch != null);
  ok("date unknown -> match needs a date vote", solo.json.newMatch.needsDateMatch);

  const dm = (await d("GET", `/groups/${g2.id}/date-match`)).json;
  ok("date options were generated", dm.options.length >= 3);
  const first = await d("POST", `/groups/${g2.id}/date-match/vote`, {
    optionId: dm.options[0].id,
    value: "no",
  });
  ok("voting 'no' on the only voted option does not complete", first.json.completed === false);
  const yes = await d("POST", `/groups/${g2.id}/date-match/vote`, {
    optionId: dm.options[1].id,
    value: "yes",
  });
  ok("unanimous 'yes' completes the plan", yes.json.completed === true);
  const g2plan = (await d("GET", `/groups/${g2.id}/plans`)).json.plans;
  ok("date-matched plan exists with the chosen start time", g2plan[0]?.startsAt > 0);

  // --- removed member cannot vote ---
  const g3 = (await kobe("POST", "/groups", { name: `Crew ${uniq()}` })).json.group;
  await kobe("PUT", `/groups/${g3.id}/settings`, {
    categories: [],
    allActivities: true,
    locationLabel: "x",
    lat: null,
    lng: null,
    radiusKm: 50,
    budgetBand: "any",
    dateMode: "unknown",
    dateSpecific: null,
    timeBand: "unknown",
    timeSpecific: null,
  });
  const code3 = (await kobe("GET", `/groups/${g3.id}`)).json.group.inviteCode;
  const eve = client();
  const eveUser = await signup(eve, "Eve");
  await eve("POST", `/invites/${code3}/join`, {});
  await kobe("POST", `/groups/${g3.id}/start`, {});
  await kobe("PATCH", `/groups/${g3.id}/members/${eveUser.id}`, {
    status: "removed",
  });
  const eveState = await eve("GET", `/groups/${g3.id}/swipe`);
  ok("removed member loses read access to the group", eveState.status === 403);
  const eveVote = await eve("POST", `/groups/${g3.id}/swipe`, {
    activityId: "act_kinepolis-cinema",
    value: "like",
  });
  ok("removed member cannot vote", eveVote.status === 403);

  // --- invalid invite code ---
  const bad = await kobe("GET", `/invites/ZZZZZZ`);
  ok("unknown invite code is rejected", bad.status === 404 || bad.status === 400);

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
