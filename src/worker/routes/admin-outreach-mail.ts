/**
 * Owner Command Center — outreach messages: drafts, preview, approval, send,
 * campaigns. Mounted at /api/admin/cc/outreach behind withAdminSession +
 * requireOwner().
 *
 * Three separate steps, three separate calls:
 *   prepare  → a draft exists (selecting rows never goes further than this)
 *   approve  → the owner looked at the exact text; approval is pinned to its hash
 *   send     → "Goedkeuren en verzenden", or a deliberately started campaign
 * Every send re-checks everything server-side (see lib/outreach-send.ts).
 */
import { Hono } from "hono";
import { z } from "zod";
import type { Env, Vars } from "../env";
import { audit } from "../lib/audit";
import { badRequest, conflict, notFound } from "../lib/errors";
import { newId } from "../lib/id";
import { rateLimit } from "../lib/ratelimit";
import { parseBody } from "../lib/validate";
import { buildFooter, messageHash, sha256Hex, signOptOut, type Reason } from "../lib/outreach-core";
import { messageContext, prepareDraft } from "../lib/outreach-draft";
import { liveReadiness, loadConfig } from "../lib/outreach-config";
import {
  approveMessage,
  checkMessage,
  optOutUrl,
  drainCampaigns,
  sendTestEmail,
  sendMessageNow,
  type Actor,
} from "../lib/outreach-send";

type Ctx = { Bindings: Env; Variables: Vars };
const app = new Hono<Ctx>();
const nowSec = () => Math.floor(Date.now() / 1000);

const actorOf = (c: { get: (k: "adminUserId") => string | null }): Actor => ({
  userId: c.get("adminUserId"),
  kind: "owner",
});

interface MsgRow {
  id: string;
  org_id: string;
  contact_id: string | null;
  campaign_id: string | null;
  to_email: string;
  subject: string;
  body_text: string;
  status: string;
  test_mode: number;
  approved_by: string | null;
  approved_at: number | null;
  approved_hash: string | null;
  attempts: number;
  c_id: string | null;
  c_org: string | null;
  c_email: string | null;
  c_kind: string | null;
  c_ver: string | null;
  c_mx: number | null;
  c_src: string | null;
  o_id: string | null;
  o_excl: number | null;
  o_name: string | null;
  o_gconf: string | null;
  o_gok: number | null;
}

async function loadMsg(env: Env, id: string): Promise<MsgRow | null> {
  return env.DB.prepare(
    `SELECT m.id, m.org_id, m.contact_id, m.campaign_id, m.to_email, m.subject, m.body_text,
            m.status, m.test_mode, m.approved_by, m.approved_at, m.approved_hash, m.attempts,
            c.id AS c_id, c.org_id AS c_org, c.email AS c_email, c.kind AS c_kind,
            c.verification AS c_ver, c.mx_ok AS c_mx, c.source_url AS c_src,
            o.id AS o_id, o.excluded AS o_excl, o.name AS o_name,
            o.group_confidence AS o_gconf, o.group_confirmed AS o_gok
       FROM outreach_messages m
       LEFT JOIN outreach_contacts c ON c.id = m.contact_id
       LEFT JOIN outreach_orgs o ON o.id = m.org_id
      WHERE m.id = ?1`,
  )
    .bind(id)
    .first<MsgRow>();
}

/** The mail exactly as the recipient would see it (footer included). */
async function fullText(env: Env, row: MsgRow, identity: string): Promise<string> {
  const token = env.ENCRYPTION_KEY ? await signOptOut(env.ENCRYPTION_KEY, row.id) : "";
  const footer = buildFooter({
    identity,
    sourceUrl: row.c_src,
    optoutUrl: optOutUrl(env, token || "…"),
  });
  return `${row.body_text}\n${footer}`;
}

/* --------------------------------- prepare -------------------------------- */

app.post("/orgs/:id/prepare", async (c) => {
  const b = await parseBody(c, z.object({ contactId: z.string().max(40).optional() }));
  const r = await prepareDraft(c.env, c.req.param("id"), b.contactId);
  if (!r.ok) {
    throw r.code === "already_sent" || r.code === "in_queue" || r.code === "duplicate"
      ? conflict(r.message)
      : badRequest(r.message);
  }
  await audit(c, { action: "outreach.draft_prepared", targetType: "outreach_message", targetId: r.messageId });
  return c.json({ messageId: r.messageId, created: r.created });
});

/** Selecting rows can only ever lead here: drafts, never sending. */
app.post("/prepare-bulk", async (c) => {
  const b = await parseBody(c, z.object({ orgIds: z.array(z.string().max(40)).min(1).max(100) }));
  const out = { created: 0, updated: 0, skipped: [] as { orgId: string; reason: string }[] };
  for (const id of b.orgIds) {
    const r = await prepareDraft(c.env, id);
    if (r.ok) r.created ? out.created++ : out.updated++;
    else out.skipped.push({ orgId: id, reason: r.message });
  }
  await audit(c, { action: "outreach.drafts_prepared_bulk", targetType: "outreach", meta: { created: out.created, updated: out.updated, skipped: out.skipped.length } });
  return c.json(out);
});

/* --------------------------------- preview -------------------------------- */

app.get("/messages/:id", async (c) => {
  const row = await loadMsg(c.env, c.req.param("id"));
  if (!row) throw notFound("Bericht niet gevonden.");
  const config = await loadConfig(c.env);
  const hash = await messageHash({ toEmail: row.to_email, subject: row.subject, bodyText: row.body_text });
  const editable = ["draft", "approved", "failed"].includes(row.status);
  const reasons: Reason[] = editable || row.status === "queued"
    ? await checkMessage(c.env, config, row, row.status === "draft" ? "approve" : "send")
    : [];
  return c.json({
    id: row.id,
    orgId: row.org_id,
    orgName: row.o_name,
    status: row.status,
    testMode: !!row.test_mode,
    toEmail: row.to_email,
    subject: row.subject,
    bodyText: row.body_text,
    finalText: await fullText(c.env, row, config.senderIdentity),
    hash,
    approvedAt: row.approved_at,
    attempts: row.attempts,
    mode: config.mode,
    testInbox: config.mode === "live" ? null : config.testInbox || null,
    blockers: reasons,
    context: await messageContext(c.env, row.id, row.org_id),
    // Approval needs a draft/approved row without blocking reasons at the "approve" stage.
    canApprove:
      (row.status === "draft" || row.status === "approved") &&
      (await checkMessage(c.env, config, row, "approve")).length === 0,
  });
});

app.put("/messages/:id", async (c) => {
  const b = await parseBody(
    c,
    z.object({
      subject: z.string().trim().min(3).max(200).optional(),
      bodyText: z.string().trim().min(20).max(8000).optional(),
    }),
  );
  const row = await loadMsg(c.env, c.req.param("id"));
  if (!row) throw notFound("Bericht niet gevonden.");
  if (!["draft", "approved"].includes(row.status)) {
    throw conflict("Dit bericht kan niet meer worden aangepast.");
  }
  await c.env.DB.prepare(
    `UPDATE outreach_messages
        SET subject = ?1, body_text = ?2, status = 'draft',
            approved_by = NULL, approved_at = NULL, approved_hash = NULL, updated_at = ?3
      WHERE id = ?4 AND status IN ('draft','approved')`,
  )
    .bind(b.subject ?? row.subject, b.bodyText ?? row.body_text, nowSec(), row.id)
    .run();
  await audit(c, { action: "outreach.draft_edited", targetType: "outreach_message", targetId: row.id });
  return c.json({ ok: true });
});

/* ------------------------- approve / send / cancel ------------------------- */

const hashBody = z.object({ hash: z.string().min(32).max(80) });

function reasonsError(reasons: Reason[], status = 422) {
  return { error: "blocked", message: reasons.map((r) => r.message).join(" "), details: { reasons } , status };
}

app.post("/messages/:id/approve", async (c) => {
  const b = await parseBody(c, hashBody);
  const res = await approveMessage(c.env, c.req.param("id"), actorOf(c), b.hash);
  if (!res.ok) {
    const e = reasonsError(res.reasons);
    return c.json({ error: e.error, message: e.message, details: e.details }, 422);
  }
  await audit(c, { action: "outreach.approved_by_owner", targetType: "outreach_message", targetId: c.req.param("id") });
  return c.json({ ok: true });
});

app.post("/messages/:id/unapprove", async (c) => {
  const r = await c.env.DB.prepare(
    `UPDATE outreach_messages
        SET status = 'draft', approved_by = NULL, approved_at = NULL, approved_hash = NULL, updated_at = ?1
      WHERE id = ?2 AND status = 'approved'`,
  )
    .bind(nowSec(), c.req.param("id"))
    .run();
  if (!r.meta.changes) throw conflict("Alleen een goedgekeurd bericht kan worden ingetrokken.");
  await audit(c, { action: "outreach.unapproved", targetType: "outreach_message", targetId: c.req.param("id") });
  return c.json({ ok: true });
});

/* ------------------------------- bulk approval ------------------------------ */

const BULK_MAX = 300;

/**
 * Drafts (current mode) that pass the full approval gate right now, plus those that do not.
 * The fingerprint pins the exact set of texts the owner was shown.
 */
async function bulkCandidates(env: Env, config: Awaited<ReturnType<typeof loadConfig>>) {
  const testMode = config.mode === "live" ? 0 : 1;
  const rows = await env.DB.prepare(
    `SELECT id FROM outreach_messages WHERE status = 'draft' AND test_mode = ?1 AND contact_id IS NOT NULL
      ORDER BY created_at ASC LIMIT ?2`,
  )
    .bind(testMode, BULK_MAX)
    .all<{ id: string }>();
  const ok: { id: string; hash: string; toEmail: string; org: string | null; subject: string; activities: number }[] = [];
  const blocked: { id: string; toEmail: string; org: string | null; reasons: Reason[] }[] = [];
  for (const r of rows.results) {
    const m = await loadMsg(env, r.id);
    if (!m) continue;
    const reasons = await checkMessage(env, config, m, "approve");
    if (reasons.length) {
      blocked.push({ id: m.id, toEmail: m.to_email, org: m.o_name, reasons });
      continue;
    }
    const hash = await messageHash({ toEmail: m.to_email, subject: m.subject, bodyText: m.body_text });
    const n = await env.DB.prepare(`SELECT COUNT(*) AS n FROM outreach_message_activities WHERE message_id = ?1`)
      .bind(m.id)
      .first<{ n: number }>();
    ok.push({ id: m.id, hash, toEmail: m.to_email, org: m.o_name, subject: m.subject, activities: n?.n ?? 0 });
  }
  const fingerprint = await sha256Hex(ok.map((x) => `${x.id}:${x.hash}`).join("|"));
  return { ok, blocked, fingerprint, more: rows.results.length === BULK_MAX };
}

app.get("/bulk-approve/preview", async (c) => {
  const config = await loadConfig(c.env);
  const { ok, blocked, fingerprint, more } = await bulkCandidates(c.env, config);
  // One full text so the owner sees what all of them look like (the template is the same for all).
  const sample = ok[0] ? await loadMsg(c.env, ok[0].id) : null;
  return c.json({
    mode: config.mode,
    ready: ok.length,
    fingerprint,
    more,
    blockedCount: blocked.length,
    blocked: blocked.slice(0, 40),
    sample: ok.slice(0, 8).map((x) => ({ id: x.id, toEmail: x.toEmail, org: x.org, subject: x.subject, activities: x.activities })),
    sampleText: sample ? sample.body_text : null,
  });
});

/**
 * Approve every draft the owner just reviewed in one go. Nothing is sent here: approved
 * messages still need a campaign (or a single send). Each message still passes the full
 * gate, and approval stays pinned to that message's own hash.
 */
app.post("/bulk-approve", async (c) => {
  const b = await parseBody(c, z.object({ fingerprint: z.string().min(32).max(80), expectedCount: z.number().int().min(1).max(BULK_MAX) }));
  const actor = actorOf(c);
  await rateLimit(c.env, "outreach-bulk-approve", actor.userId ?? "owner", 6, 60);
  const config = await loadConfig(c.env);
  const cand = await bulkCandidates(c.env, config);
  if (cand.fingerprint !== b.fingerprint || cand.ok.length !== b.expectedCount) {
    throw conflict("De lijst concepten is gewijzigd sinds je ze bekeek. Open de samenvatting opnieuw.", { now: cand.ok.length });
  }
  let approved = 0;
  const failed: { id: string; toEmail: string; reasons: Reason[] }[] = [];
  for (const m of cand.ok) {
    const res = await approveMessage(c.env, m.id, actor, m.hash);
    if (res.ok) approved++;
    else failed.push({ id: m.id, toEmail: m.toEmail, reasons: res.reasons });
  }
  await audit(c, { action: "outreach.bulk_approved", targetType: "outreach", meta: { approved, failed: failed.length, mode: config.mode } });
  return c.json({ approved, failed: failed.slice(0, 40), failedCount: failed.length });
});

/** "Goedkeuren en verzenden": approve exactly what was previewed, then deliver this one message. */
app.post("/messages/:id/send", async (c) => {
  const id = c.req.param("id");
  const b = await parseBody(c, hashBody);
  const actor = actorOf(c);
  await rateLimit(c.env, "outreach-send", actor.userId ?? "owner", 30, 60);

  const before = await loadMsg(c.env, id);
  if (!before) throw notFound("Bericht niet gevonden.");
  if (before.status === "queued") throw conflict("Dit bericht zit in een campagne en wordt daar verzonden.");
  if (before.status === "sent") throw conflict("Dit bericht is al verzonden.");
  if (before.status === "sending") throw conflict("Dit bericht wordt op dit moment verzonden.");

  const appr = await approveMessage(c.env, id, actor, b.hash);
  if (!appr.ok) {
    const e = reasonsError(appr.reasons);
    return c.json({ error: e.error, message: e.message, details: e.details }, 422);
  }
  const out = await sendMessageNow(c.env, id, actor);
  if (out.ok) return c.json({ ok: true, test: out.test, dryRun: out.dryRun, providerId: out.providerId });
  if (out.kind === "in_progress") throw conflict("Dit bericht wordt al verzonden of is al verzonden.");
  if (out.kind === "blocked") {
    const e = reasonsError(out.reasons);
    return c.json({ error: e.error, message: e.message, details: e.details }, 422);
  }
  return c.json(
    { error: "send_failed", message: `Verzenden mislukt: ${out.error}`, details: { retryable: out.retryable } },
    502,
  );
});

app.post("/messages/:id/retry", async (c) => {
  const id = c.req.param("id");
  const row = await loadMsg(c.env, id);
  if (!row) throw notFound("Bericht niet gevonden.");
  if (row.status !== "failed") throw conflict("Alleen een mislukt bericht kan opnieuw worden geprobeerd.");
  try {
    await c.env.DB.prepare(
      `UPDATE outreach_messages SET status = 'approved', error = NULL, updated_at = ?1
        WHERE id = ?2 AND status = 'failed'`,
    )
      .bind(nowSec(), id)
      .run();
  } catch {
    throw conflict("Er bestaat al een ander bericht voor dit adres.");
  }
  // The send gate re-validates everything (and the hash) when the owner presses send again.
  await audit(c, { action: "outreach.retry_requested", targetType: "outreach_message", targetId: id });
  return c.json({ ok: true });
});

app.post("/messages/:id/cancel", async (c) => {
  const r = await c.env.DB.prepare(
    `UPDATE outreach_messages SET status = 'cancelled', updated_at = ?1
      WHERE id = ?2 AND status IN ('draft','approved','queued','failed')`,
  )
    .bind(nowSec(), c.req.param("id"))
    .run();
  if (!r.meta.changes) throw conflict("Dit bericht kan niet meer worden geannuleerd.");
  await audit(c, { action: "outreach.cancelled", targetType: "outreach_message", targetId: c.req.param("id") });
  return c.json({ ok: true });
});

/** Remove every test-mode message and test campaign so the whole flow can be rehearsed again. */
app.post("/test-reset", async (c) => {
  const res = await c.env.DB.batch([
    c.env.DB.prepare(`DELETE FROM outreach_messages WHERE test_mode = 1 AND status != 'sending'`),
    c.env.DB.prepare(`DELETE FROM outreach_campaigns WHERE test_mode = 1`),
  ]);
  const removed = res[0]?.meta.changes ?? 0;
  await audit(c, { action: "outreach.test_reset", targetType: "outreach", meta: { removed } });
  return c.json({ removed });
});

/** Owner-only: one plain test mail to an address the owner types, to prove the sender works. */
app.post("/test-email", async (c) => {
  const b = await parseBody(c, z.object({ to: z.string().trim().toLowerCase().email().max(254) }));
  await rateLimit(c.env, "outreach-testmail", c.get("adminUserId") ?? "owner", 5, 300);
  const r = await sendTestEmail(c.env, b.to);
  await audit(c, { action: "outreach.test_email", targetType: "outreach", meta: { ok: r.ok } });
  if (!r.ok) throw badRequest(r.error);
  return c.json(r);
});

/* -------------------------------- campaigns -------------------------------- */

app.get("/campaign/preview", async (c) => {
  const config = await loadConfig(c.env);
  const testMode = config.mode === "live" ? 0 : 1;
  const rows = await c.env.DB.prepare(
    `SELECT m.id FROM outreach_messages m
      WHERE m.status = 'approved' AND m.campaign_id IS NULL AND m.test_mode = ?1
      ORDER BY m.approved_at ASC LIMIT 200`,
  )
    .bind(testMode)
    .all<{ id: string }>();
  const totalRow = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM outreach_messages
      WHERE status = 'approved' AND campaign_id IS NULL AND test_mode = ?1`,
  )
    .bind(testMode)
    .first<{ n: number }>();
  const total = totalRow?.n ?? 0;

  const ok: { id: string; toEmail: string; org: string | null }[] = [];
  const skipped: { id: string; toEmail: string; org: string | null; reasons: Reason[] }[] = [];
  for (const r of rows.results) {
    const m = await loadMsg(c.env, r.id);
    if (!m) continue;
    const reasons = await checkMessage(c.env, config, m, "send");
    if (reasons.length) skipped.push({ id: m.id, toEmail: m.to_email, org: m.o_name, reasons });
    else ok.push({ id: m.id, toEmail: m.to_email, org: m.o_name });
  }
  const warnings: string[] = [];
  if (config.mode !== "live") warnings.push("Testmodus: berichten gaan nooit naar echte ontvangers.");
  if (total > rows.results.length) {
    warnings.push(`Alleen de eerste ${rows.results.length} van ${total} zijn nu doorgelicht; elk bericht wordt vlak voor verzending opnieuw gecontroleerd.`);
  }
  const readiness = liveReadiness(config, c.env);
  if (config.mode === "live" && !readiness.ready) warnings.push(...readiness.blockers);
  const perDay = Math.min(config.dailyCap, config.perRun * 48);
  return c.json({
    mode: config.mode,
    approvedTotal: total,
    checked: rows.results.length,
    ready: ok.length,
    skipped: skipped.slice(0, 50),
    skippedCount: skipped.length,
    sample: ok.slice(0, 50),
    warnings,
    pace: { perRun: config.perRun, everyMinutes: 30, dailyCap: config.dailyCap, perDay },
    estimatedDays: total ? Math.ceil(total / Math.max(1, perDay)) : 0,
  });
});

app.post("/campaign/start", async (c) => {
  const b = await parseBody(
    c,
    z.object({ name: z.string().trim().min(2).max(80), expectedCount: z.number().int().min(1).max(5000) }),
  );
  const config = await loadConfig(c.env);
  if (config.mode === "live") {
    const ready = liveReadiness(config, c.env);
    if (!ready.ready) throw badRequest("Echte verzending is niet klaar.", { blockers: ready.blockers });
  }
  const testMode = config.mode === "live" ? 0 : 1;
  const count = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM outreach_messages
      WHERE status = 'approved' AND campaign_id IS NULL AND test_mode = ?1`,
  )
    .bind(testMode)
    .first<{ n: number }>();
  if ((count?.n ?? 0) !== b.expectedCount) {
    throw conflict("De lijst met goedgekeurde berichten is gewijzigd sinds je ze bekeek. Open de samenvatting opnieuw.", {
      now: count?.n ?? 0,
    });
  }
  const id = newId();
  const now = nowSec();
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO outreach_campaigns (id, name, status, test_mode, total, created_by, created_at)
       VALUES (?1, ?2, 'running', ?3, ?4, ?5, ?6)`,
    ).bind(id, b.name, testMode, b.expectedCount, c.get("adminUserId"), now),
    // Only individually approved, not-yet-sent messages can ever enter the queue.
    c.env.DB.prepare(
      `UPDATE outreach_messages
          SET status = 'queued', campaign_id = ?1, queued_at = ?2, updated_at = ?2
        WHERE status = 'approved' AND campaign_id IS NULL AND test_mode = ?3
          AND approved_by IS NOT NULL AND approved_hash IS NOT NULL`,
    ).bind(id, now, testMode),
  ]);
  await audit(c, {
    action: "outreach.campaign_started",
    targetType: "outreach_campaign",
    targetId: id,
    meta: { count: b.expectedCount, mode: config.mode },
  });
  return c.json({ id }, 201);
});

app.get("/campaigns", async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT g.id, g.name, g.status, g.test_mode AS testMode, g.total, g.created_at AS createdAt,
            g.finished_at AS finishedAt,
            (SELECT COUNT(*) FROM outreach_messages m WHERE m.campaign_id = g.id AND m.status = 'sent') AS sent,
            (SELECT COUNT(*) FROM outreach_messages m WHERE m.campaign_id = g.id AND m.status IN ('queued','sending')) AS pending,
            (SELECT COUNT(*) FROM outreach_messages m WHERE m.campaign_id = g.id AND m.status = 'failed') AS failed,
            (SELECT COUNT(*) FROM outreach_messages m WHERE m.campaign_id = g.id AND m.status = 'cancelled') AS cancelled
       FROM outreach_campaigns g ORDER BY g.created_at DESC LIMIT 30`,
  ).all();
  return c.json({ rows: rows.results.map((r) => ({ ...(r as object), testMode: !!(r as { testMode: number }).testMode })) });
});

app.post("/campaigns/:id/:action{pause|resume|cancel|run-now}", async (c) => {
  const id = c.req.param("id");
  const action = c.req.param("action");
  const cur = await c.env.DB.prepare(`SELECT status FROM outreach_campaigns WHERE id = ?1`)
    .bind(id)
    .first<{ status: string }>();
  if (!cur) throw notFound("Campagne niet gevonden.");
  if (action === "pause") {
    await c.env.DB.prepare(`UPDATE outreach_campaigns SET status = 'paused' WHERE id = ?1 AND status = 'running'`).bind(id).run();
  } else if (action === "resume") {
    await c.env.DB.prepare(`UPDATE outreach_campaigns SET status = 'running' WHERE id = ?1 AND status = 'paused'`).bind(id).run();
  } else if (action === "cancel") {
    await c.env.DB.batch([
      c.env.DB.prepare(`UPDATE outreach_campaigns SET status = 'cancelled', finished_at = ?2 WHERE id = ?1 AND status IN ('running','paused')`).bind(id, nowSec()),
      c.env.DB.prepare(`UPDATE outreach_messages SET status = 'cancelled', updated_at = ?2 WHERE campaign_id = ?1 AND status = 'queued'`).bind(id, nowSec()),
    ]);
  } else {
    if (cur.status !== "running") throw conflict("Alleen een lopende campagne kan nu worden verwerkt.");
    await rateLimit(c.env, "outreach-runnow", "owner", 20, 60);
    await drainCampaigns(c.env);
  }
  await audit(c, { action: `outreach.campaign_${action.replace("-", "_")}`, targetType: "outreach_campaign", targetId: id });
  return c.json({ ok: true });
});

export default app;
