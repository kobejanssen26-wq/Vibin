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
import { notFound } from "../lib/errors";
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

export default app;
