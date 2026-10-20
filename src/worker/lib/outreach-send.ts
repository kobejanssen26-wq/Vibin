/**
 * Outreach delivery. The ONLY code path that can send an outreach mail.
 *
 *   sendMessageNow() re-reads everything from the database, runs the full
 *   evaluateSend() gate, atomically claims the row (so a double click or a
 *   retry cannot send twice) and only then talks to the provider.
 *
 * Real delivery needs APP_ENV=production AND mode=live AND the legal review
 * confirmed AND an approved, unchanged message. In every other situation the
 * provider is a mock / dry-run and no external system is contacted.
 */
import type { Env } from "../env";
import { newId } from "./id";
import { loadConfig } from "./outreach-config";
import { mentionedElsewhere } from "./outreach-draft";
import { runDiscoveryBatch } from "./outreach-discover";
import {
  buildFooter,
  buildHtml,
  emailDomain,
  evaluateSend,
  isValidEmail,
  messageHash,
  normalizeEmail,
  registrableDomain,
  signOptOut,
  type OutreachConfig,
  type Reason,
} from "./outreach-core";

export interface Actor {
  /** users.id of the approving owner, or null for the scheduler. */
  userId: string | null;
  kind: "owner" | "system";
}

export type SendOutcome =
  | { ok: true; test: boolean; dryRun: boolean; providerId: string }
  | { ok: false; kind: "blocked"; reasons: Reason[] }
  | { ok: false; kind: "failed"; error: string; retryable: boolean }
  | { ok: false; kind: "in_progress" };

const nowSec = () => Math.floor(Date.now() / 1000);

export function optOutUrl(env: Env, token: string): string {
  return `${env.APP_URL.replace(/\/$/, "")}/optout/${token}`;
}

/** Suppressed if the exact address, its domain or its registrable domain is listed. */
export async function isSuppressed(env: Env, email: string): Promise<boolean> {
  const e = normalizeEmail(email);
  const dom = emailDomain(e);
  const reg = registrableDomain(dom);
  const row = await env.DB.prepare(
    `SELECT 1 AS x FROM outreach_suppressions
      WHERE (kind = 'email' AND value = ?1) OR (kind = 'domain' AND value IN (?2, ?3))
      LIMIT 1`,
  )
    .bind(e, dom, reg)
    .first();
  return !!row;
}

/** DNS-over-HTTPS MX/A lookup. true / false = definite answer, null = could not tell. */
export async function checkMx(domain: string, fetchImpl: typeof fetch = fetch): Promise<boolean | null> {
  const q = async (type: "MX" | "A"): Promise<{ ok: boolean; hasAnswer: boolean } | null> => {
    try {
      const r = await fetchImpl(
        `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=${type}`,
        { headers: { accept: "application/dns-json" } },
      );
      if (!r.ok) return null;
      const j = (await r.json()) as { Status?: number; Answer?: { data?: string }[] };
      const answers = (j.Answer ?? []).filter((a) => a.data && a.data.trim() !== "0 .");
      return { ok: j.Status === 0, hasAnswer: answers.length > 0 };
    } catch {
      return null;
    }
  };
  const mx = await q("MX");
  if (!mx) return null;
  if (mx.hasAnswer) return true;
  const a = await q("A");
  if (!a) return null;
  return a.hasAnswer;
}

interface Row {
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

async function loadRow(env: Env, id: string): Promise<Row | null> {
  return env.DB.prepare(
    `SELECT m.id, m.org_id, m.contact_id, m.campaign_id, m.to_email, m.subject,
            m.body_text, m.status, m.test_mode, m.approved_by, m.approved_at,
            m.approved_hash, m.attempts,
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
    .first<Row>();
}

/** Run the gate against the CURRENT database state. `stage` "approve" skips the approval requirements. */
export async function checkMessage(
  env: Env,
  config: OutreachConfig,
  row: Row,
  stage: "approve" | "send",
): Promise<Reason[]> {
  const [suppressed, sentLive, last24, mentioned] = await Promise.all([
    isSuppressed(env, row.to_email),
    env.DB.prepare(
      `SELECT 1 AS x FROM outreach_messages
        WHERE status = 'sent' AND test_mode = 0 AND id != ?1
          AND ((org_id = ?2 AND NOT EXISTS (
                  SELECT 1 FROM outreach_message_activities x WHERE x.message_id = outreach_messages.id))
               OR lower(to_email) = ?3
               OR lower(to_email) LIKE '%@' || ?4 OR lower(to_email) LIKE '%.' || ?4) LIMIT 1`,
    )
      .bind(row.id, row.org_id, normalizeEmail(row.to_email), registrableDomain(emailDomain(row.to_email)))
      .first(),
    env.DB.prepare(
      `SELECT COUNT(*) AS n FROM outreach_messages
        WHERE status = 'sent' AND test_mode = 0 AND sent_at > ?1`,
    )
      .bind(nowSec() - 86400)
      .first<{ n: number }>(),
    // Activities this message names that another open or sent message to the organisation already named.
    mentionedElsewhere(env, { id: row.id, org_id: row.org_id, test_mode: row.test_mode }),
  ]);
  const currentHash = await messageHash({
    toEmail: row.to_email,
    subject: row.subject,
    bodyText: row.body_text,
  });
  return evaluateSend({
    config,
    message: {
      status: row.status,
      toEmail: row.to_email,
      subject: row.subject,
      bodyText: row.body_text,
      approvedHash: row.approved_hash,
      approvedBy: row.approved_by,
      approvedAt: row.approved_at,
      testMode: row.test_mode,
      contactId: row.contact_id,
    },
    currentHash,
    contact: row.c_id
      ? {
          id: row.c_id,
          orgId: row.c_org ?? "",
          email: row.c_email ?? "",
          kind: row.c_kind ?? "unknown",
          verification: row.c_ver ?? "unverified",
          mxOk: row.c_mx,
        }
      : null,
    org: row.o_id
      ? { id: row.o_id, excluded: row.o_excl ?? 0, groupConfidence: row.o_gconf ?? "high", groupConfirmed: row.o_gok ?? 0 }
      : null,
    alreadyMentioned: mentioned,
    suppressed,
    alreadySentLive: !!sentLive,
    sentLast24h: last24?.n ?? 0,
    runtime: {
      isProduction: env.APP_ENV === "production",
      hasProviderKey: !!env.EMAIL_API_KEY,
      hasSigningKey: !!env.ENCRYPTION_KEY,
    },
    stage,
  });
}

/** Look up (and cache) whether the contact's domain accepts mail. Production only. */
async function ensureMx(env: Env, row: Row): Promise<void> {
  if (env.APP_ENV !== "production" || !row.c_id || row.c_mx !== null) return;
  const ok = await checkMx(emailDomain(row.to_email));
  if (ok === null) return;
  await env.DB.prepare(`UPDATE outreach_contacts SET mx_ok = ?1, checked_at = ?2 WHERE id = ?3`)
    .bind(ok ? 1 : 0, nowSec(), row.c_id)
    .run();
  row.c_mx = ok ? 1 : 0;
}

export async function logAudit(
  env: Env,
  actor: Actor,
  action: string,
  targetId: string | null,
  meta: Record<string, unknown>,
): Promise<void> {
  try {
    await env.DB.prepare(
      `INSERT INTO audit_log (id, actor_type, actor_id, action, target_type, target_id, meta, created_at)
       VALUES (?1, ?2, ?3, ?4, 'outreach', ?5, ?6, ?7)`,
    )
      .bind(newId(), actor.kind, actor.userId, action, targetId, JSON.stringify(meta), nowSec())
      .run();
  } catch (e) {
    console.error("outreach audit failed", action, e);
  }
}

type ProviderResult =
  | { ok: true; id: string }
  | { ok: false; error: string; retryable: boolean };

interface Mail {
  from: string;
  to: string;
  /** The real intended recipient (differs from `to` in test mode). */
  originalTo: string;
  replyTo: string;
  subject: string;
  text: string;
  html?: string;
  headers: Record<string, string>;
  idempotencyKey: string;
}

async function deliver(env: Env, mail: Mail): Promise<ProviderResult> {
  // Outside production NO external system is ever contacted.
  if (env.APP_ENV !== "production") {
    // Test hook, non-production only: an address whose local part is "providerfail" simulates a provider error.
    if (env.OUTREACH_MOCK_PROVIDER === "fail" || mail.originalTo.startsWith("providerfail@")) {
      return { ok: false, error: "mock provider: simulated failure", retryable: true };
    }
    return { ok: true, id: `mock-${mail.idempotencyKey}` };
  }
  if (!env.EMAIL_API_KEY) return { ok: false, error: "geen e-mailprovider-sleutel", retryable: false };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.EMAIL_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": mail.idempotencyKey,
      },
      body: JSON.stringify({
        from: mail.from,
        to: [mail.to],
        reply_to: mail.replyTo,
        subject: mail.subject,
        text: mail.text,
        ...(mail.html ? { html: mail.html } : {}),
        headers: mail.headers,
      }),
    });
    const body = await res.text();
    if (!res.ok) {
      return {
        ok: false,
        error: `provider ${res.status}: ${body.slice(0, 200)}`,
        retryable: res.status >= 500 || res.status === 429,
      };
    }
    let id = "unknown";
    try {
      id = (JSON.parse(body) as { id?: string }).id ?? id;
    } catch {
      /* keep "unknown" */
    }
    return { ok: true, id };
  } catch (e) {
    // The request may or may not have been processed; the idempotency key makes a retry safe.
    return { ok: false, error: `netwerkfout: ${e instanceof Error ? e.message.slice(0, 120) : "onbekend"}`, retryable: true };
  }
}

/** One plain test mail from the configured sender to an address the owner types. Not an outreach mail. */
export async function sendTestEmail(
  env: Env,
  to: string,
): Promise<{ ok: true; from: string; id: string; mock: boolean } | { ok: false; error: string }> {
  const config = await loadConfig(env);
  if (!isValidEmail(config.fromEmail)) return { ok: false, error: "Er is nog geen afzenderadres ingesteld." };
  const from = `${config.fromName} <${config.fromEmail}>`;
  const out = await deliver(env, {
    from,
    to,
    originalTo: to,
    replyTo: config.replyTo || config.fromEmail,
    subject: "Testmail vanuit VIBIN",
    text: `Dit is een testmail om te controleren dat versturen vanaf ${config.fromEmail} werkt.

Als je dit leest, werkt de afzender (Resend + vibin.be).

Het VIBIN-team`,
    headers: {},
    idempotencyKey: `outreach-testmail-${Date.now()}`,
  });
  return out.ok ? { ok: true, from: config.fromEmail, id: out.id, mock: env.APP_ENV !== "production" } : { ok: false, error: out.error };
}

/**
 * Royal decree of 4 April 2003 art. 2: whoever objects to advertising by e-mail
 * must get an e-mailed receipt confirming that the objection was registered.
 * Only ever used in reply to an opt-out of a REAL (live) message; never for tests.
 */
export async function sendOptOutReceipt(
  env: Env,
  messageId: string,
  email: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const config = await loadConfig(env);
  if (!isValidEmail(config.fromEmail)) return { ok: false, error: "geen afzenderadres ingesteld" };
  const out = await deliver(env, {
    from: `${config.fromName} <${config.fromEmail}>`,
    to: email,
    originalTo: email,
    replyTo: config.replyTo || config.fromEmail,
    subject: "We hebben je afmelding ontvangen",
    text:
      "Hallo,\n\nWe hebben je verzoek ontvangen en geregistreerd: je ontvangt geen berichten meer van VIBIN op dit adres.\n\n" +
      "Is dit per vergissing gebeurd? Antwoord dan gerust op deze mail.\n\nHet VIBIN-team" +
      (config.contactAddress ? `\n${config.contactAddress}` : ""),
    headers: {},
    idempotencyKey: `outreach-optout-${messageId}`,
  });
  return out.ok ? { ok: true } : { ok: false, error: out.error };
}

/**
 * Deliver one approved/queued message. Safe to call repeatedly: only the call
 * that wins the atomic claim can reach the provider.
 */
export async function sendMessageNow(
  env: Env,
  messageId: string,
  actor: Actor,
): Promise<SendOutcome> {
  const config = await loadConfig(env);
  const row = await loadRow(env, messageId);
  if (!row) return { ok: false, kind: "blocked", reasons: [{ code: "not_found", message: "Bericht niet gevonden." }] };
  if (row.status === "sending") return { ok: false, kind: "in_progress" };

  await ensureMx(env, row);
  const reasons = await checkMessage(env, config, row, "send");
  if (reasons.length) {
    await logAudit(env, actor, "outreach.send_blocked", messageId, {
      codes: reasons.map((r) => r.code),
      orgId: row.org_id,
    });
    return { ok: false, kind: "blocked", reasons };
  }

  // Atomic claim — a second concurrent request changes 0 rows and stops here.
  const claim = await env.DB.prepare(
    `UPDATE outreach_messages
        SET status = 'sending', attempts = attempts + 1, updated_at = ?1
      WHERE id = ?2 AND status IN ('approved', 'queued')`,
  )
    .bind(nowSec(), messageId)
    .run();
  if (!claim.meta.changes) return { ok: false, kind: "in_progress" };

  const testRun = config.mode !== "live";
  const realTo = row.to_email;
  const token = env.ENCRYPTION_KEY ? await signOptOut(env.ENCRYPTION_KEY, row.id) : "";
  const footer = buildFooter({
    identity: config.senderIdentity,
    sourceUrl: row.c_src,
    optoutUrl: optOutUrl(env, token || "niet-beschikbaar-in-test"),
  });
  let text = `${row.body_text}\n${footer}`;
  const optoutLink = optOutUrl(env, token || "niet-beschikbaar-in-test");
  let banner: string | undefined;
  let subject = row.subject;
  let to = realTo;
  let dryRun = false;
  if (testRun) {
    // Never the real recipient. With no test inbox the whole thing is a dry run.
    if (config.testInbox) {
      to = config.testInbox;
      subject = `[TEST → ${realTo}] ${row.subject}`;
      text = `TESTBERICHT — dit zou naar ${realTo} gaan.\n\n${text}`;
      banner = `TESTBERICHT — dit zou naar ${realTo} gaan.`;
    } else {
      dryRun = true;
    }
  }

  const mail: Mail = {
    from: `${config.fromName} <${config.fromEmail || "outreach@invalid.example"}>`,
    to,
    originalTo: realTo,
    replyTo: config.replyTo || config.contactAddress || config.fromEmail,
    subject,
    text,
    html: buildHtml({ body: row.body_text, identity: config.senderIdentity, optoutUrl: optoutLink, banner }),
    headers: token
      ? {
          "List-Unsubscribe": `<${optOutUrl(env, token)}>${config.contactAddress ? `, <mailto:${config.contactAddress}?subject=stop>` : ""}`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        }
      : {},
    idempotencyKey: `outreach-${row.id}`,
  };

  const result: ProviderResult = dryRun
    ? { ok: true, id: "dry-run" }
    : await deliver(env, mail);

  if (result.ok) {
    await env.DB.prepare(
      `UPDATE outreach_messages
          SET status = 'sent', sent_at = ?1, provider_message_id = ?2,
              provider_result = ?3, error = NULL, updated_at = ?1
        WHERE id = ?4`,
    )
      .bind(nowSec(), result.id, dryRun ? "dry-run" : testRun ? "test" : "live", messageId)
      .run();
    await logAudit(env, actor, "outreach.sent", messageId, {
      orgId: row.org_id,
      mode: dryRun ? "dry-run" : testRun ? "test" : "live",
      providerId: result.id,
    });
    return { ok: true, test: testRun, dryRun, providerId: result.id };
  }

  await env.DB.prepare(
    `UPDATE outreach_messages
        SET status = 'failed', error = ?1, provider_result = ?2, updated_at = ?3
      WHERE id = ?4`,
  )
    .bind(result.error.slice(0, 500), result.retryable ? "retryable" : "permanent", nowSec(), messageId)
    .run();
  await logAudit(env, actor, "outreach.send_failed", messageId, {
    orgId: row.org_id,
    error: result.error.slice(0, 200),
    retryable: result.retryable,
  });
  return { ok: false, kind: "failed", error: result.error, retryable: result.retryable };
}

/** Approve a draft for the signed-in owner: re-checks everything and pins the approval to the content hash. */
export async function approveMessage(
  env: Env,
  messageId: string,
  actor: Actor,
  expectedHash: string,
): Promise<{ ok: true } | { ok: false; reasons: Reason[] }> {
  const config = await loadConfig(env);
  const row = await loadRow(env, messageId);
  if (!row) return { ok: false, reasons: [{ code: "not_found", message: "Bericht niet gevonden." }] };
  if (row.status !== "draft" && row.status !== "approved") {
    return { ok: false, reasons: [{ code: "bad_state", message: `Een bericht met status '${row.status}' kan niet worden goedgekeurd.` }] };
  }
  const current = await messageHash({ toEmail: row.to_email, subject: row.subject, bodyText: row.body_text });
  if (current !== expectedHash) {
    return {
      ok: false,
      reasons: [{ code: "preview_stale", message: "Het bericht is gewijzigd sinds je het bekeek. Bekijk het opnieuw." }],
    };
  }
  await ensureMx(env, row);
  const reasons = await checkMessage(env, config, row, "approve");
  if (reasons.length) return { ok: false, reasons };
  const testRun = config.mode !== "live";
  const res = await env.DB.prepare(
    `UPDATE outreach_messages
        SET status = 'approved', approved_by = ?1, approved_at = ?2, approved_hash = ?3,
            test_mode = ?4, error = NULL, updated_at = ?2
      WHERE id = ?5 AND status IN ('draft', 'approved')`,
  )
    .bind(actor.userId, nowSec(), current, testRun ? 1 : 0, messageId)
    .run();
  if (!res.meta.changes) return { ok: false, reasons: [{ code: "bad_state", message: "Status is intussen gewijzigd." }] };
  await logAudit(env, actor, "outreach.approved", messageId, { orgId: row.org_id, test: testRun });
  return { ok: true };
}

/** Scheduler hook: discovery batch, then drain running campaigns at the configured pace. */
export async function runOutreachTick(env: Env): Promise<void> {
  const config = await loadConfig(env);
  // One invocation may make at most ~50 outside requests (Workers free plan). Sending comes first;
  // address discovery (several fetches per organisation) only runs in ticks that sent nothing.
  const drained = await drainCampaigns(env);
  if (config.autoDiscovery && drained.sent + drained.blocked === 0) {
    const has = await env.DB.prepare(
      `SELECT 1 AS x FROM outreach_orgs WHERE discovery_status = 'pending' AND excluded = 0 LIMIT 1`,
    ).first();
    if (has) await runDiscoveryBatch(env, config.discoveryPerRun);
  }
}

/** Look up (and cache) the mail domain of a message's contact now, so approval/send need no lookup. */
export async function warmMx(env: Env, messageId: string): Promise<void> {
  const row = await loadRow(env, messageId);
  if (row) await ensureMx(env, row);
}

/** Send up to `perRun` queued messages from running campaigns. Every message passes the full gate. */
export async function drainCampaigns(env: Env): Promise<{ sent: number; blocked: number }> {
  const config = await loadConfig(env);
  const counts = { sent: 0, blocked: 0 };
  const campaigns = await env.DB.prepare(
    `SELECT id FROM outreach_campaigns WHERE status = 'running'`,
  ).all<{ id: string }>();
  const system: Actor = { userId: null, kind: "system" };
  let budget = config.perRun;
  for (const c of campaigns.results) {
    const queued = await env.DB.prepare(
      `SELECT id FROM outreach_messages WHERE campaign_id = ?1 AND status = 'queued'
        ORDER BY queued_at ASC LIMIT ?2`,
    )
      .bind(c.id, Math.max(1, budget))
      .all<{ id: string }>();
    for (const m of queued.results) {
      if (budget <= 0) break;
      budget--;
      const out = await sendMessageNow(env, m.id, system);
      if (out.ok) counts.sent++;
      if (!out.ok && out.kind === "blocked") {
        counts.blocked++;
        if (out.reasons.some((r) => r.code === "daily_cap")) {
          budget = 0; // stop for today; the rest stays queued
          break;
        }
        // A guard says no (e.g. objection arrived since approval): drop it from the queue.
        await env.DB.prepare(
          `UPDATE outreach_messages SET status = 'cancelled', error = ?1, updated_at = ?2
            WHERE id = ?3 AND status = 'queued'`,
        )
          .bind(`Overgeslagen: ${out.reasons.map((r) => r.code).join(", ")}`, nowSec(), m.id)
          .run();
      }
    }
    const left = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM outreach_messages WHERE campaign_id = ?1 AND status IN ('queued','sending')`,
    )
      .bind(c.id)
      .first<{ n: number }>();
    if ((left?.n ?? 0) === 0) {
      await env.DB.prepare(
        `UPDATE outreach_campaigns SET status = 'done', finished_at = ?1 WHERE id = ?2 AND status = 'running'`,
      )
        .bind(nowSec(), c.id)
        .run();
    }
    if (budget <= 0) break;
  }
  return counts;
}
