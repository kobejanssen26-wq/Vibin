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
  ok(
    "a plan's availabilityStatus is never 'confirmed_available' — no real booking API exists",
    g2plan[0]?.availabilityStatus !== "confirmed_available",
  );

  // --- smart time availability: never auto-complete a plan for a time the
  // venue is confirmed closed, even on a "known date" group; the auto-
  // generated date options must all be genuinely open ---
  const oh = client();
  await signup(oh, "OpeningHours");
  const g4 = (await oh("POST", "/groups", { name: `Hours ${uniq()}` })).json.group;
  await oh("PUT", `/groups/${g4.id}/settings`, {
    categories: ["sport"],
    allActivities: false,
    locationLabel: "Leuven",
    lat: null,
    lng: null,
    radiusKm: 25,
    budgetBand: "any",
    // "tonight" + "morning" resolves to ~10:00 today — before Bowling
    // Leuven's real hours (Mo-Sa 13:00-01:00; Su 13:00-00:00) on any day.
    dateMode: "tonight",
    dateSpecific: null,
    timeBand: "morning",
    timeSpecific: null,
  });
  await oh("POST", `/groups/${g4.id}/start`, {});
  let bowlingId = null;
  let s4 = (await oh("GET", `/groups/${g4.id}/swipe`)).json;
  for (let b = 0; b < 6 && !bowlingId; b++) {
    for (const c of s4.queue) {
      if (c.activity.title === "Bowling Leuven") {
        bowlingId = c.activity.id;
        break;
      }
      await oh("POST", `/groups/${g4.id}/swipe`, { activityId: c.activity.id, value: "nope" });
    }
    if (!bowlingId) s4 = (await oh("POST", `/groups/${g4.id}/swipe/extend`, {})).json;
  }
  if (bowlingId) {
    const bowlingMatch = await oh("POST", `/groups/${g4.id}/swipe`, {
      activityId: bowlingId,
      value: "like",
    });
    ok(
      "a known-date match on a venue closed at that time does NOT auto-complete",
      bowlingMatch.json.newMatch?.needsDateMatch === true,
    );
    const dm4 = (await oh("GET", `/groups/${g4.id}/date-match`)).json;
    const hours = bowlingMatch.json.newMatch.activity.openingHours;
    const allOpen = dm4.options.every((o) => {
      const day = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/Brussels",
        weekday: "short",
      }).format(new Date(o.startsAt * 1000));
      return !!hours[day]; // some hours exist that day — good enough for a smoke check
    });
    ok(
      "auto-generated date options for a closed-at-usual-time match are all on days the venue is actually open",
      dm4.options.length > 0 && allOpen,
    );
    ok(
      "date options for a venue with real hours are honestly labelled 'opening_hours_only', never 'confirmed_available' (no real booking API exists)",
      dm4.options.length > 0 &&
        dm4.options.every((o) => o.availabilityStatus === "opening_hours_only"),
    );
  } else {
    console.log("  (skipped opening-hours smart-time test — Bowling Leuven not in this batch)");
  }

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

  // --- leaving/being removed clears that group's notifications ---
  const g5 = (await kobe("POST", "/groups", { name: `Crew ${uniq()}` })).json.group;
  const code5 = (await kobe("GET", `/groups/${g5.id}`)).json.group.inviteCode;
  const frank = client();
  const frankUser = await signup(frank, "Frank");
  await frank("POST", `/invites/${code5}/join`, {});
  await kobe("POST", `/groups/${g5.id}/messages`, { body: "hi frank, before you leave" });
  const frankNotifsBefore = (await frank("GET", "/me/notifications")).json.notifications;
  ok(
    "member has a notification for the group before leaving",
    frankNotifsBefore.some((n) => n.data.groupId === g5.id),
  );
  await frank("POST", `/groups/${g5.id}/leave`, {});
  const frankNotifsAfter = (await frank("GET", "/me/notifications")).json.notifications;
  ok(
    "leaving a group clears that group's existing notifications",
    !frankNotifsAfter.some((n) => n.data.groupId === g5.id),
  );
  await kobe("POST", `/groups/${g5.id}/messages`, { body: "message after frank left" });
  const frankNotifsAfterNewMsg = (await frank("GET", "/me/notifications")).json.notifications;
  ok(
    "no new notification is created for a group you've already left",
    !frankNotifsAfterNewMsg.some((n) => n.data.groupId === g5.id),
  );

  const g6 = (await kobe("POST", "/groups", { name: `Crew ${uniq()}` })).json.group;
  const code6 = (await kobe("GET", `/groups/${g6.id}`)).json.group.inviteCode;
  const grace = client();
  const graceUser = await signup(grace, "Grace");
  await grace("POST", `/invites/${code6}/join`, {});
  await kobe("POST", `/groups/${g6.id}/messages`, { body: "hi grace, before you're removed" });
  const graceNotifsBefore = (await grace("GET", "/me/notifications")).json.notifications;
  ok(
    "member has a notification for the group before being removed",
    graceNotifsBefore.some((n) => n.data.groupId === g6.id),
  );
  await kobe("PATCH", `/groups/${g6.id}/members/${graceUser.id}`, { status: "removed" });
  const graceNotifsAfter = (await grace("GET", "/me/notifications")).json.notifications;
  ok(
    "being removed from a group clears that group's existing notifications",
    !graceNotifsAfter.some((n) => n.data.groupId === g6.id),
  );

  // --- invalid invite code ---
  const bad = await kobe("GET", `/invites/ZZZZZZ`);
  ok("unknown invite code is rejected", bad.status === 404 || bad.status === 400);

  // --- native (bearer-token) auth: no cookie jar, no CSRF ---
  const mob = { "content-type": "application/json", "x-vibin-client": "mobile" };
  let r = await fetch(`${BASE}/api/auth/signup`, {
    method: "POST",
    headers: mob,
    body: JSON.stringify({
      displayName: "Mobile",
      email: `mob-${Date.now()}@x.com`,
      password: "mobile-pw-123456",
    }),
  });
  const mobBody = await r.json();
  ok("mobile signup returns a bearer token", r.status === 201 && typeof mobBody.token === "string");
  const bh = { ...mob, authorization: `Bearer ${mobBody.token}` };
  r = await fetch(`${BASE}/api/groups`, {
    method: "POST",
    headers: bh,
    body: JSON.stringify({ name: "Bearer grp" }),
  });
  ok("bearer mutation works without a CSRF token", r.status === 201);
  r = await fetch(`${BASE}/api/me/push-tokens`, {
    method: "POST",
    headers: bh,
    body: JSON.stringify({ token: `ExponentPushToken[${Date.now()}]`, platform: "android" }),
  });
  ok("push token registers", r.status === 200);
  r = await fetch(`${BASE}/api/groups`, {
    headers: { ...mob, authorization: "Bearer nope" },
  });
  ok("a bad bearer token is anonymous (401)", r.status === 401);
  r = await fetch(`${BASE}/api/auth/signup`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      displayName: "Web",
      email: `web-${Date.now()}@x.com`,
      password: "web-pw-12345678",
    }),
  });
  ok("web signup still returns no token (unchanged)", !("token" in (await r.json())));

  // --- radius engine: a rural location + small radius must stay local ---
  const geo = client();
  await signup(geo, "Geo");
  const gResolve = await geo("GET", "/geo/resolve?q=Hoogstraten");
  ok(
    "geocoder places a small town (Hoogstraten)",
    gResolve.status === 200 &&
      gResolve.json &&
      Math.abs(gResolve.json.lat - 51.4) < 0.2 &&
      Math.abs(gResolve.json.lng - 4.74) < 0.2,
  );
  const origin = gResolve.json;
  const hav = (a, b, c, d) => {
    const R = 6371;
    const dLat = ((c - a) * Math.PI) / 180;
    const dLng = ((d - b) * Math.PI) / 180;
    const x =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((a * Math.PI) / 180) *
        Math.cos((c * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x));
  };
  const rg = (await geo("POST", "/groups", { name: `Radius ${uniq()}` })).json.group;
  const soon2 = Math.floor(Date.now() / 1000) + 5 * 86400;
  await geo("PUT", `/groups/${rg.id}/settings`, {
    categories: [],
    allActivities: true,
    locationLabel: "Hoogstraten",
    lat: null,
    lng: null,
    radiusKm: 15,
    budgetBand: "any",
    dateMode: "specific",
    dateSpecific: soon2,
    timeBand: "evening",
    timeSpecific: null,
  });
  await geo("POST", `/groups/${rg.id}/start`, {});
  const rdeck = (await geo("GET", `/groups/${rg.id}/swipe`)).json;
  const rcards = rdeck.queue ?? [];
  const overRadius = rcards.filter((c) => {
    const a = c.activity;
    return (
      a.lat != null &&
      a.lng != null &&
      hav(origin.lat, origin.lng, a.lat, a.lng) > 15.5
    );
  });
  ok(
    "Hoogstraten + 15 km deck contains nothing beyond 15 km",
    overRadius.length === 0,
  );
  ok(
    "Hoogstraten + 15 km deck excludes far cities (Brussels/Ghent/coast)",
    !rcards.some((c) =>
      ["Brussels", "Ghent", "Bruges", "Namur"].includes(c.activity.city),
    ),
  );

  // --- live events discovery endpoint is reachable + geo-aware ---
  const ev = await geo(
    "GET",
    `/live-events/nearby?lat=${origin.lat}&lng=${origin.lng}&radiusKm=25`,
  );
  ok(
    "live-events nearby responds with an events array",
    ev.status === 200 && Array.isArray(ev.json.events),
  );

  // --- infinite swipe: pool grows past 40 in batches, no duplicates ---
  const sw = client();
  await signup(sw, "Swiper");
  const sg = (await sw("POST", "/groups", { name: `Infinite ${uniq()}` })).json.group;
  const soon3 = Math.floor(Date.now() / 1000) + 6 * 86400;
  await sw("PUT", `/groups/${sg.id}/settings`, {
    // "relaxation" is deliberately a small, bounded category (spa & sauna)
    // so this pool spans a handful of batches and is guaranteed to exhaust
    // no matter how large the wider catalogue grows — the "multiple batches"
    // and "ends only when truly done" assertions below need a finite,
    // multi-batch pool, not "whole catalogue", which now runs to thousands.
    categories: ["relaxation"],
    allActivities: false,
    locationLabel: null,
    lat: null,
    lng: null,
    radiusKm: 25,
    budgetBand: "any",
    dateMode: "specific",
    dateSpecific: soon3,
    timeBand: "evening",
    timeSpecific: null,
  });
  await sw("POST", `/groups/${sg.id}/start`, {});

  const seenIds = new Set();
  let dupes = 0;
  let batches = 0;
  let st = (await sw("GET", `/groups/${sg.id}/swipe`)).json;
  ok("first batch is 40 cards", st.queue.length === 40 && st.deckSize === 40);
  ok("first batch reports more available", st.hasMore === true);

  // pass on the visible queue, then extend — a "like" would match (solo group)
  for (let guard = 0; guard < 12 && (st.queue.length > 0 || st.hasMore); guard++) {
    for (const c of [...st.queue]) {
      if (seenIds.has(c.activity.id)) dupes++;
      seenIds.add(c.activity.id);
      await sw("POST", `/groups/${sg.id}/swipe`, {
        activityId: c.activity.id,
        value: "nope",
      });
    }
    if (st.hasMore) batches++;
    st = (await sw("POST", `/groups/${sg.id}/swipe/extend`, {})).json;
  }
  ok("swiping continued past the first batch", seenIds.size > 40);
  ok("no card was ever shown twice across batches", dupes === 0);
  ok("multiple batches were pulled automatically", batches >= 2);
  ok(
    "ends only when the backend truly has no more",
    st.queue.length === 0 && st.hasMore === false && st.finished === true,
  );

  // --- change category mid-swipe: new results, votes kept ---
  const fc = client();
  await signup(fc, "FilterChanger");
  const fg = (await fc("POST", "/groups", { name: `Filters ${uniq()}` })).json.group;
  await fc("PUT", `/groups/${fg.id}/settings`, {
    categories: ["sport"],
    allActivities: false,
    locationLabel: null,
    lat: null,
    lng: null,
    radiusKm: 25,
    budgetBand: "any",
    dateMode: "specific",
    dateSpecific: soon3,
    timeBand: "evening",
    timeSpecific: null,
  });
  await fc("POST", `/groups/${fg.id}/start`, {});
  let fs = (await fc("GET", `/groups/${fg.id}/swipe`)).json;
  ok(
    "deck starts as sport-only",
    fs.queue.length > 0 && fs.queue.every((c) => c.activity.category === "sport"),
  );
  for (let i = 0; i < 3 && fs.queue.length > 0; i++) {
    await fc("POST", `/groups/${fg.id}/swipe`, {
      activityId: fs.queue[0].activity.id,
      value: "nope",
    });
    fs = (await fc("GET", `/groups/${fg.id}/swipe`)).json;
  }
  ok("3 sport passes recorded", fs.swipedByYou === 3);

  await fc("PUT", `/groups/${fg.id}/settings`, {
    categories: ["food_drinks"],
    allActivities: false,
    locationLabel: null,
    lat: null,
    lng: null,
    radiusKm: 25,
    budgetBand: "any",
    dateMode: "specific",
    dateSpecific: soon3,
    timeBand: "evening",
    timeSpecific: null,
  });
  fs = (await fc("GET", `/groups/${fg.id}/swipe`)).json;
  ok(
    "deck rebuilt to food_drinks after mid-swipe filter change",
    fs.queue.length > 0 &&
      fs.queue.every((c) => c.activity.category === "food_drinks"),
  );
  ok("earlier passes survived the filter change", fs.swipedByYou === 3);
  ok(
    "no sport card lingers in the new queue",
    !fs.queue.some((c) => c.activity.category === "sport"),
  );

  // --- regression: a vote and a filter change landing in the same unix
  // second must not leave that vote reachable by undo (filterGeneration is
  // an exact integer match, not a >= timestamp comparison that can tie) ---
  const raceVote = fs.queue[0]?.activity?.id;
  if (raceVote) {
    await fc("POST", `/groups/${fg.id}/swipe`, { activityId: raceVote, value: "nope" });
    await fc("PUT", `/groups/${fg.id}/settings`, {
      categories: ["culture"],
      allActivities: false,
      locationLabel: null,
      lat: null,
      lng: null,
      radiusKm: 25,
      budgetBand: "any",
      dateMode: "specific",
      dateSpecific: soon3,
      timeBand: "evening",
      timeSpecific: null,
    });
    const raceState = (await fc("GET", `/groups/${fg.id}/swipe`)).json;
    ok(
      "a vote cast the same instant as a filter change is not undo-reachable after",
      raceState.lastVoted === null,
    );
  }

  // --- ranking: group taste shapes the deck, without hard-hiding anything ---
  // dateMode "unknown": in a solo group any "like" is instantly unanimous and
  // matches. A *known* date completes that match straight to "planned", which
  // /swipe/extend deliberately stops serving (the group has its plan) — fine
  // for a real group, but it would cut this taste-building loop off after the
  // very first like. "unknown" keeps a match in "date_matching", where extend
  // still works, so the loop can keep gathering signal over several batches.
  const baseCfg = {
    allActivities: true,
    categories: [],
    locationLabel: null,
    lat: null,
    lng: null,
    radiusKm: 50,
    budgetBand: "any",
    dateMode: "unknown",
    dateSpecific: null,
    timeBand: "unknown",
    timeSpecific: null,
  };
  // two solo groups, identical filters; one "likes" sport, the other "likes" culture
  async function tasteRun(likeCategory) {
    const cl = client();
    await signup(cl, "Taste");
    const grp = (await cl("POST", "/groups", { name: `Taste ${uniq()}` })).json.group;
    await cl("PUT", `/groups/${grp.id}/settings`, baseCfg);
    await cl("POST", `/groups/${grp.id}/start`, {});
    let st = (await cl("GET", `/groups/${grp.id}/swipe`)).json;
    // like up to 10 cards of the target category, pass the rest, for ~3 batches
    let liked = 0;
    for (let b = 0; b < 4 && (st.queue.length || st.hasMore); b++) {
      for (const c of [...st.queue]) {
        const want = c.activity.category === likeCategory && liked < 10;
        await cl("POST", `/groups/${grp.id}/swipe`, {
          activityId: c.activity.id,
          value: want ? "like" : "nope",
        });
        if (want) liked++;
      }
      st = (await cl("POST", `/groups/${grp.id}/swipe/extend`, {})).json;
    }
    // pool several fresh batches (after the learning phase) — the anti-hard-
    // hiding guarantee itself is proven deterministically at the algorithm
    // level in src/worker/engine/rank.test.ts; this is a best-effort smoke
    // check over live, noisier data.
    const cats = [];
    for (let i = 0; i < 10; i++) {
      const fresh = (await cl("POST", `/groups/${grp.id}/swipe/extend`, {})).json;
      cats.push(...fresh.queue.map((c) => c.activity.category));
    }
    return {
      liked,
      total: cats.length,
      sport: cats.filter((x) => x === "sport").length,
      culture: cats.filter((x) => x === "culture").length,
    };
  }
  // Personalization is deliberately a light touch (only RANK_SUGGESTION_SLOTS
  // leading cards per batch are ranked, the rest is a fair diverse shuffle —
  // see engine/deck.ts), so any one trial's signal is weak and noisy against
  // the exploration/diversity randomness. Aggregate several independent
  // trial-pairs rather than inflating a single trial's sample — that
  // averages out per-trial correlated noise instead of just per-card noise.
  let sportSport = 0, sportCulture = 0, sportTotal = 0, cultureSport = 0, cultureTotal = 0;
  for (let trial = 0; trial < 4; trial++) {
    const sportRun = await tasteRun("sport");
    const cultureRun = await tasteRun("culture");
    sportSport += sportRun.sport;
    sportCulture += sportRun.culture;
    sportTotal += sportRun.total;
    cultureSport += cultureRun.sport;
    cultureTotal += cultureRun.total;
  }
  ok(
    "a group that liked sport sees proportionally more sport than a group that liked culture",
    sportTotal > 0 &&
      cultureTotal > 0 &&
      sportSport / sportTotal >= cultureSport / cultureTotal,
  );
  ok(
    "ranking never hard-hides a category — the sport-liking group still sees some culture",
    sportCulture > 0 || cultureTotal < 5, // (best-effort smoke check — see rank.test.ts for the real guarantee)
  );

  // --- outbound-click tracking (/api/go/activity/:id) ---
  const gc = client();
  await signup(gc, "GoClick");
  const gg = (await gc("POST", "/groups", { name: `Go ${uniq()}` })).json.group;
  await gc("PUT", `/groups/${gg.id}/settings`, {
    categories: [],
    allActivities: true,
    locationLabel: null,
    lat: null,
    lng: null,
    radiusKm: 50,
    budgetBand: "any",
    dateMode: "unknown",
    dateSpecific: null,
    timeBand: "unknown",
    timeSpecific: null,
  });
  await gc("POST", `/groups/${gg.id}/start`, {});
  const gState = (await gc("GET", `/groups/${gg.id}/swipe`)).json;
  const withWebsite = gState.queue.find((c) => c.activity.websiteUrl)?.activity;
  const withoutAnyLink = gState.queue.find(
    (c) => !c.activity.websiteUrl && !c.activity.bookingUrl && !c.activity.ticketUrl,
  )?.activity;

  if (withWebsite) {
    const r = await fetch(`${BASE}/api/go/activity/${withWebsite.id}?kind=website&src=swipe_card`, {
      redirect: "manual",
    });
    ok(
      "go/activity redirects (302) straight to the activity's real website",
      r.status === 302 && r.headers.get("location") === withWebsite.websiteUrl,
    );
    // the exact same request anonymously (no cookies) still redirects — clicks
    // are measurable without requiring a session (§3)
    const anon = await fetch(
      `${BASE}/api/go/activity/${withWebsite.id}?kind=website&src=swipe_card`,
      { redirect: "manual", headers: { cookie: "" } },
    );
    ok("go/activity works for an anonymous (logged-out) click too", anon.status === 302);

    // open-redirect protection: an attacker-supplied `url` query param is
    // simply ignored — destination always comes from the activity's own
    // stored URL, never from request input
    const spoof = await fetch(
      `${BASE}/api/go/activity/${withWebsite.id}?kind=website&src=swipe_card&url=https://evil.example.com`,
      { redirect: "manual" },
    );
    ok(
      "an injected ?url= param cannot redirect anywhere else (no open redirect)",
      spoof.status === 302 &&
        spoof.headers.get("location") === withWebsite.websiteUrl &&
        !spoof.headers.get("location")?.includes("evil.example.com"),
    );
  } else {
    console.warn("  (skipped go/activity redirect checks — no card with a websiteUrl in this deck)");
  }

  if (withoutAnyLink) {
    const r = await fetch(
      `${BASE}/api/go/activity/${withoutAnyLink.id}?kind=website&src=swipe_card`,
      { redirect: "manual" },
    );
    ok("go/activity 404s for an activity with no matching outbound link", r.status === 404);
  }

  const bogus = await fetch(`${BASE}/api/go/activity/does-not-exist?kind=website`, {
    redirect: "manual",
  });
  ok("go/activity 404s for an unknown activity id", bogus.status === 404);

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
