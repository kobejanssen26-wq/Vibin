/**
 * Owner Command Center — Owner Swipe Manager (`/api/admin/cc/swipe/*`).
 *
 * The owner reviews every activity as a card: keep / delete / later. The verdict is stored in
 * `owner_activity_decisions` (one row per activity, optimistic `version`) and every change is
 * appended to `owner_decision_log`, so "undo" restores the exact earlier state.
 *
 * Guarantees
 *  - Owner-only: mounted behind withAdminSession + requireOwner() (session, MFA, role=owner, CSRF).
 *  - Atomic: the decision, the activity's visibility, the audit row and the log entry are ONE D1
 *    batch. Every dependent statement is conditional on the decision row carrying the new version,
 *    so a lost race changes nothing at all.
 *  - Soft: "delete" sets active=0/status='inactive'; the row, its id and its relations (votes,
 *    matches, plans, statistics) are untouched, and it can always be restored.
 *  - The owner's verdict outranks automatic processes: imports, the audit scripts and the AI
 *    research check `owner_activity_decisions` / audit source='owner' before touching anything.
 */
import { Hono } from "hono";
import { z } from "zod";
import type { Env, Vars } from "../env";
import { audit } from "../lib/audit";
import { AppError, badRequest, conflict, notFound } from "../lib/errors";
import { parseBody, parseQuery } from "../lib/validate";
import { activityInput } from "../lib/activity-input";
import { assessInput, findLookalikes, insertAdminActivity } from "../lib/activity-create";
import { QUALITY_RULE } from "../lib/activity-quality";
import { ACTIVITY_CATEGORIES } from "@shared/constants";
import {
  REVIEW_FILTERS,
  RESEARCH_FILTERS,
  VISIBILITY_FILTERS,
  buildQueueWhere,
  likeEscape,
  planDecision,
  reliableUrlKey,
  titleKey,
  urlKey,
  type CurrentState,
  type Decision,
  type QueueFilters,
} from "../lib/owner-swipe";

type Ctx = { Bindings: Env; Variables: Vars };
const app = new Hono<Ctx>();
const nowSec = () => Math.floor(Date.now() / 1000);

/* -------------------------------------------------------------------------- */
/*  Reading                                                                   */
/* -------------------------------------------------------------------------- */

const CARD_SELECT = `
  SELECT a.id, a.title, a.description, a.short_description AS shortDescription, a.full_description AS fullDescription,
         a.category_id AS categoryId, a.subcategory, a.provider, a.provider_website AS providerWebsite,
         a.location_label AS locationLabel, a.address, a.city, a.country, a.lat, a.lng,
         a.website_url AS websiteUrl, a.booking_url AS bookingUrl, a.image_url AS imageUrl,
         a.image_is_generic AS imageIsGeneric, a.status, a.active, a.web_status AS webStatus, a.source,
         a.price_cents AS priceCents, a.price_type AS priceType, a.price_band AS priceBand,
         a.opening_hours AS openingHours, a.needs_review_fields AS needsReviewFields, a.updated_at AS updatedAt,
         d.decision, d.version, d.reresearch, d.decided_at AS decidedAt, d.note AS decisionNote,
         u.outcome AS auditOutcome, u.rule AS auditRule, u.reason AS auditReason, u.hidden AS auditHidden, u.source AS auditSource,
         r.verdict AS researchVerdict, r.existence AS researchExistence, r.suitability AS researchSuitability,
         r.method AS researchMethod, r.note AS researchNote, r.researched_at AS researchedAt,
         r.corrections AS researchCorrections, r.corrections_applied AS correctionsApplied
    FROM activities a
    LEFT JOIN owner_activity_decisions d ON d.activity_id = a.id
    LEFT JOIN activity_audits u ON u.activity_id = a.id
    LEFT JOIN activity_research r ON r.activity_id = a.id`;

const CATEGORY_LABEL = new Map<string, string>(ACTIVITY_CATEGORIES.map((c) => [c.id, c.label]));
const jparse = <T,>(v: unknown, fallback: T): T => {
  try {
    return JSON.parse(String(v ?? "")) as T;
  } catch {
    return fallback;
  }
};
const ph = (n: number) => Array.from({ length: n }, (_, i) => `?${i + 1}`).join(",");

type Row = Record<string, unknown>;

/** Attach contacts + organisation to a page of card rows (two cheap IN queries, no N+1). */
async function hydrate(env: Env, rows: Row[], detail = false) {
  const ids = rows.map((r) => String(r.id));
  const contacts = new Map<string, Row[]>();
  const orgs = new Map<string, Row>();
  if (ids.length) {
    const [cRes, oRes] = await env.DB.batch([
      env.DB.prepare(
        `SELECT l.activity_id AS activityId, c.email, c.evidence_status AS evidence, c.kind, l.scope, l.status AS linkStatus
           FROM activity_contact_links l JOIN outreach_contacts c ON c.id = l.contact_id
          WHERE l.activity_id IN (${ph(ids.length)}) AND l.status != 'invalid'
          ORDER BY (l.status = 'verified') DESC, (c.evidence_status = 'verified') DESC, c.is_primary DESC, c.email`,
      ).bind(...ids),
      env.DB.prepare(
        `SELECT oa.activity_id AS activityId, o.id, o.name, o.domain, o.activity_count AS activityCount, o.excluded
           FROM outreach_org_activities oa JOIN outreach_orgs o ON o.id = oa.org_id
          WHERE oa.activity_id IN (${ph(ids.length)})`,
      ).bind(...ids),
    ]);
    for (const r of cRes!.results as Row[]) {
      const k = String(r.activityId);
      const list = contacts.get(k) ?? [];
      if (list.length < (detail ? 20 : 4)) list.push(r);
      contacts.set(k, list);
    }
    for (const r of oRes!.results as Row[]) if (!orgs.has(String(r.activityId))) orgs.set(String(r.activityId), r);
  }
  return rows.map((r) => {
    const id = String(r.id);
    const corrections = jparse<unknown[]>(r.researchCorrections, []);
    const deleted = r.decision === "delete";
    const out: Row = {
      id,
      title: r.title,
      description: r.fullDescription || r.shortDescription || r.description || "",
      categoryId: r.categoryId,
      category: CATEGORY_LABEL.get(String(r.categoryId)) ?? r.categoryId,
      subcategory: r.subcategory,
      provider: r.provider,
      address: r.address,
      city: r.city,
      country: r.country,
      locationLabel: r.locationLabel,
      lat: r.lat == null ? null : Number(r.lat) / 1e6,
      lng: r.lng == null ? null : Number(r.lng) / 1e6,
      websiteUrl: r.websiteUrl || r.providerWebsite || null,
      imageUrl: r.imageUrl,
      imageIsGeneric: !!r.imageIsGeneric,
      status: r.status,
      active: !!r.active,
      webStatus: r.webStatus,
      source: r.source,
      updatedAt: r.updatedAt,
      decision: (r.decision as Decision | null) ?? null,
      version: Number(r.version ?? 0),
      reresearch: !!r.reresearch,
      decidedAt: r.decidedAt ?? null,
      deleted,
      contacts: contacts.get(id) ?? [],
      organisation: orgs.get(id) ?? null,
      audit: r.auditOutcome
        ? { outcome: r.auditOutcome, rule: r.auditRule, reason: r.auditReason, hidden: !!r.auditHidden, source: r.auditSource }
        : null,
      research: r.researchVerdict
        ? {
            verdict: r.researchVerdict,
            existence: r.researchExistence,
            suitability: r.researchSuitability,
            method: r.researchMethod,
            note: r.researchNote,
            researchedAt: r.researchedAt,
            pendingCorrections: r.correctionsApplied ? 0 : corrections.length,
          }
        : null,
    };
    if (detail) {
      out.priceCents = r.priceCents;
      out.priceType = r.priceType;
      out.priceBand = r.priceBand;
      out.bookingUrl = r.bookingUrl;
      out.openingHours = jparse(r.openingHours, {});
      out.needsReviewFields = jparse(r.needsReviewFields, []);
      out.corrections = corrections;
      out.decisionNote = r.decisionNote ?? null;
    }
    return out;
  });
}

const queueQuery = z.object({
  review: z.enum(REVIEW_FILTERS).default("unreviewed"),
  research: z.enum(RESEARCH_FILTERS).default("any"),
  visibility: z.enum(VISIBILITY_FILTERS).default("active"),
  category: z.string().max(40).optional(),
  city: z.string().max(80).optional(),
  org: z.string().max(40).optional(),
  email: z.string().max(120).optional(),
  q: z.string().max(80).optional(),
  after: z.string().max(80).optional(),
  limit: z.coerce.number().int().min(1).max(40).default(20),
});

/** The cards to review, in a stable order (cursor = last id), plus the size of the filtered set. */
app.get("/swipe/queue", async (c) => {
  const q = parseQuery(c, queueQuery);
  const filters: QueueFilters = {
    review: q.review,
    research: q.research,
    visibility: q.visibility,
    category: q.category || undefined,
    city: q.city || undefined,
    org: q.org || undefined,
    email: q.email?.trim() || undefined,
    q: q.q?.trim() || undefined,
  };
  const { sql: where, binds } = buildQueueWhere(filters);
  const cursor = q.after ? `${where ? " AND" : "WHERE"} a.id > ?` : "";
  const cursorBinds = q.after ? [q.after] : [];
  const stmts = [
    c.env.DB.prepare(`${CARD_SELECT} ${where}${cursor} ORDER BY a.id LIMIT ?`).bind(...binds, ...cursorBinds, q.limit),
  ];
  // Only the first page pays for the count of the whole filtered set.
  if (!q.after) {
    stmts.push(
      c.env.DB.prepare(
        `SELECT COUNT(*) AS n FROM activities a
           LEFT JOIN owner_activity_decisions d ON d.activity_id = a.id
           LEFT JOIN activity_audits u ON u.activity_id = a.id
           LEFT JOIN activity_research r ON r.activity_id = a.id ${where}`,
      ).bind(...binds),
    );
  }
  const res = await c.env.DB.batch(stmts);
  const rows = res[0]!.results as Row[];
  const cards = await hydrate(c.env, rows);
  return c.json({
    cards,
    total: q.after ? null : ((res[1]!.results[0] as { n: number }).n ?? 0),
    next: rows.length === q.limit ? String(rows[rows.length - 1]!.id) : null,
  });
});

/** Progress over the WHOLE catalogue (real counts, never cached client-side). */
app.get("/swipe/summary", async (c) => {
  // `light=1` reads only the decision rows (cheap): used after every swipe. The full summary joins the
  // whole catalogue and is only fetched on load / refresh.
  if (new URL(c.req.url).searchParams.get("light") === "1") {
    const r = await c.env.DB.prepare(`SELECT decision AS k, COUNT(*) AS n FROM owner_activity_decisions GROUP BY decision`).all<{ k: string; n: number }>();
    const m = Object.fromEntries(r.results.map((x) => [x.k, x.n]));
    return c.json({ keep: m.keep ?? 0, deleted: m.delete ?? 0, later: m.later ?? 0 });
  }
  const row = await c.env.DB.prepare(
    `SELECT COUNT(*) AS total,
            SUM(d.decision = 'keep') AS keep, SUM(d.decision = 'delete') AS deleted, SUM(d.decision = 'later') AS later,
            SUM(d.decision IS NULL OR d.decision = 'none') AS unreviewed,
            SUM((d.decision IS NULL OR d.decision = 'none') AND a.active = 1) AS unreviewedActive,
            SUM(a.active = 1) AS activeTotal,
            SUM(r.activity_id IS NOT NULL) AS researched,
            SUM(r.activity_id IS NULL) AS unresearched,
            SUM(u.outcome = 'manual' OR r.verdict = 'manual') AS manual,
            SUM(d.reresearch = 1) AS reresearch
       FROM activities a
       LEFT JOIN owner_activity_decisions d ON d.activity_id = a.id
       LEFT JOIN activity_audits u ON u.activity_id = a.id
       LEFT JOIN activity_research r ON r.activity_id = a.id`,
  ).first<Record<string, number | null>>();
  const n = (k: string) => Number(row?.[k] ?? 0);
  return c.json({
    total: n("total"),
    unreviewed: n("unreviewed"),
    unreviewedActive: n("unreviewedActive"),
    keep: n("keep"),
    deleted: n("deleted"),
    later: n("later"),
    activeTotal: n("activeTotal"),
    researched: n("researched"),
    unresearched: n("unresearched"),
    manual: n("manual"),
    reresearch: n("reresearch"),
    categories: ACTIVITY_CATEGORIES.map((x) => ({ id: x.id, label: x.label })),
  });
});

/** Type-ahead for the city / organisation / e-mail filters. */
app.get("/swipe/suggest", async (c) => {
  const q = parseQuery(c, z.object({ kind: z.enum(["city", "org", "email"]), q: z.string().trim().max(60).default("") }));
  const like = `%${likeEscape(q.q)}%`;
  if (q.kind === "city") {
    const r = await c.env.DB.prepare(
      `SELECT city AS value, COUNT(*) AS n FROM activities WHERE city IS NOT NULL AND city != '' AND city LIKE ?1 ESCAPE '\\'
        GROUP BY city ORDER BY n DESC LIMIT 12`,
    ).bind(like).all();
    return c.json({ items: r.results });
  }
  if (q.kind === "org") {
    const r = await c.env.DB.prepare(
      `SELECT id AS value, name AS label, domain, activity_count AS n FROM outreach_orgs
        WHERE name LIKE ?1 ESCAPE '\\' OR domain LIKE ?1 ESCAPE '\\' ORDER BY activity_count DESC LIMIT 12`,
    ).bind(like).all();
    return c.json({ items: r.results });
  }
  const r = await c.env.DB.prepare(
    `SELECT email AS value, COUNT(DISTINCT l.activity_id) AS n FROM outreach_contacts c
       JOIN activity_contact_links l ON l.contact_id = c.id
      WHERE c.email LIKE ?1 ESCAPE '\\' GROUP BY c.email ORDER BY n DESC LIMIT 12`,
  ).bind(like).all();
  return c.json({ items: r.results });
});

/** One card with everything (details panel). */
app.get("/swipe/activity/:id", async (c) => {
  const row = await c.env.DB.prepare(`${CARD_SELECT} WHERE a.id = ?1`).bind(c.req.param("id")).first<Row>();
  if (!row) throw notFound("Activiteit niet gevonden.");
  const [card] = await hydrate(c.env, [row], true);
  const sources = await c.env.DB.prepare(`SELECT evidence, sources FROM activity_research WHERE activity_id = ?1`)
    .bind(c.req.param("id")).first<{ evidence: string; sources: string }>();
  return c.json({
    card: { ...card, evidence: jparse(sources?.evidence, []), sources: jparse(sources?.sources, []) },
  });
});

/** The owner's latest decisions (undo list); `undoable` = still the current state of that activity. */
app.get("/swipe/recent", async (c) => {
  const r = await c.env.DB.prepare(
    `SELECT l.seq, l.activity_id AS activityId, l.kind, l.from_decision AS fromDecision, l.to_decision AS toDecision,
            l.version, l.decided_at AS decidedAt, a.title, a.image_url AS imageUrl,
            (d.version = l.version) AS undoable, d.version AS currentVersion
       FROM owner_decision_log l
       LEFT JOIN activities a ON a.id = l.activity_id
       LEFT JOIN owner_activity_decisions d ON d.activity_id = l.activity_id
      WHERE l.kind IN ('decide', 'restore') AND l.undone = 0
      ORDER BY l.seq DESC LIMIT 30`,
  ).all();
  return c.json({ items: (r.results as Row[]).map((x) => ({ ...x, undoable: !!x.undoable })) });
});

/* -------------------------------------------------------------------------- */
/*  Writing: decide / undo / re-research                                      */
/* -------------------------------------------------------------------------- */

interface ActRow {
  id: string;
  title: string;
  city: string | null;
  website_url: string | null;
  provider_website: string | null;
  active: number;
  status: string;
  decision: Decision | null;
  version: number | null;
  d_prev_active: number | null;
  d_prev_status: string | null;
  d_prev_title: string | null;
  a_hidden: number | null;
  a_prev_active: number | null;
  a_prev_status: string | null;
}

const LOAD_STATE = `
  SELECT a.id, a.title, a.city, a.website_url, a.provider_website, a.active, a.status,
         d.decision, d.version, d.prev_active AS d_prev_active, d.prev_status AS d_prev_status,
         u.hidden AS a_hidden, u.previous_active AS a_prev_active, u.previous_status AS a_prev_status
    FROM activities a
    LEFT JOIN owner_activity_decisions d ON d.activity_id = a.id
    LEFT JOIN activity_audits u ON u.activity_id = a.id
   WHERE a.id = ?1`;

const toState = (r: ActRow): CurrentState => ({
  active: r.active,
  status: r.status,
  decision: r.decision,
  version: r.version ?? 0,
  prevActive: r.d_prev_active,
  prevStatus: r.d_prev_status,
  auditHidden: r.a_hidden,
  auditPrevActive: r.a_prev_active,
  auditPrevStatus: r.a_prev_status,
});

const staleVersion = (current: number, decision: Decision | null) =>
  conflict("Deze activiteit is ondertussen gewijzigd. De kaart is ververst; kijk opnieuw.", {
    code: "version_conflict",
    currentVersion: current,
    currentDecision: decision,
  });

const decideBody = z.object({
  activityId: z.string().min(1).max(80),
  decision: z.enum(["keep", "delete", "later"]),
  /** The version the owner's screen saw (0 = no decision yet). */
  expectedVersion: z.number().int().min(0),
  note: z.string().trim().max(300).optional(),
});

app.post("/swipe/decide", async (c) => {
  const b = await parseBody(c, decideBody);
  const owner = c.get("adminUserId");
  if (!owner) throw new AppError(401, "unauthorized", "Admin sign-in required.");
  const row = await c.env.DB.prepare(LOAD_STATE).bind(b.activityId).first<ActRow>();
  if (!row) throw notFound("Activiteit niet gevonden.");
  const cur = toState(row);
  if (b.expectedVersion !== cur.version) throw staleVersion(cur.version, cur.decision);

  const plan = planDecision(cur, b.decision);
  if (plan.noop) {
    return c.json({ ok: true, noop: true, activityId: row.id, decision: cur.decision, version: cur.version, active: !!row.active, status: row.status });
  }

  const now = nowSec();
  const newV = cur.version + 1;
  const kind = cur.decision === "delete" && b.decision === "keep" ? "restore" : "decide";
  const auditRow = plan.audit
    ? await c.env.DB.prepare(`SELECT * FROM activity_audits WHERE activity_id = ?1`).bind(row.id).first<Row>()
    : null;
  const prevAuditJson = plan.audit ? JSON.stringify(auditRow ?? null) : null; // "null" = there was none; SQL NULL = untouched

  const stmts: D1PreparedStatement[] = [
    // 1. the decision itself — the only statement that checks the version
    c.env.DB.prepare(
      `INSERT INTO owner_activity_decisions (activity_id, decision, version, prev_active, prev_status, title_key, url_key, reresearch, note, decided_by, decided_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 0, ?8, ?9, ?10)
       ON CONFLICT(activity_id) DO UPDATE SET decision = excluded.decision, version = owner_activity_decisions.version + 1,
         prev_active = excluded.prev_active, prev_status = excluded.prev_status, title_key = excluded.title_key,
         url_key = excluded.url_key, note = excluded.note, decided_by = excluded.decided_by, decided_at = excluded.decided_at
       WHERE owner_activity_decisions.version = ?11`,
    ).bind(
      row.id, b.decision, newV, plan.prevActive, plan.prevStatus,
      titleKey(row.title, row.city), reliableUrlKey(row.website_url ?? row.provider_website),
      b.note ?? null, owner, now, cur.version,
    ),
  ];
  if (plan.activity) {
    stmts.push(
      c.env.DB.prepare(
        `UPDATE activities SET active = ?2, status = ?3, updated_at = ?4
          WHERE id = ?1 AND EXISTS (SELECT 1 FROM owner_activity_decisions WHERE activity_id = ?1 AND version = ?5 AND decision = ?6)`,
      ).bind(row.id, plan.activity.active, plan.activity.status, now, newV, b.decision),
    );
  }
  if (plan.audit === "exclude") {
    stmts.push(
      c.env.DB.prepare(
        `INSERT INTO activity_audits (activity_id, outcome, rule, reason, confidence, issues, hidden, previous_active, previous_status, source, decided_by, audited_at)
         SELECT ?1, 'exclude', 'owner_swipe', 'Door de eigenaar verwijderd (Swipe Manager).', 'high', '[]', 1, ?2, ?3, 'owner', ?4, ?5
          WHERE EXISTS (SELECT 1 FROM owner_activity_decisions WHERE activity_id = ?1 AND version = ?6 AND decision = 'delete')
         ON CONFLICT(activity_id) DO UPDATE SET outcome = 'exclude', rule = 'owner_swipe', reason = excluded.reason, confidence = 'high',
           hidden = 1, previous_active = excluded.previous_active, previous_status = excluded.previous_status,
           source = 'owner', decided_by = excluded.decided_by, audited_at = excluded.audited_at`,
      ).bind(row.id, plan.prevActive ?? 1, plan.prevStatus ?? "needs_review", owner, now, newV),
    );
  } else if (plan.audit === "restore") {
    stmts.push(
      c.env.DB.prepare(
        `UPDATE activity_audits SET outcome = 'manual', rule = 'owner_swipe', reason = 'Behouden door de eigenaar (Swipe Manager).',
                confidence = 'high', hidden = 0, source = 'owner', decided_by = ?2, audited_at = ?3
          WHERE activity_id = ?1 AND EXISTS (SELECT 1 FROM owner_activity_decisions WHERE activity_id = ?1 AND version = ?4 AND decision = 'keep')`,
      ).bind(row.id, owner, now, newV),
    );
  }
  stmts.push(
    c.env.DB.prepare(
      `INSERT INTO owner_decision_log (activity_id, kind, from_decision, to_decision, version, prev_active, prev_status, prev_dec_active, prev_dec_status, prev_audit, note, decided_by, decided_at)
       SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13
        WHERE EXISTS (SELECT 1 FROM owner_activity_decisions WHERE activity_id = ?1 AND version = ?5 AND decision = ?4)`,
    ).bind(
      row.id, kind, cur.decision, b.decision, newV,
      plan.activity ? row.active : null, plan.activity ? row.status : null,
      cur.prevActive, cur.prevStatus, prevAuditJson, b.note ?? null, owner, now,
    ),
  );

  const res = await c.env.DB.batch(stmts);
  if ((res[0]?.meta.changes ?? 0) !== 1) {
    // Someone (another tab, a process) changed it between our read and our write: nothing was written.
    const fresh = await c.env.DB.prepare(LOAD_STATE).bind(row.id).first<ActRow>();
    throw staleVersion(fresh?.version ?? 0, fresh?.decision ?? null);
  }
  await audit(c, { action: `swipe.${b.decision}`, targetType: "activity", targetId: row.id, meta: { kind, version: newV } });
  return c.json({
    ok: true,
    activityId: row.id,
    decision: b.decision,
    version: newV,
    active: plan.activity ? !!plan.activity.active : !!row.active,
    status: plan.activity ? plan.activity.status : row.status,
  });
});

/** Undo the most recent decision of one activity — exactly, including visibility and the audit row. */
app.post("/swipe/undo", async (c) => {
  const b = await parseBody(c, z.object({ activityId: z.string().min(1).max(80), expectedVersion: z.number().int().min(1) }));
  const owner = c.get("adminUserId");
  if (!owner) throw new AppError(401, "unauthorized", "Admin sign-in required.");
  const row = await c.env.DB.prepare(LOAD_STATE).bind(b.activityId).first<ActRow>();
  if (!row) throw notFound("Activiteit niet gevonden.");
  const cur = toState(row);
  if (b.expectedVersion !== cur.version) throw staleVersion(cur.version, cur.decision);

  const log = await c.env.DB.prepare(
    `SELECT * FROM owner_decision_log WHERE activity_id = ?1 AND kind IN ('decide', 'restore') AND undone = 0 ORDER BY seq DESC LIMIT 1`,
  ).bind(row.id).first<Row>();
  if (!log || Number(log.version) !== cur.version) {
    throw conflict("Er is niets om ongedaan te maken: de activiteit is daarna nog gewijzigd.", { code: "nothing_to_undo", currentVersion: cur.version });
  }

  const now = nowSec();
  const newV = cur.version + 1;
  const back: Decision = (log.from_decision as Decision | null) ?? "none";
  const stmts: D1PreparedStatement[] = [
    c.env.DB.prepare(
      `UPDATE owner_activity_decisions SET decision = ?2, version = version + 1, prev_active = ?3, prev_status = ?4, decided_by = ?5, decided_at = ?6
        WHERE activity_id = ?1 AND version = ?7`,
    ).bind(row.id, back, log.prev_dec_active ?? null, log.prev_dec_status ?? null, owner, now, cur.version),
  ];
  const held = `EXISTS (SELECT 1 FROM owner_activity_decisions WHERE activity_id = ?1 AND version = ?2 AND decision = ?3)`;
  if (log.prev_active != null) {
    stmts.push(
      c.env.DB.prepare(`UPDATE activities SET active = ?4, status = ?5, updated_at = ?6 WHERE id = ?1 AND ${held}`).bind(
        row.id, newV, back, log.prev_active, log.prev_status ?? "needs_review", now,
      ),
    );
  }
  if (typeof log.prev_audit === "string") {
    const prev = jparse<Row | null>(log.prev_audit, null);
    if (prev == null) {
      stmts.push(
        c.env.DB.prepare(`DELETE FROM activity_audits WHERE activity_id = ?1 AND rule = 'owner_swipe' AND ${held}`).bind(row.id, newV, back),
      );
    } else {
      stmts.push(
        c.env.DB.prepare(
          `INSERT OR REPLACE INTO activity_audits (activity_id, outcome, rule, reason, confidence, issues, duplicate_of, hidden, previous_active, previous_status, source, decided_by, audited_at)
           SELECT ?1, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15
            WHERE ${held}`,
        ).bind(
          row.id, newV, back,
          prev.outcome ?? "manual", prev.rule ?? "owner_swipe", prev.reason ?? "", prev.confidence ?? "medium", prev.issues ?? "[]",
          prev.duplicate_of ?? null, prev.hidden ?? 0, prev.previous_active ?? null, prev.previous_status ?? null,
          prev.source ?? "rules", prev.decided_by ?? null, prev.audited_at ?? now,
        ),
      );
    }
  }
  stmts.push(
    c.env.DB.prepare(`UPDATE owner_decision_log SET undone = 1 WHERE seq = ?4 AND ${held}`).bind(row.id, newV, back, log.seq),
    c.env.DB.prepare(
      `INSERT INTO owner_decision_log (activity_id, kind, from_decision, to_decision, version, note, decided_by, decided_at)
       SELECT ?1, 'undo', ?4, ?3, ?2, ?5, ?6, ?7 WHERE ${held}`,
    ).bind(row.id, newV, back, cur.decision, `Ongedaan gemaakt: ${log.kind} #${log.seq}`, owner, now),
  );

  const res = await c.env.DB.batch(stmts);
  if ((res[0]?.meta.changes ?? 0) !== 1) {
    const fresh = await c.env.DB.prepare(LOAD_STATE).bind(row.id).first<ActRow>();
    throw staleVersion(fresh?.version ?? 0, fresh?.decision ?? null);
  }
  await audit(c, { action: "swipe.undo", targetType: "activity", targetId: row.id, meta: { undid: log.seq, version: newV } });
  const fresh = await c.env.DB.prepare(LOAD_STATE).bind(row.id).first<ActRow>();
  return c.json({ ok: true, activityId: row.id, decision: back, version: newV, active: !!fresh?.active, status: fresh?.status });
});

/** Ask for an activity to be (re-)researched by the audit once it resumes. Only for kept activities. */
app.post("/swipe/reresearch", async (c) => {
  const b = await parseBody(c, z.object({ activityId: z.string().min(1).max(80), expectedVersion: z.number().int().min(1), on: z.boolean().default(true) }));
  const owner = c.get("adminUserId");
  const row = await c.env.DB.prepare(LOAD_STATE).bind(b.activityId).first<ActRow>();
  if (!row) throw notFound("Activiteit niet gevonden.");
  if (row.decision !== "keep") throw conflict("Alleen een behouden activiteit kan opnieuw worden onderzocht.", { code: "keep_first" });
  const cur = toState(row);
  if (b.expectedVersion !== cur.version) throw staleVersion(cur.version, cur.decision);
  const now = nowSec();
  const res = await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE owner_activity_decisions SET reresearch = ?3, version = version + 1, decided_by = ?4, decided_at = ?5
        WHERE activity_id = ?1 AND version = ?2 AND decision = 'keep'`,
    ).bind(row.id, cur.version, b.on ? 1 : 0, owner, now),
    c.env.DB.prepare(
      `INSERT INTO owner_decision_log (activity_id, kind, from_decision, to_decision, version, note, decided_by, decided_at)
       SELECT ?1, 'reresearch', 'keep', 'keep', ?2, ?3, ?4, ?5
        WHERE EXISTS (SELECT 1 FROM owner_activity_decisions WHERE activity_id = ?1 AND version = ?2 AND reresearch = ?6)`,
    ).bind(row.id, cur.version + 1, b.on ? "Opnieuw onderzoeken gevraagd" : "Verzoek ingetrokken", owner, now, b.on ? 1 : 0),
  ]);
  if ((res[0]?.meta.changes ?? 0) !== 1) {
    const fresh = await c.env.DB.prepare(LOAD_STATE).bind(row.id).first<ActRow>();
    throw staleVersion(fresh?.version ?? 0, fresh?.decision ?? null);
  }
  await audit(c, { action: b.on ? "swipe.reresearch" : "swipe.reresearch_off", targetType: "activity", targetId: row.id });
  return c.json({ ok: true, version: cur.version + 1, reresearch: b.on });
});

/* -------------------------------------------------------------------------- */
/*  Adding an activity                                                        */
/* -------------------------------------------------------------------------- */

const createBody = z.object({
  activity: activityInput,
  /** Add anyway although the quality rule would exclude it. */
  force: z.boolean().default(false),
  /** Add anyway although an activity with the same name/website already exists. */
  allowDuplicate: z.boolean().default(false),
  /** Add anyway although the owner deleted a matching activity earlier. */
  allowExcluded: z.boolean().default(false),
});

app.post("/swipe/activities", async (c) => {
  const b = await parseBody(c, createBody);
  const owner = c.get("adminUserId");
  const a = b.activity;

  const verdict = assessInput(a);
  if (verdict.outcome === "exclude" && verdict.confidence !== "low" && !b.force) {
    throw badRequest(`${verdict.reason} ${QUALITY_RULE} (regel: ${verdict.rule})`, { code: "quality_rule", rule: verdict.rule });
  }
  const { duplicates, deleted } = await findLookalikes(c.env, a);
  if (deleted.length && !b.allowExcluded) {
    throw conflict("Een gelijkaardige activiteit heb je eerder verwijderd. Herstel die, of voeg toch toe met expliciete toestemming.", { code: "previously_deleted", deleted, duplicates });
  }
  if (duplicates.length && !b.allowDuplicate) {
    throw conflict("Er bestaat al een gelijkaardige activiteit.", { code: "duplicate", duplicates, deleted });
  }

  const { id } = await insertAdminActivity(c.env, a, verdict);
  const now = nowSec();
  // The owner added it on purpose: it starts as "keep" (not as verified — that still needs evidence).
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO owner_activity_decisions (activity_id, decision, version, title_key, url_key, reresearch, note, decided_by, decided_at)
       VALUES (?1, 'keep', 1, ?2, ?3, 0, 'Handmatig toegevoegd door de eigenaar.', ?4, ?5)`,
    ).bind(id, titleKey(a.title, a.city), reliableUrlKey(a.websiteUrl ?? a.providerWebsite), owner, now),
    c.env.DB.prepare(
      `INSERT INTO owner_decision_log (activity_id, kind, from_decision, to_decision, version, note, decided_by, decided_at)
       VALUES (?1, 'create', NULL, 'keep', 1, 'Handmatig toegevoegd', ?2, ?3)`,
    ).bind(id, owner, now),
  ]);
  await audit(c, { action: "swipe.create", targetType: "activity", targetId: id, meta: { force: b.force, allowDuplicate: b.allowDuplicate, allowExcluded: b.allowExcluded } });
  return c.json({ id, version: 1, decision: "keep" }, 201);
});

export default app;
