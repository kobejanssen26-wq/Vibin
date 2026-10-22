/**
 * Owner Command Center — catalogue quality audit (`/api/admin/cc/quality/*`).
 *
 * Every verdict of the whole-catalogue audit lives in `activity_audits`. Hiding
 * is a soft state (active=0, status='inactive') and always reversible: the row
 * keeps its id, so favourites, matches and statistics survive.
 */
import { Hono } from "hono";
import { z } from "zod";
import type { Env, Vars } from "../env";
import { audit } from "../lib/audit";
import { badRequest, conflict, notFound } from "../lib/errors";
import { parseBody } from "../lib/validate";
import { QUALITY_RULE } from "../lib/activity-quality";

type Ctx = { Bindings: Env; Variables: Vars };
const app = new Hono<Ctx>();
const nowSec = () => Math.floor(Date.now() / 1000);
const OUTCOMES = ["approved", "fix_data", "manual", "exclude", "duplicate", "closed"] as const;

app.get("/quality/summary", async (c) => {
  const [byOutcome, byRule, issues, hidden] = await c.env.DB.batch([
    c.env.DB.prepare(`SELECT outcome AS k, COUNT(*) AS n FROM activity_audits GROUP BY outcome`),
    c.env.DB.prepare(
      `SELECT outcome, rule, COUNT(*) AS n, SUM(hidden) AS hidden FROM activity_audits GROUP BY outcome, rule ORDER BY n DESC`,
    ),
    c.env.DB.prepare(
      `SELECT SUM(issues LIKE '%photo_generic%') AS photo, SUM(issues LIKE '%description_bare%') AS description,
              SUM(issues LIKE '%website_missing%') AS websiteMissing, SUM(issues LIKE '%website_unreliable%') AS websiteUnreliable,
              SUM(issues LIKE '%address_missing%') AS addressMissing, SUM(issues LIKE '%price_unknown%') AS price,
              COUNT(*) AS audited
         FROM activity_audits`,
    ),
    c.env.DB.prepare(`SELECT COUNT(*) AS n FROM activity_audits WHERE hidden = 1`),
  ]);
  const o: Record<string, number> = {};
  for (const r of byOutcome!.results as { k: string; n: number }[]) o[r.k] = r.n;
  return c.json({
    rule: QUALITY_RULE,
    outcomes: o,
    rules: byRule!.results,
    issues: (issues!.results as Record<string, number>[])[0] ?? {},
    hidden: (hidden!.results as { n: number }[])[0]?.n ?? 0,
  });
});

app.get("/quality/list", async (c) => {
  const url = new URL(c.req.url);
  const outcome = url.searchParams.get("outcome") || "";
  const rule = (url.searchParams.get("rule") || "").slice(0, 60);
  const q = (url.searchParams.get("q") || "").trim().slice(0, 80);
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const pageSize = 25;
  const where: string[] = [];
  const binds: unknown[] = [];
  if ((OUTCOMES as readonly string[]).includes(outcome)) {
    where.push("u.outcome = ?");
    binds.push(outcome);
  }
  if (rule) {
    where.push("u.rule = ?");
    binds.push(rule);
  }
  if (q) {
    where.push("a.title LIKE ?");
    binds.push(`%${q}%`);
  }
  const w = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const [rows, total] = await c.env.DB.batch([
    c.env.DB.prepare(
      `SELECT a.id, a.title, a.subcategory, a.city, a.website_url AS websiteUrl, a.web_status AS webStatus,
              a.active, a.status, substr(coalesce(a.short_description, a.description, ''), 1, 140) AS blurb,
              u.outcome, u.rule, u.reason, u.confidence, u.issues, u.hidden, u.source, u.duplicate_of AS duplicateOf
         FROM activity_audits u JOIN activities a ON a.id = u.activity_id ${w}
        ORDER BY u.audited_at DESC, a.title LIMIT ? OFFSET ?`,
    ).bind(...binds, pageSize, (page - 1) * pageSize),
    c.env.DB.prepare(
      `SELECT COUNT(*) AS n FROM activity_audits u ${q ? "JOIN activities a ON a.id = u.activity_id" : ""} ${w}`,
    ).bind(...binds),
  ]);
  const n = (total!.results[0] as { n: number }).n;
  return c.json({
    rows: (rows!.results as Record<string, unknown>[]).map((r) => ({
      ...r,
      issues: JSON.parse(String(r.issues || "[]")) as string[],
      hidden: !!r.hidden,
    })),
    total: n,
    page,
    pageSize,
    pageCount: Math.ceil(n / pageSize) || 1,
  });
});

/** Owner decision on one activity. Always overrides the rules and is never overwritten by them. */
app.post("/quality/activity/:id", async (c) => {
  const id = c.req.param("id");
  const b = await parseBody(
    c,
    z.object({
      decision: z.enum(["approve", "exclude", "manual", "restore"]),
      reason: z.string().trim().max(300).default(""),
    }),
  );
  const cur = await c.env.DB.prepare(
    `SELECT a.active, a.status, u.hidden, u.previous_active AS pa, u.previous_status AS ps
       FROM activities a LEFT JOIN activity_audits u ON u.activity_id = a.id WHERE a.id = ?1`,
  )
    .bind(id)
    .first<{ active: number; status: string; hidden: number | null; pa: number | null; ps: string | null }>();
  if (!cur) throw notFound("Activiteit niet gevonden.");
  const now = nowSec();
  const owner = c.get("adminUserId");
  const outcome = b.decision === "exclude" ? "exclude" : b.decision === "manual" ? "manual" : "approved";
  const reason =
    b.reason || (b.decision === "exclude" ? "Door de eigenaar uitgesloten." : b.decision === "manual" ? "Door de eigenaar voor controle gemarkeerd." : "Door de eigenaar goedgekeurd.");

  const stmts: D1PreparedStatement[] = [];
  if (b.decision === "exclude") {
    // remember the visible state only the first time we hide it
    const prevActive = cur.hidden ? cur.pa : cur.active;
    const prevStatus = cur.hidden ? cur.ps : cur.status;
    stmts.push(
      c.env.DB.prepare(`UPDATE activities SET active = 0, status = 'inactive', updated_at = ?2 WHERE id = ?1`).bind(id, now),
      c.env.DB.prepare(
        `INSERT INTO activity_audits (activity_id, outcome, rule, reason, confidence, issues, hidden, previous_active, previous_status, source, decided_by, audited_at)
         VALUES (?1,'exclude','owner',?2,'high','[]',1,?3,?4,'owner',?5,?6)
         ON CONFLICT(activity_id) DO UPDATE SET outcome='exclude', rule='owner', reason=?2, confidence='high', hidden=1,
           previous_active=?3, previous_status=?4, source='owner', decided_by=?5, audited_at=?6`,
      ).bind(id, reason, prevActive ?? 1, prevStatus ?? "needs_review", owner, now),
    );
  } else {
    // approve / manual / restore: make it visible again, back to what it was before it was hidden
    const restoreActive = cur.hidden ? (cur.pa ?? 1) : cur.active;
    const restoreStatus = cur.hidden ? (cur.ps ?? "needs_review") : cur.status;
    stmts.push(
      c.env.DB.prepare(`UPDATE activities SET active = ?2, status = ?3, updated_at = ?4 WHERE id = ?1`).bind(id, restoreActive, restoreStatus, now),
      c.env.DB.prepare(
        `INSERT INTO activity_audits (activity_id, outcome, rule, reason, confidence, issues, hidden, source, decided_by, audited_at)
         VALUES (?1,?2,'owner',?3,'high','[]',0,'owner',?4,?5)
         ON CONFLICT(activity_id) DO UPDATE SET outcome=?2, rule='owner', reason=?3, confidence='high', hidden=0,
           source='owner', decided_by=?4, audited_at=?5`,
      ).bind(id, outcome, reason, owner, now),
    );
  }
  await c.env.DB.batch(stmts);
  await audit(c, { action: `quality.${b.decision}`, targetType: "activity", targetId: id, meta: { reason } });
  return c.json({ ok: true });
});

/** Undo one whole rule: every activity that rule hid becomes visible again (as "manual"). */
app.post("/quality/restore-rule", async (c) => {
  const b = await parseBody(c, z.object({ rule: z.string().trim().min(2).max(60) }));
  const now = nowSec();
  const res = await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE activities
          SET active = COALESCE((SELECT previous_active FROM activity_audits u WHERE u.activity_id = activities.id), 1),
              status = COALESCE((SELECT previous_status FROM activity_audits u WHERE u.activity_id = activities.id), 'needs_review'),
              updated_at = ?2
        WHERE id IN (SELECT activity_id FROM activity_audits WHERE rule = ?1 AND hidden = 1 AND source = 'rules')`,
    ).bind(b.rule, now),
    c.env.DB.prepare(
      `UPDATE activity_audits SET outcome = 'manual', hidden = 0, source = 'owner', decided_by = ?2,
              reason = 'Hersteld door de eigenaar (regel ' || rule || ' ongedaan gemaakt).', audited_at = ?3
        WHERE rule = ?1 AND hidden = 1 AND source = 'rules'`,
    ).bind(b.rule, c.get("adminUserId"), now),
  ]);
  const restored = res[0]?.meta.changes ?? 0;
  await audit(c, { action: "quality.restore_rule", targetType: "activity", meta: { rule: b.rule, restored } });
  return c.json({ restored });
});

/* -------------------------------------------------------------------------- */
/*  Research evidence: per activity, per field, with sources                   */
/* -------------------------------------------------------------------------- */

const jparse = <T,>(v: unknown, fallback: T): T => {
  try {
    return JSON.parse(String(v ?? "")) as T;
  } catch {
    return fallback;
  }
};
/** Distance in metres between two stored (×1e6) coordinates, or null when one is missing. */
function distM(a: { lat: number | null; lng: number | null }, b: { lat: number | null; lng: number | null }): number | null {
  if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) return null;
  const dLat = ((a.lat - b.lat) / 1e6) * 111_000;
  const dLng = ((a.lng - b.lng) / 1e6) * 111_000 * Math.cos((a.lat / 1e6) * (Math.PI / 180));
  return Math.hypot(dLat, dLng);
}
/** How several activities sharing one address relate to each other. Never merges anything. */
function relationOf(rows: { lat: number | null; lng: number | null; city: string | null }[]): "same_location" | "different_locations" | "unknown" {
  const ds: number[] = [];
  for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
    const d = distM(rows[i]!, rows[j]!);
    if (d != null) ds.push(d);
  }
  if (!ds.length) return "unknown";
  return Math.max(...ds) < 150 ? "same_location" : "different_locations";
}

app.get("/quality/research/summary", async (c) => {
  const [active, byVerdict, byMethod, byExist, contacts, links, shared, corr, unresearched] = await c.env.DB.batch([
    c.env.DB.prepare(`SELECT COUNT(*) AS n FROM activities WHERE active = 1`),
    c.env.DB.prepare(
      `SELECT r.verdict AS k, COUNT(*) AS n FROM activity_research r JOIN activities a ON a.id = r.activity_id WHERE a.active = 1 GROUP BY r.verdict`,
    ),
    c.env.DB.prepare(
      `SELECT r.method AS k, COUNT(*) AS n FROM activity_research r JOIN activities a ON a.id = r.activity_id WHERE a.active = 1 GROUP BY r.method`,
    ),
    c.env.DB.prepare(
      `SELECT r.existence AS k, COUNT(*) AS n FROM activity_research r JOIN activities a ON a.id = r.activity_id WHERE a.active = 1 GROUP BY r.existence`,
    ),
    c.env.DB.prepare(`SELECT evidence_status AS k, COUNT(*) AS n FROM outreach_contacts GROUP BY evidence_status`),
    c.env.DB.prepare(`SELECT status AS k, COUNT(*) AS n FROM activity_contact_links GROUP BY status`),
    c.env.DB.prepare(`SELECT COUNT(*) AS n FROM (SELECT contact_id FROM activity_contact_links GROUP BY contact_id HAVING COUNT(*) > 1)`),
    c.env.DB.prepare(
      `SELECT COUNT(*) AS n FROM activity_research r JOIN activities a ON a.id = r.activity_id
        WHERE a.active = 1 AND r.corrections != '[]' AND r.corrections_applied = 0`,
    ),
    c.env.DB.prepare(
      `SELECT COUNT(*) AS n FROM activities a WHERE a.active = 1 AND NOT EXISTS (SELECT 1 FROM activity_research r WHERE r.activity_id = a.id)`,
    ),
  ]);
  const toMap = (r: unknown) => Object.fromEntries((r as { results: { k: string; n: number }[] }).results.map((x) => [x.k, x.n]));
  const one = (r: unknown) => ((r as { results: { n: number }[] }).results[0]?.n ?? 0);
  return c.json({
    active: one(active),
    unresearched: one(unresearched),
    verdicts: toMap(byVerdict),
    methods: toMap(byMethod),
    existence: toMap(byExist),
    contactEvidence: toMap(contacts),
    linkStatus: toMap(links),
    sharedEmails: one(shared),
    pendingCorrections: one(corr),
  });
});

const RESEARCH_FILTERS = ["unresearched", "shared_email", "corrections", "no_email", "email_problem", "duplicate", "agent", "crawl"] as const;

app.get("/quality/research/list", async (c) => {
  const url = new URL(c.req.url);
  const verdict = url.searchParams.get("verdict") || "";
  const filter = url.searchParams.get("filter") || "";
  const q = (url.searchParams.get("q") || "").trim().slice(0, 80);
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const pageSize = 25;
  const where: string[] = ["a.active = 1"];
  const binds: unknown[] = [];
  if ((OUTCOMES as readonly string[]).includes(verdict)) {
    where.push("r.verdict = ?");
    binds.push(verdict);
  }
  if ((RESEARCH_FILTERS as readonly string[]).includes(filter)) {
    if (filter === "unresearched") where.push("r.activity_id IS NULL");
    if (filter === "corrections") where.push("r.corrections != '[]' AND r.corrections_applied = 0");
    if (filter === "duplicate") where.push("r.verdict = 'duplicate' OR r.duplicate_of IS NOT NULL");
    if (filter === "agent") where.push("r.method = 'agent'");
    if (filter === "crawl") where.push("r.method = 'crawl'");
    if (filter === "shared_email") {
      where.push(
        `EXISTS (SELECT 1 FROM activity_contact_links l JOIN activity_contact_links l2 ON l2.contact_id = l.contact_id AND l2.activity_id != l.activity_id WHERE l.activity_id = a.id)`,
      );
    }
    if (filter === "no_email") where.push(`NOT EXISTS (SELECT 1 FROM activity_contact_links l WHERE l.activity_id = a.id)`);
    if (filter === "email_problem") {
      where.push(`EXISTS (SELECT 1 FROM activity_contact_links l WHERE l.activity_id = a.id AND l.status IN ('conflict','invalid'))`);
    }
  }
  if (q) {
    where.push("a.title LIKE ?");
    binds.push(`%${q}%`);
  }
  const w = `WHERE ${where.map((x) => `(${x})`).join(" AND ")}`;
  const from = `FROM activities a LEFT JOIN activity_research r ON r.activity_id = a.id`;
  const [rows, total] = await c.env.DB.batch([
    c.env.DB.prepare(
      `SELECT a.id, a.title, a.city, a.subcategory, a.website_url AS websiteUrl, a.status,
              r.verdict, r.existence, r.suitability, r.method, r.note, r.duplicate_of AS duplicateOf,
              r.researched_at AS researchedAt, r.corrections_applied AS correctionsApplied,
              (r.corrections != '[]') AS hasCorrections,
              (SELECT COUNT(*) FROM activity_contact_links l WHERE l.activity_id = a.id) AS emails,
              EXISTS (SELECT 1 FROM activity_contact_links l JOIN activity_contact_links l2 ON l2.contact_id = l.contact_id AND l2.activity_id != l.activity_id
                       WHERE l.activity_id = a.id) AS sharedEmail
         ${from} ${w} ORDER BY COALESCE(r.researched_at, 0) DESC, a.title LIMIT ? OFFSET ?`,
    ).bind(...binds, pageSize, (page - 1) * pageSize),
    c.env.DB.prepare(`SELECT COUNT(*) AS n ${from} ${w}`).bind(...binds),
  ]);
  const n = (total!.results[0] as { n: number }).n;
  return c.json({
    rows: (rows!.results as Record<string, unknown>[]).map((r) => ({ ...r, hasCorrections: !!r.hasCorrections, sharedEmail: !!r.sharedEmail })),
    total: n,
    page,
    pageSize,
    pageCount: Math.ceil(n / pageSize) || 1,
  });
});

/** Everything known about one activity: current values, the research record, e-mail links and who else shares them. */
app.get("/quality/activity/:id/research", async (c) => {
  const id = c.req.param("id");
  const act = await c.env.DB.prepare(
    `SELECT id, title, provider, subcategory, category_id AS categoryId, address, city, lat, lng, website_url AS websiteUrl,
            status, active, last_verified_at AS lastVerifiedAt, substr(coalesce(short_description, description, ''), 1, 400) AS blurb
       FROM activities WHERE id = ?1`,
  )
    .bind(id)
    .first<Record<string, unknown> & { lat: number | null; lng: number | null; city: string | null }>();
  if (!act) throw notFound("Activiteit niet gevonden.");
  const [res, aud, links] = await c.env.DB.batch([
    c.env.DB.prepare(`SELECT * FROM activity_research WHERE activity_id = ?1`).bind(id),
    c.env.DB.prepare(`SELECT outcome, rule, reason, confidence, source, hidden FROM activity_audits WHERE activity_id = ?1`).bind(id),
    c.env.DB.prepare(
      `SELECT l.contact_id AS contactId, l.scope, l.status AS linkStatus, l.link_source AS linkSource, l.evidence_url AS linkEvidenceUrl, l.note AS linkNote,
              k.email, k.kind, k.verification, k.evidence_status AS evidenceStatus, k.evidence_url AS evidenceUrl, k.evidence_note AS evidenceNote, k.role
         FROM activity_contact_links l JOIN outreach_contacts k ON k.id = l.contact_id WHERE l.activity_id = ?1 ORDER BY k.email`,
    ).bind(id),
  ]);
  const contacts = links!.results as { contactId: string; email: string }[];
  const others = contacts.length
    ? await c.env.DB.prepare(
        `SELECT l.contact_id AS contactId, a.id, a.title, a.city, a.lat, a.lng, l.scope, l.status
           FROM activity_contact_links l JOIN activities a ON a.id = l.activity_id
          WHERE l.contact_id IN (${contacts.map((_, i) => `?${i + 1}`).join(",")}) AND l.activity_id != ?${contacts.length + 1} AND a.active = 1`,
      )
        .bind(...contacts.map((x) => x.contactId), id)
        .all<{ contactId: string; id: string; title: string; city: string | null; lat: number | null; lng: number | null; scope: string; status: string }>()
    : { results: [] as { contactId: string; id: string; title: string; city: string | null; lat: number | null; lng: number | null; scope: string; status: string }[] };
  const research = (res!.results[0] as Record<string, unknown> | undefined) ?? null;
  return c.json({
    activity: act,
    research: research
      ? {
          ...research,
          evidence: jparse(research.evidence, []),
          sources: jparse(research.sources, []),
          corrections: jparse(research.corrections, []),
        }
      : null,
    audit: (aud!.results[0] as Record<string, unknown> | undefined) ?? null,
    contacts: contacts.map((ct) => {
      const sharing = others.results.filter((o) => o.contactId === ct.contactId);
      return {
        ...ct,
        sharedWith: sharing.map((o) => ({
          id: o.id,
          title: o.title,
          city: o.city,
          scope: o.scope,
          status: o.status,
          distanceM: distM(act, o) == null ? null : Math.round(distM(act, o)!),
        })),
        relation: sharing.length ? relationOf([act, ...sharing]) : null,
      };
    }),
  });
});

/** Apply proposed corrections the owner has looked at. Only when the live value still equals what the research saw. */
const CORR_COLUMN: Record<string, string> = { address: "address", city: "city", website_url: "website_url", title: "title", provider: "provider", postcode: "" };
app.post("/quality/activity/:id/corrections", async (c) => {
  const id = c.req.param("id");
  const b = await parseBody(c, z.object({ fields: z.array(z.string().max(20)).min(1).max(8) }));
  const row = await c.env.DB.prepare(`SELECT corrections FROM activity_research WHERE activity_id = ?1`).bind(id).first<{ corrections: string }>();
  if (!row) throw notFound("Geen onderzoeksrecord voor deze activiteit.");
  const proposals = jparse<{ field: string; from: string; to: string; verified?: boolean }[]>(row.corrections, []);
  const cur = await c.env.DB.prepare(`SELECT title, provider, address, city, website_url FROM activities WHERE id = ?1`).bind(id).first<Record<string, string | null>>();
  if (!cur) throw notFound("Activiteit niet gevonden.");
  const applied: string[] = [];
  const skipped: string[] = [];
  const stmts: D1PreparedStatement[] = [];
  const now = nowSec();
  for (const f of b.fields) {
    const p = proposals.find((x) => x.field === f);
    const col = CORR_COLUMN[f];
    if (!p || !col) {
      skipped.push(`${f}: geen toepasbaar voorstel`);
      continue;
    }
    if ((cur[col] ?? "") !== (p.from ?? "")) {
      skipped.push(`${f}: waarde is intussen gewijzigd`);
      continue;
    }
    stmts.push(c.env.DB.prepare(`UPDATE activities SET ${col} = ?1, updated_at = ?2 WHERE id = ?3`).bind(p.to, now, id));
    applied.push(f);
  }
  if (!applied.length) throw conflict(skipped.join("; ") || "Niets toe te passen.");
  const remaining = proposals.filter((p) => !applied.includes(p.field));
  stmts.push(
    c.env.DB.prepare(`UPDATE activity_research SET corrections = ?1, corrections_applied = ?2 WHERE activity_id = ?3`).bind(
      JSON.stringify(remaining),
      remaining.length ? 0 : 1,
      id,
    ),
  );
  await c.env.DB.batch(stmts);
  await audit(c, { action: "quality.corrections_applied", targetType: "activity", targetId: id, meta: { applied, skipped } });
  const geo = applied.some((f) => f === "address" || f === "city")
    ? "Let op: de kaartpositie (lat/lng) is niet automatisch aangepast; controleer die als het adres echt verhuisd is."
    : null;
  return c.json({ ok: true, applied, skipped, note: geo });
});

/** Owner sets what an address is for (activity / location / organisation) or marks the link wrong. */
app.post("/quality/link/:activityId/:contactId", async (c) => {
  const b = await parseBody(
    c,
    z.object({
      scope: z.enum(["activity", "location", "organisation"]).optional(),
      status: z.enum(["verified", "likely", "unverified", "conflict", "invalid"]).optional(),
      note: z.string().trim().max(300).optional(),
    }),
  );
  if (!b.scope && !b.status) throw badRequest("Niets om aan te passen.");
  const r = await c.env.DB.prepare(
    `UPDATE activity_contact_links
        SET scope = COALESCE(?1, scope), status = COALESCE(?2, status), note = COALESCE(?3, note),
            link_source = 'manual', checked_at = ?4
      WHERE activity_id = ?5 AND contact_id = ?6`,
  )
    .bind(b.scope ?? null, b.status ?? null, b.note ?? null, nowSec(), c.req.param("activityId"), c.req.param("contactId"))
    .run();
  if (!r.meta.changes) throw notFound("Koppeling niet gevonden.");
  await audit(c, { action: "quality.link_edited", targetType: "activity", targetId: c.req.param("activityId"), meta: { contactId: c.req.param("contactId"), ...b } });
  return c.json({ ok: true });
});

/** E-mail addresses that cover more than one activity, with how those activities relate. Nothing is merged. */
app.get("/quality/shared-emails", async (c) => {
  const url = new URL(c.req.url);
  const relation = url.searchParams.get("relation") || "";
  const q = (url.searchParams.get("q") || "").trim().slice(0, 80);
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const pageSize = 15;
  const binds: unknown[] = [];
  const qSql = q ? `AND k.email LIKE ?` : "";
  if (q) binds.push(`%${q}%`);
  // Relation is computed from coordinates in JS, so page over a generous window and filter after.
  const window = relation ? 400 : pageSize;
  const offset = relation ? 0 : (page - 1) * pageSize;
  const groups = await c.env.DB.prepare(
    `SELECT l.contact_id AS contactId, k.email, k.role, k.evidence_status AS evidenceStatus, COUNT(*) AS n
       FROM activity_contact_links l JOIN outreach_contacts k ON k.id = l.contact_id
       JOIN activities a ON a.id = l.activity_id AND a.active = 1
      WHERE 1 = 1 ${qSql}
      GROUP BY l.contact_id HAVING COUNT(*) > 1 ORDER BY n DESC, k.email LIMIT ? OFFSET ?`,
  )
    .bind(...binds, window, offset)
    .all<{ contactId: string; email: string; role: string; evidenceStatus: string; n: number }>();
  const totalRow = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM (SELECT l.contact_id FROM activity_contact_links l JOIN outreach_contacts k ON k.id = l.contact_id
       JOIN activities a ON a.id = l.activity_id AND a.active = 1 WHERE 1 = 1 ${qSql} GROUP BY l.contact_id HAVING COUNT(*) > 1)`,
  )
    .bind(...binds)
    .first<{ n: number }>();
  const ids = groups.results.map((g) => g.contactId);
  const acts = ids.length
    ? await c.env.DB.prepare(
        `SELECT l.contact_id AS contactId, a.id, a.title, a.city, a.address, a.lat, a.lng, a.website_url AS websiteUrl,
                l.scope, l.status AS linkStatus, l.link_source AS linkSource, l.evidence_url AS evidenceUrl, l.note,
                r.verdict, r.existence
           FROM activity_contact_links l JOIN activities a ON a.id = l.activity_id AND a.active = 1
           LEFT JOIN activity_research r ON r.activity_id = a.id
          WHERE l.contact_id IN (${ids.map((_, i) => `?${i + 1}`).join(",")}) ORDER BY a.title`,
      )
        .bind(...ids)
        .all<{ contactId: string; lat: number | null; lng: number | null; city: string | null } & Record<string, unknown>>()
    : { results: [] as ({ contactId: string; lat: number | null; lng: number | null; city: string | null } & Record<string, unknown>)[] };
  let rows = groups.results.map((g) => {
    const list = acts.results.filter((a) => a.contactId === g.contactId);
    return { ...g, relation: relationOf(list), activities: list.map(({ lat, lng, contactId, ...rest }) => { void lat; void lng; void contactId; return rest; }) };
  });
  let total = totalRow?.n ?? 0;
  if (relation) {
    rows = rows.filter((r) => r.relation === relation);
    total = rows.length;
    rows = rows.slice((page - 1) * pageSize, page * pageSize);
  }
  return c.json({ rows, total, page, pageSize, pageCount: Math.ceil(total / pageSize) || 1 });
});

export default app;
