/**
 * Owner Command Center — provider outreach: organisations, contacts, discovery,
 * settings, do-not-contact list, CSV import/export. (Messages, approval and
 * campaigns live in admin-outreach-mail.ts.)
 *
 * Mounted at /api/admin/cc/outreach behind withAdminSession + requireOwner().
 * Nothing here sends mail.
 */
import { Hono } from "hono";
import { z } from "zod";
import type { Env, Vars } from "../env";
import { audit } from "../lib/audit";
import { toCsvLine, CSV_BOM, parseCsv } from "../lib/csv";
import { badRequest, conflict, notFound } from "../lib/errors";
import { newId } from "../lib/id";
import { parseBody } from "../lib/validate";
import {
  AGGREGATOR_DOMAINS,
  classifyEmail,
  classifyRole,
  domainMatchesSite,
  hostOf,
  isValidEmail,
  normalizeEmail,
  registrableDomain,
} from "../lib/outreach-core";
import {
  configPatchSchema,
  liveReadiness,
  loadConfig,
  saveConfig,
} from "../lib/outreach-config";
import { electPrimary, runDiscoveryBatch } from "../lib/outreach-discover";
import { assessOrgs, backfillContactRoles, describeGroup, refreshOrgDrafts } from "../lib/outreach-draft";

type Ctx = { Bindings: Env; Variables: Vars };
const app = new Hono<Ctx>();

const nowSec = () => Math.floor(Date.now() / 1000);
const PENDING_MESSAGE_STATES = "('draft','approved','queued')";

/**
 * "Ready to send": nothing left for the owner to fix. A live activity on a working site, a
 * checked generic address that can receive mail and is not on the do-not-contact list, a group
 * that is sure (or confirmed), and no mail sent, queued or approved for the organisation yet.
 * (The send gate re-checks everything again per message.)
 */
const READY_WHERE = `o.excluded = 0 AND o.discovery_status = 'found'
  AND (o.group_confidence IN ('high','medium') OR o.group_confirmed = 1)
  AND EXISTS (SELECT 1 FROM outreach_org_activities l JOIN activities a ON a.id = l.activity_id
               WHERE l.org_id = o.id AND l.included = 1 AND a.active = 1
                 AND (a.web_status IS NULL OR a.web_status IN ('alive','unknown')))
  AND EXISTS (SELECT 1 FROM outreach_contacts k
               WHERE k.org_id = o.id AND k.verification = 'checked' AND k.kind = 'generic'
                 AND k.mx_ok IS NOT 0 AND k.domain_matches = 1 AND k.evidence_status IN ('verified','likely')
                 AND NOT EXISTS (SELECT 1 FROM outreach_suppressions s
                                  WHERE (s.kind = 'email' AND s.value = k.email)
                                     OR (s.kind = 'domain' AND k.email LIKE '%@' || s.value)))
  AND NOT EXISTS (SELECT 1 FROM outreach_messages m WHERE m.org_id = o.id AND m.test_mode = 0
                   AND m.status IN ('sent','queued','sending','approved'))`;

function page(url: URL, def = 25) {
  const p = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const size = Math.min(100, Math.max(5, Number(url.searchParams.get("pageSize")) || def));
  return { page: p, pageSize: size, offset: (p - 1) * size };
}
const like = (s: string) => `%${s.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;

/** Cancel unsent messages (drafts, approvals, queued) matching a WHERE fragment. */
async function cancelPending(env: Env, where: string, ...binds: unknown[]): Promise<number> {
  const r = await env.DB.prepare(
    `UPDATE outreach_messages
        SET status = 'cancelled', error = 'Geannuleerd: gegevens gewijzigd of uitgesloten', updated_at = ?1
      WHERE status IN ${PENDING_MESSAGE_STATES} AND (${where})`,
  )
    .bind(nowSec(), ...binds)
    .run();
  return r.meta.changes ?? 0;
}

async function logEvent(
  env: Env,
  orgId: string,
  kind: string,
  body: string,
  userId: string | null,
  messageId: string | null = null,
) {
  await env.DB.prepare(
    `INSERT INTO outreach_events (id, org_id, message_id, kind, body, created_by, created_at)
     VALUES (?1,?2,?3,?4,?5,?6,?7)`,
  )
    .bind(newId(), orgId, messageId, kind, body.slice(0, 2000), userId, nowSec())
    .run();
}

/* ------------------------------ configuration ----------------------------- */

app.get("/config", async (c) => {
  const config = await loadConfig(c.env);
  return c.json({
    config,
    readiness: liveReadiness(config, c.env),
    runtime: {
      appEnv: c.env.APP_ENV,
      hasProviderKey: !!c.env.EMAIL_API_KEY,
      hasSigningKey: !!c.env.ENCRYPTION_KEY,
      realDeliveryPossible: c.env.APP_ENV === "production" && !!c.env.EMAIL_API_KEY,
    },
  });
});

app.put("/config", async (c) => {
  const patch = await parseBody(c, configPatchSchema);
  const current = await loadConfig(c.env);
  const next = { ...current, ...patch };
  if (patch.mode === "live" && current.mode !== "live") {
    const ready = liveReadiness(next, c.env);
    if (!ready.ready) {
      throw badRequest("Echte verzending kan nog niet worden ingeschakeld.", { blockers: ready.blockers });
    }
  }
  await saveConfig(c.env, next, c.get("adminUserId"));
  await audit(c, {
    action: "outreach.config_updated",
    targetType: "outreach",
    meta: { fields: Object.keys(patch), mode: next.mode },
  });
  return c.json({ config: next, readiness: liveReadiness(next, c.env) });
});

app.post("/legal-review", async (c) => {
  const b = await parseBody(
    c,
    z.object({ approved: z.boolean(), note: z.string().trim().max(1000).default("") }),
  );
  if (b.approved && b.note.length < 10) {
    throw badRequest("Leg kort vast wie de controle deed en op welke basis (min. 10 tekens).");
  }
  const config = await loadConfig(c.env);
  config.legalReview = b.approved
    ? { status: "approved", reviewedAt: nowSec(), reviewedBy: c.get("adminUserId"), note: b.note }
    : { status: "not_reviewed", reviewedAt: null, reviewedBy: null, note: b.note };
  if (!b.approved) config.mode = "test"; // withdrawing the review also switches real sending off
  await saveConfig(c.env, config, c.get("adminUserId"));
  await audit(c, {
    action: b.approved ? "outreach.legal_review_confirmed" : "outreach.legal_review_withdrawn",
    targetType: "outreach",
    meta: { noteLength: b.note.length },
  });
  return c.json({ config, readiness: liveReadiness(config, c.env) });
});

/* -------------------------------- summary --------------------------------- */

app.get("/summary", async (c) => {
  const db = c.env.DB;
  const [orgs, msgs, usable, sentLive, sentDay, supp, campaigns] = await db.batch([
    db.prepare(
      `SELECT discovery_status AS k, COUNT(*) AS n FROM outreach_orgs GROUP BY discovery_status`,
    ),
    db.prepare(`SELECT status AS k, test_mode AS t, COUNT(*) AS n FROM outreach_messages GROUP BY status, test_mode`),
    db.prepare(
      `SELECT COUNT(DISTINCT o.id) AS n FROM outreach_orgs o
         JOIN outreach_contacts c ON c.org_id = o.id AND c.kind = 'generic' AND c.verification = 'checked'
        WHERE o.excluded = 0`,
    ),
    db.prepare(`SELECT COUNT(*) AS n FROM outreach_messages WHERE status = 'sent' AND test_mode = 0`),
    db.prepare(
      `SELECT COUNT(*) AS n FROM outreach_messages WHERE status = 'sent' AND test_mode = 0 AND sent_at > ?1`,
    ).bind(nowSec() - 86400),
    db.prepare(`SELECT COUNT(*) AS n FROM outreach_suppressions`),
    db.prepare(`SELECT COUNT(*) AS n FROM outreach_campaigns WHERE status = 'running'`),
  ]);
  const byDisc: Record<string, number> = {};
  let total = 0;
  for (const r of (orgs!.results as { k: string; n: number }[])) {
    byDisc[r.k] = r.n;
    total += r.n;
  }
  const byMsg: Record<string, number> = {};
  for (const r of (msgs!.results as { k: string; t: number; n: number }[])) {
    const key = `${r.k}${r.t ? "_test" : ""}`;
    byMsg[key] = r.n;
  }
  const one = (x: typeof usable) => (x!.results[0] as { n: number } | undefined)?.n ?? 0;
  return c.json({
    orgs: total,
    discovery: byDisc,
    messages: byMsg,
    usableContacts: one(usable),
    sentLive: one(sentLive),
    sentLast24h: one(sentDay),
    suppressions: one(supp),
    runningCampaigns: one(campaigns),
  });
});

/* --------------------------- build orgs from activities -------------------- */

// Domain extraction in SQL so a whole sync is a handful of statements (D1 has
// tight per-request query limits; 5,000 activities must not mean 5,000 calls).
const DOMAIN_CTE = `
WITH base AS (
  SELECT a.id AS activity_id,
         trim(COALESCE(NULLIF(a.provider_website,''), NULLIF(a.website_url,''))) AS raw,
         COALESCE(NULLIF(trim(a.provider),''), a.title) AS pname
    FROM activities a WHERE a.active = 1
),
s1 AS MATERIALIZED (
  SELECT activity_id, raw, pname, lower(raw) AS u,
         CASE WHEN instr(lower(raw),'://') > 0 THEN substr(lower(raw), instr(lower(raw),'://') + 3) ELSE lower(raw) END AS rest
    FROM base WHERE raw IS NOT NULL AND raw != ''
),
s2 AS MATERIALIZED (
  SELECT activity_id, raw, pname, u,
         CASE WHEN instr(rest,'/') > 0 THEN substr(rest, 1, instr(rest,'/') - 1) ELSE rest END AS hp
    FROM s1
),
s3 AS MATERIALIZED (
  SELECT activity_id, raw, pname, u,
         CASE WHEN instr(hp,'?') > 0 THEN substr(hp, 1, instr(hp,'?') - 1) ELSE hp END AS hp2
    FROM s2
),
s4 AS MATERIALIZED (
  SELECT activity_id, raw, pname, u,
         CASE WHEN instr(hp2,':') > 0 THEN substr(hp2, 1, instr(hp2,':') - 1) ELSE hp2 END AS h
    FROM s3
),
d AS MATERIALIZED (
  SELECT activity_id, raw, pname,
         CASE WHEN h LIKE 'www.%' THEN substr(h, 5) ELSE h END AS domain
    FROM s4
   WHERE u NOT LIKE 'mailto:%' AND u NOT LIKE 'tel:%'
)`;
const DOMAIN_OK = `domain LIKE '%.%' AND domain NOT GLOB '*[^a-z0-9.-]*'
  AND domain NOT GLOB '[0-9]*.[0-9]*.[0-9]*.[0-9]*' AND length(domain) <= 120
  AND domain NOT LIKE '%.local' AND domain NOT LIKE '%.test' AND domain NOT LIKE '%.example'`;

app.post("/sync", async (c) => {
  const db = c.env.DB;
  const before = await db.prepare(`SELECT COUNT(*) AS n FROM outreach_orgs`).first<{ n: number }>();
  const stmts: D1PreparedStatement[] = [
    db.prepare(
      `${DOMAIN_CTE}
       INSERT OR IGNORE INTO outreach_orgs (id, domain, name, website_url, activity_count, created_at, updated_at)
       SELECT lower(hex(randomblob(11))), domain,
              CASE WHEN COUNT(DISTINCT pname) = 1 THEN MIN(pname) ELSE domain END,
              MIN(raw), COUNT(*), unixepoch(), unixepoch()
         FROM d WHERE ${DOMAIN_OK} GROUP BY domain`,
    ),
    db.prepare(
      `${DOMAIN_CTE}
       INSERT OR IGNORE INTO outreach_org_activities (org_id, activity_id)
       SELECT o.id, x.activity_id FROM (SELECT * FROM d WHERE ${DOMAIN_OK}) x JOIN outreach_orgs o ON o.domain = x.domain`,
    ),
    db.prepare(
      `UPDATE outreach_orgs
          SET activity_count = (SELECT COUNT(*) FROM outreach_org_activities l WHERE l.org_id = outreach_orgs.id),
              updated_at = unixepoch()`,
    ),
    // Organisations whose every activity has a dead / parked / closed / blocked site are not checked.
    db.prepare(
      `UPDATE outreach_orgs
          SET discovery_status = 'skipped', discovery_note = 'geen actieve activiteit met werkende website'
        WHERE discovery_status = 'pending'
          AND NOT EXISTS (
            SELECT 1 FROM outreach_org_activities l JOIN activities a ON a.id = l.activity_id
             WHERE l.org_id = outreach_orgs.id AND a.active = 1 AND (a.web_status IS NULL OR a.web_status IN ('alive','unknown')))`,
    ),
    // Many different names under one domain: a platform, a chain or a data error — a human decides.
    db.prepare(
      `UPDATE outreach_orgs SET review_flag = 'many_names_one_domain'
        WHERE review_flag IS NULL AND activity_count >= 12
          AND (SELECT COUNT(DISTINCT a.provider) FROM outreach_org_activities l
                 JOIN activities a ON a.id = l.activity_id WHERE l.org_id = outreach_orgs.id) >= 6`,
    ),
    // Government / heritage / library sites are data sources more than providers: a human decides.
    db.prepare(
      `UPDATE outreach_orgs SET review_flag = COALESCE(review_flag, 'public_body')
        WHERE domain LIKE '%bibliotheek%' OR domain LIKE '%gemeente%' OR domain LIKE '%commune%'
           OR domain LIKE 'provincie%' OR domain LIKE '%.vlaanderen.be' OR domain = 'vlaanderen.be'
           OR domain LIKE '%.wallonie.be' OR domain LIKE '%.brussels' OR domain LIKE '%.fgov.be'
           OR domain LIKE '%onroerenderfgoed%' OR domain LIKE '%natuurenbos%' OR domain LIKE '%.gouv.fr'
           OR domain LIKE '%.nrw.de'`,
    ),
    ...[...AGGREGATOR_DOMAINS].map((d) =>
      db.prepare(
        `UPDATE outreach_orgs
            SET discovery_status = 'skipped', discovery_note = 'platform of sociaal netwerk, geen eigen aanbieder'
          WHERE discovery_status = 'pending' AND (domain = ?1 OR domain LIKE '%.' || ?1)`,
      ).bind(d),
    ),
  ];
  await db.batch(stmts);
  // New domains get a grouping verdict; one the owner confirmed is never touched.
  await db.prepare(
    `UPDATE outreach_orgs SET group_confidence = 'high', group_source = 'single'
      WHERE group_confidence = 'unchecked' AND activity_count <= 1`,
  ).run();
  const grouping = await assessOrgs(c.env, { limit: 400 });
  await backfillContactRoles(c.env);
  const after = await db.prepare(`SELECT COUNT(*) AS n FROM outreach_orgs`).first<{ n: number }>();
  const links = await db.prepare(`SELECT COUNT(*) AS n FROM outreach_org_activities`).first<{ n: number }>();
  await audit(c, {
    action: "outreach.synced",
    targetType: "outreach",
    meta: { orgsBefore: before?.n ?? 0, orgsAfter: after?.n ?? 0 },
  });
  return c.json({
    orgs: after?.n ?? 0,
    added: (after?.n ?? 0) - (before?.n ?? 0),
    activityLinks: links?.n ?? 0,
    grouping,
  });
});

/** Judge organisations that have no grouping verdict yet (also fills in contact roles). */
app.post("/group/assess", async (c) => {
  const grouping = await assessOrgs(c.env, { limit: 400 });
  const roles = await backfillContactRoles(c.env);
  await audit(c, { action: "outreach.group_assessed", targetType: "outreach", meta: { ...grouping, roles } });
  return c.json({ ...grouping, roles });
});

app.post("/discover", async (c) => {
  const b = await parseBody(c, z.object({ limit: z.number().int().min(1).max(15).default(8) }));
  const r = await runDiscoveryBatch(c.env, b.limit);
  await audit(c, { action: "outreach.discovery_batch", targetType: "outreach", meta: r });
  return c.json(r);
});

/* ------------------------------ organisations ----------------------------- */

app.get("/orgs", async (c) => {
  const url = new URL(c.req.url);
  const { page: pg, pageSize, offset } = page(url);
  const q = (url.searchParams.get("q") || "").trim().slice(0, 100);
  const verification = url.searchParams.get("verification") || "";
  const emailStatus = url.searchParams.get("emailStatus") || "";
  const discovery = url.searchParams.get("discovery") || "";
  const excluded = url.searchParams.get("excluded") || "hide";
  const uncontacted = url.searchParams.get("uncontacted") === "1";
  const usable = url.searchParams.get("usable") === "1";
  const sortReq = url.searchParams.get("sort") || "activities";
  const group = url.searchParams.get("group") || "";
  const ready = url.searchParams.get("ready") === "1";

  const where: string[] = [];
  const binds: unknown[] = [];
  if (q) {
    where.push(
      `(o.name LIKE ? ESCAPE '\\' OR o.domain LIKE ? ESCAPE '\\'
        OR EXISTS (SELECT 1 FROM outreach_contacts x WHERE x.org_id = o.id AND x.email LIKE ? ESCAPE '\\')
        OR EXISTS (SELECT 1 FROM outreach_org_activities l JOIN activities a ON a.id = l.activity_id
                    WHERE l.org_id = o.id AND a.title LIKE ? ESCAPE '\\'))`,
    );
    const l = like(q);
    binds.push(l, l, l, l);
  }
  if (["checked", "uncertain", "unverified"].includes(verification)) {
    where.push(`c.verification = ?`);
    binds.push(verification);
  } else if (verification === "none") {
    where.push(`c.id IS NULL`);
  }
  if (emailStatus === "not_prepared") where.push(`m.id IS NULL`);
  else if (emailStatus === "ready_for_review") where.push(`m.status = 'draft'`);
  else if (emailStatus === "approved") where.push(`m.status IN ('approved','queued','sending')`);
  else if (emailStatus === "sent") where.push(`m.status = 'sent'`);
  else if (emailStatus === "error") where.push(`m.status = 'failed'`);
  if (["pending", "found", "none", "error", "skipped"].includes(discovery)) {
    where.push(`o.discovery_status = ?`);
    binds.push(discovery);
  }
  if (excluded === "hide") where.push(`o.excluded = 0`);
  else if (excluded === "only") where.push(`o.excluded = 1`);
  if (uncontacted) {
    where.push(
      `NOT EXISTS (SELECT 1 FROM outreach_messages s WHERE s.org_id = o.id AND s.status = 'sent' AND s.test_mode = 0)`,
    );
  }
  if (usable) where.push(`c.verification = 'checked' AND c.kind = 'generic'`);
  if (ready) where.push(`(${READY_WHERE})`);
  if (["high", "medium", "low"].includes(group)) {
    where.push(`o.group_confidence = ?`);
    binds.push(group);
  } else if (group === "needs_confirm") {
    where.push(`o.group_confidence = 'low' AND o.group_confirmed = 0`);
  } else if (group === "multi") {
    where.push(`o.activity_count > 1`);
  }

  const needsJoin = !!verification || !!emailStatus || usable;
  const from = `
    FROM outreach_orgs o
    LEFT JOIN outreach_contacts c ON c.id = (
      SELECT x.id FROM outreach_contacts x WHERE x.org_id = o.id
       ORDER BY x.is_primary DESC, (x.verification = 'checked') DESC, (x.kind = 'generic') DESC, x.created_at ASC LIMIT 1)
    LEFT JOIN outreach_messages m ON m.id = (
      SELECT y.id FROM outreach_messages y WHERE y.org_id = o.id ORDER BY y.created_at DESC LIMIT 1)
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}`;
  const order =
    sortReq === "name"
      ? "o.name COLLATE NOCASE ASC"
      : sortReq === "action"
        ? "last_action DESC"
        : "o.activity_count DESC, o.name COLLATE NOCASE ASC";

  const [rows, total] = await c.env.DB.batch([
    c.env.DB.prepare(
      `SELECT o.id, o.name, o.domain, o.website_url AS websiteUrl, o.activity_count AS activityCount,
              o.discovery_status AS discoveryStatus, o.discovery_note AS discoveryNote,
              o.excluded, o.excluded_reason AS excludedReason, o.review_flag AS reviewFlag,
              o.group_confidence AS groupConfidence, o.group_confirmed AS groupConfirmed,
              (SELECT COUNT(*) FROM outreach_org_activities l WHERE l.org_id = o.id AND l.included = 1) AS includedCount,
              c.id AS contactId, c.email, c.kind, c.verification, c.source_type AS sourceType,
              c.source_url AS sourceUrl,
              (SELECT COUNT(*) FROM outreach_contacts x WHERE x.org_id = o.id) AS contactCount,
              m.id AS messageId, m.status AS messageStatus, m.test_mode AS messageTest,
              (SELECT GROUP_CONCAT(t, ' | ') FROM (
                 SELECT a.title AS t FROM outreach_org_activities l JOIN activities a ON a.id = l.activity_id
                  WHERE l.org_id = o.id ORDER BY a.title LIMIT 3)) AS activities,
              MAX(o.updated_at, COALESCE(m.updated_at, 0), COALESCE(o.discovered_at, 0)) AS last_action
         ${from} ORDER BY ${order} LIMIT ? OFFSET ?`,
    ).bind(...binds, pageSize, offset),
    // The total only needs the contact/message joins when a filter touches them (D1 bills rows read).
    c.env.DB.prepare(
      needsJoin
        ? `SELECT COUNT(*) AS n ${from}`
        : `SELECT COUNT(*) AS n FROM outreach_orgs o ${where.length ? `WHERE ${where.join(" AND ")}` : ""}`,
    ).bind(...binds),
  ]);
  const totalN = (total!.results[0] as { n: number }).n;
  return c.json({
    rows: (rows!.results as Record<string, unknown>[]).map((r) => ({
      ...r,
      excluded: !!r.excluded,
      groupConfirmed: !!r.groupConfirmed,
      messageTest: !!r.messageTest,
      lastAction: r.last_action,
      last_action: undefined,
    })),
    total: totalN,
    page: pg,
    pageSize,
    pageCount: Math.ceil(totalN / pageSize) || 1,
  });
});

/** The best organisations that are ready to send, most valuable first (ids only; preview/send do the rest). */
app.get("/ready-orgs", async (c) => {
  const limit = Math.max(1, Math.min(100, Number(new URL(c.req.url).searchParams.get("limit")) || 25));
  const [rows, total] = await c.env.DB.batch([
    c.env.DB.prepare(
      `SELECT o.id FROM outreach_orgs o WHERE ${READY_WHERE}
        ORDER BY (o.group_confidence = 'high') DESC, o.activity_count DESC, o.name COLLATE NOCASE ASC LIMIT ?1`,
    ).bind(limit),
    c.env.DB.prepare(`SELECT COUNT(*) AS n FROM outreach_orgs o WHERE ${READY_WHERE}`),
  ]);
  return c.json({ orgIds: (rows!.results as { id: string }[]).map((r) => r.id), total: (total!.results[0] as { n: number }).n });
});

app.get("/orgs/:id", async (c) => {
  const id = c.req.param("id");
  const org = await c.env.DB.prepare(
    `SELECT id, name, domain, website_url AS websiteUrl, activity_count AS activityCount,
            discovery_status AS discoveryStatus, discovery_note AS discoveryNote,
            discovered_at AS discoveredAt, excluded, excluded_reason AS excludedReason,
            review_flag AS reviewFlag, group_confidence AS groupConfidence,
            group_source AS groupSource, group_note AS groupNote, group_confirmed AS groupConfirmed
       FROM outreach_orgs WHERE id = ?1`,
  )
    .bind(id)
    .first<Record<string, unknown>>();
  if (!org) throw notFound("Aanbieder niet gevonden.");
  const [acts, contacts, messages, events] = await c.env.DB.batch([
    c.env.DB.prepare(
      `SELECT a.id, a.title, a.city, a.website_url AS websiteUrl, a.web_status AS webStatus,
              l.confidence, l.source, l.included
         FROM outreach_org_activities l JOIN activities a ON a.id = l.activity_id
        WHERE l.org_id = ?1 ORDER BY a.title LIMIT 60`,
    ).bind(id),
    c.env.DB.prepare(
      `SELECT c.id, c.email, c.kind, c.verification, c.source_type AS sourceType, c.source_url AS sourceUrl,
              c.domain_matches AS domainMatches, c.mx_ok AS mxOk, c.is_primary AS isPrimary, c.note, c.role, c.activity_id AS activityId,
              c.found_at AS foundAt, c.checked_at AS checkedAt,
              EXISTS (SELECT 1 FROM outreach_suppressions s
                       WHERE (s.kind = 'email' AND s.value = c.email)
                          OR (s.kind = 'domain' AND c.email LIKE '%@' || s.value)) AS suppressed
         FROM outreach_contacts c WHERE c.org_id = ?1
        ORDER BY c.is_primary DESC, c.created_at ASC`,
    ).bind(id),
    c.env.DB.prepare(
      `SELECT id, contact_id AS contactId, to_email AS toEmail, subject, body_text AS bodyText, status,
              test_mode AS testMode, approved_by AS approvedBy, approved_at AS approvedAt,
              sent_at AS sentAt, provider_message_id AS providerMessageId, error,
              campaign_id AS campaignId, created_at AS createdAt, updated_at AS updatedAt
         FROM outreach_messages WHERE org_id = ?1 ORDER BY created_at DESC LIMIT 30`,
    ).bind(id),
    c.env.DB.prepare(
      `SELECT id, kind, body, message_id AS messageId, created_by AS createdBy, created_at AS createdAt
         FROM outreach_events WHERE org_id = ?1 ORDER BY created_at DESC LIMIT 50`,
    ).bind(id),
  ]);
  const cs = contacts!.results as { id: string; email: string; kind: string; verification: string; suppressed: number }[];
  const warnings: string[] = [];
  if (!cs.length) warnings.push("Geen e-mailadres bekend voor deze aanbieder.");
  if (cs.length && !cs.some((x) => x.kind === "generic" && x.verification === "checked")) {
    warnings.push("Geen algemeen, gecontroleerd zakelijk adres beschikbaar.");
  }
  if (cs.some((x) => x.kind === "personal")) warnings.push("Er staat een persoonlijk adres bij: dat kan niet worden gebruikt.");
  if (cs.some((x) => x.suppressed)) warnings.push("Een adres staat op de uitsluitingslijst.");
  if (org.reviewFlag === "many_names_one_domain") {
    warnings.push("Veel verschillende namen onder één domein: controleer of dit één organisatie is.");
  }
  if (org.groupConfidence === "low" && !org.groupConfirmed) {
    warnings.push("Onzeker of alle activiteiten bij één organisatie horen: bevestig de groepering voor je verstuurt.");
  }
  if (org.reviewFlag === "multiple_addresses") warnings.push("Meerdere adressen gevonden: kies bewust het juiste.");
  if (org.reviewFlag === "public_body") warnings.push("Lijkt een overheids-, erfgoed- of bibliotheeksite: waarschijnlijk geen commerciële aanbieder.");
  return c.json({
    org: { ...org, excluded: !!org.excluded, groupConfirmed: !!org.groupConfirmed },
    group: await describeGroup(c.env, id),
    activities: (acts!.results as Record<string, unknown>[]).map((a) => ({ ...a, included: !!a.included })),
    contacts: cs.map((x) => ({ ...x, suppressed: !!x.suppressed })),
    messages: messages!.results,
    events: events!.results,
    warnings,
  });
});

app.put("/orgs/:id/exclude", async (c) => {
  const id = c.req.param("id");
  const b = await parseBody(
    c,
    z.object({ excluded: z.boolean(), reason: z.string().trim().max(300).default("") }),
  );
  const res = await c.env.DB.prepare(
    `UPDATE outreach_orgs SET excluded = ?1, excluded_reason = ?2, updated_at = ?3 WHERE id = ?4`,
  )
    .bind(b.excluded ? 1 : 0, b.excluded ? b.reason || "handmatig uitgesloten" : null, nowSec(), id)
    .run();
  if (!res.meta.changes) throw notFound("Aanbieder niet gevonden.");
  let cancelled = 0;
  if (b.excluded) cancelled = await cancelPending(c.env, `org_id = ?2`, id);
  await logEvent(c.env, id, "excluded", b.excluded ? `Uitgesloten: ${b.reason}` : "Uitsluiting opgeheven", c.get("adminUserId"));
  await audit(c, {
    action: b.excluded ? "outreach.org_excluded" : "outreach.org_included",
    targetType: "outreach_org",
    targetId: id,
    meta: { cancelledMessages: cancelled },
  });
  return c.json({ ok: true, cancelled });
});

app.post("/orgs/:id/recheck", async (c) => {
  const id = c.req.param("id");
  const res = await c.env.DB.prepare(
    `UPDATE outreach_orgs SET discovery_status = 'pending', discovery_note = NULL, updated_at = ?1
      WHERE id = ?2 AND excluded = 0`,
  )
    .bind(nowSec(), id)
    .run();
  if (!res.meta.changes) throw notFound("Aanbieder niet gevonden of uitgesloten.");
  return c.json({ ok: true });
});

/* ---------------------------- grouping & activities ---------------------------- */

/** Messages already in a campaign queue must not change under the owner's feet. */
async function assertNoQueued(env: Env, orgId: string): Promise<void> {
  const q = await env.DB.prepare(
    `SELECT 1 AS x FROM outreach_messages WHERE org_id = ?1 AND status IN ('queued','sending') LIMIT 1`,
  )
    .bind(orgId)
    .first();
  if (q) throw conflict("Er staat een bericht in een campagne. Annuleer dat eerst.");
}

/** Choose which linked activities are named in the mail. Drafts of the organisation are rebuilt. */
app.put("/orgs/:id/activities", async (c) => {
  const orgId = c.req.param("id");
  const b = await parseBody(c, z.object({ included: z.record(z.string().max(40), z.boolean()) }));
  const ids = Object.keys(b.included);
  if (!ids.length) throw badRequest("Geen activiteiten opgegeven.");
  await assertNoQueued(c.env, orgId);
  const stmts = ids.map((aid) =>
    c.env.DB.prepare(`UPDATE outreach_org_activities SET included = ?1 WHERE org_id = ?2 AND activity_id = ?3`).bind(
      b.included[aid] ? 1 : 0,
      orgId,
      aid,
    ),
  );
  await c.env.DB.batch(stmts);
  const drafts = await refreshOrgDrafts(c.env, orgId);
  await logEvent(c.env, orgId, "contact_edited", `Activiteitenselectie aangepast (${ids.length})`, c.get("adminUserId"));
  await audit(c, { action: "outreach.activities_selected", targetType: "outreach_org", targetId: orgId, meta: { count: ids.length, ...drafts } });
  return c.json({ ok: true, ...drafts });
});

/** Link an activity to this organisation by hand (the activities table itself is never changed). */
app.post("/orgs/:id/activities/link", async (c) => {
  const orgId = c.req.param("id");
  const b = await parseBody(c, z.object({ activityId: z.string().trim().max(40) }));
  const [org, act] = await Promise.all([
    c.env.DB.prepare(`SELECT id FROM outreach_orgs WHERE id = ?1`).bind(orgId).first(),
    c.env.DB.prepare(`SELECT id FROM activities WHERE id = ?1`).bind(b.activityId).first(),
  ]);
  if (!org) throw notFound("Aanbieder niet gevonden.");
  if (!act) throw notFound("Activiteit niet gevonden.");
  await assertNoQueued(c.env, orgId);
  try {
    await c.env.DB.prepare(
      `INSERT INTO outreach_org_activities (org_id, activity_id, confidence, source, included) VALUES (?1,?2,'high','manual',1)`,
    )
      .bind(orgId, b.activityId)
      .run();
  } catch {
    throw conflict("Deze activiteit is al gekoppeld.");
  }
  await c.env.DB.prepare(
    `UPDATE outreach_orgs SET activity_count = (SELECT COUNT(*) FROM outreach_org_activities WHERE org_id = ?1), updated_at = ?2 WHERE id = ?1`,
  )
    .bind(orgId, nowSec())
    .run();
  const drafts = await refreshOrgDrafts(c.env, orgId);
  await logEvent(c.env, orgId, "contact_edited", `Activiteit handmatig gekoppeld (${b.activityId})`, c.get("adminUserId"));
  await audit(c, { action: "outreach.activity_linked", targetType: "outreach_org", targetId: orgId, meta: { activityId: b.activityId } });
  return c.json({ ok: true, ...drafts });
});

/** Remove a manual link (domain-derived links can only be un-ticked, not removed). */
app.delete("/orgs/:id/activities/:aid", async (c) => {
  const orgId = c.req.param("id");
  await assertNoQueued(c.env, orgId);
  const r = await c.env.DB.prepare(
    `DELETE FROM outreach_org_activities WHERE org_id = ?1 AND activity_id = ?2 AND source = 'manual'`,
  )
    .bind(orgId, c.req.param("aid"))
    .run();
  if (!r.meta.changes) throw conflict("Alleen een handmatig gekoppelde activiteit kan worden losgemaakt.");
  await c.env.DB.prepare(
    `UPDATE outreach_orgs SET activity_count = (SELECT COUNT(*) FROM outreach_org_activities WHERE org_id = ?1), updated_at = ?2 WHERE id = ?1`,
  )
    .bind(orgId, nowSec())
    .run();
  const drafts = await refreshOrgDrafts(c.env, orgId);
  await audit(c, { action: "outreach.activity_unlinked", targetType: "outreach_org", targetId: orgId });
  return c.json({ ok: true, ...drafts });
});

/** Confirm (or withdraw confirmation of) the grouping; "reassess" recomputes the automatic verdict. */
app.post("/orgs/:id/group", async (c) => {
  const orgId = c.req.param("id");
  const b = await parseBody(
    c,
    z.object({ action: z.enum(["confirm", "unconfirm", "reassess"]), note: z.string().trim().max(300).optional() }),
  );
  const org = await c.env.DB.prepare(`SELECT id, group_confirmed AS confirmed FROM outreach_orgs WHERE id = ?1`)
    .bind(orgId)
    .first<{ id: string; confirmed: number }>();
  if (!org) throw notFound("Aanbieder niet gevonden.");
  if (b.action === "confirm") {
    await c.env.DB.prepare(
      `UPDATE outreach_orgs SET group_confirmed = 1, group_source = 'manual', updated_at = ?1 WHERE id = ?2`,
    )
      .bind(nowSec(), orgId)
      .run();
  } else if (b.action === "unconfirm") {
    await assertNoQueued(c.env, orgId);
    await c.env.DB.prepare(`UPDATE outreach_orgs SET group_confirmed = 0, updated_at = ?1 WHERE id = ?2`)
      .bind(nowSec(), orgId)
      .run();
  } else {
    if (org.confirmed) throw conflict("Deze groepering is bevestigd. Trek de bevestiging eerst in.");
    await assertNoQueued(c.env, orgId);
    await assessOrgs(c.env, { orgId });
    await refreshOrgDrafts(c.env, orgId);
  }
  await logEvent(c.env, orgId, "contact_edited", `Groepering: ${b.action}${b.note ? ` — ${b.note}` : ""}`, c.get("adminUserId"));
  await audit(c, { action: `outreach.group_${b.action}`, targetType: "outreach_org", targetId: orgId });
  return c.json({ ok: true });
});

/** Find an activity to link by hand: title or id fragment. */
app.get("/activity-search", async (c) => {
  const q = (new URL(c.req.url).searchParams.get("q") || "").trim().slice(0, 80);
  if (q.length < 2) return c.json({ rows: [] });
  const rows = await c.env.DB.prepare(
    `SELECT a.id, a.title, a.city, a.provider,
            (SELECT o.name FROM outreach_org_activities l JOIN outreach_orgs o ON o.id = l.org_id
              WHERE l.activity_id = a.id LIMIT 1) AS orgName
       FROM activities a WHERE a.active = 1 AND (a.title LIKE ? ESCAPE '\\' OR a.id = ?) ORDER BY a.title LIMIT 15`,
  )
    .bind(like(q), q)
    .all();
  return c.json({ rows: rows.results });
});

/* --------------------------------- contacts -------------------------------- */

const kindEnum = z.enum(["generic", "personal", "unknown"]);
const verifEnum = z.enum(["unverified", "checked", "uncertain"]);

app.post("/orgs/:id/contacts", async (c) => {
  const orgId = c.req.param("id");
  const org = await c.env.DB.prepare(`SELECT id, domain FROM outreach_orgs WHERE id = ?1`)
    .bind(orgId)
    .first<{ id: string; domain: string }>();
  if (!org) throw notFound("Aanbieder niet gevonden.");
  const b = await parseBody(
    c,
    z.object({
      email: z.string().trim().max(254),
      kind: kindEnum.optional(),
      sourceUrl: z.string().trim().url().max(500),
      note: z.string().trim().max(500).optional(),
    }),
  );
  const email = normalizeEmail(b.email);
  if (!isValidEmail(email)) throw badRequest("Geen geldig e-mailadres.");
  if (!/^https?:\/\//i.test(b.sourceUrl)) throw badRequest("De bron moet een http(s)-adres zijn.");
  const id = newId();
  try {
    await c.env.DB.prepare(
      `INSERT INTO outreach_contacts
         (id, org_id, email, kind, source_type, source_url, domain_matches, verification, note, role, found_at, created_at)
       VALUES (?1,?2,?3,?4,'manual',?5,?6,'unverified',?7,?9,?8,?8)`,
    )
      .bind(
        id, orgId, email, b.kind ?? classifyEmail(email), b.sourceUrl,
        domainMatchesSite(email, org.domain) ? 1 : 0, b.note ?? null, nowSec(), classifyRole(email),
      )
      .run();
  } catch {
    throw conflict("Dit adres staat al bij deze aanbieder.");
  }
  await electPrimary(c.env, orgId);
  await logEvent(c.env, orgId, "contact_edited", `Adres handmatig toegevoegd: ${email}`, c.get("adminUserId"));
  await audit(c, { action: "outreach.contact_added", targetType: "outreach_org", targetId: orgId, meta: { contactId: id } });
  return c.json({ id }, 201);
});

app.put("/contacts/:id", async (c) => {
  const id = c.req.param("id");
  const b = await parseBody(
    c,
    z.object({
      email: z.string().trim().max(254).optional(),
      kind: kindEnum.optional(),
      verification: verifEnum.optional(),
      isPrimary: z.boolean().optional(),
      note: z.string().trim().max(500).nullable().optional(),
      role: z.enum(["general", "sales", "groups", "reservations", "other"]).optional(),
      /** Tie this address to ONE activity of the organisation (null = the whole organisation). */
      activityId: z.string().max(40).nullable().optional(),
    }),
  );
  const cur = await c.env.DB.prepare(
    `SELECT c.id, c.org_id AS orgId, c.email, o.domain
       FROM outreach_contacts c JOIN outreach_orgs o ON o.id = c.org_id WHERE c.id = ?1`,
  )
    .bind(id)
    .first<{ id: string; orgId: string; email: string; domain: string }>();
  if (!cur) throw notFound("Contact niet gevonden.");

  const sets: string[] = [];
  const vals: unknown[] = [];
  let resetMessages = false;
  if (b.email !== undefined && normalizeEmail(b.email) !== cur.email) {
    const e = normalizeEmail(b.email);
    if (!isValidEmail(e)) throw badRequest("Geen geldig e-mailadres.");
    sets.push("email = ?", "mx_ok = NULL", "verification = 'unverified'", "domain_matches = ?", "source_type = 'manual'");
    vals.push(e, domainMatchesSite(e, cur.domain) ? 1 : 0);
    if (b.kind === undefined) {
      sets.push("kind = ?");
      vals.push(classifyEmail(e));
    }
    resetMessages = true;
  }
  if (b.kind !== undefined) {
    sets.push("kind = ?");
    vals.push(b.kind);
    resetMessages = true;
  }
  if (b.verification !== undefined) {
    sets.push("verification = ?", "checked_at = ?");
    vals.push(b.verification, nowSec());
    resetMessages = true;
  }
  if (b.note !== undefined) {
    sets.push("note = ?");
    vals.push(b.note);
  }
  if (b.role !== undefined) {
    sets.push("role = ?");
    vals.push(b.role);
  }
  if (b.activityId !== undefined) {
    if (b.activityId) {
      const linked = await c.env.DB.prepare(
        `SELECT 1 AS x FROM outreach_org_activities WHERE org_id = ?1 AND activity_id = ?2`,
      )
        .bind(cur.orgId, b.activityId)
        .first();
      if (!linked) throw badRequest("Die activiteit hoort niet bij deze aanbieder.");
    }
    sets.push("activity_id = ?");
    vals.push(b.activityId);
    resetMessages = true;
  }
  if (sets.length) {
    try {
      await c.env.DB.prepare(`UPDATE outreach_contacts SET ${sets.join(", ")} WHERE id = ?`)
        .bind(...vals, id)
        .run();
    } catch {
      throw conflict("Dit adres staat al bij deze aanbieder.");
    }
  }
  if (b.isPrimary) {
    await c.env.DB.batch([
      c.env.DB.prepare(`UPDATE outreach_contacts SET is_primary = 0 WHERE org_id = ?1`).bind(cur.orgId),
      c.env.DB.prepare(`UPDATE outreach_contacts SET is_primary = 1 WHERE id = ?1`).bind(id),
    ]);
  }
  // Anything drafted or approved for this address was based on the old data.
  const cancelled = resetMessages ? await cancelPending(c.env, `contact_id = ?2`, id) : 0;
  await logEvent(c.env, cur.orgId, "contact_edited", `Contact aangepast (${Object.keys(b).join(", ")})`, c.get("adminUserId"));
  await audit(c, {
    action: "outreach.contact_edited",
    targetType: "outreach_contact",
    targetId: id,
    meta: { fields: Object.keys(b), cancelledMessages: cancelled },
  });
  return c.json({ ok: true, cancelled });
});

app.delete("/contacts/:id", async (c) => {
  const id = c.req.param("id");
  const cur = await c.env.DB.prepare(`SELECT org_id AS orgId, email FROM outreach_contacts WHERE id = ?1`)
    .bind(id)
    .first<{ orgId: string; email: string }>();
  if (!cur) throw notFound("Contact niet gevonden.");
  await cancelPending(c.env, `contact_id = ?2`, id);
  await c.env.DB.prepare(`DELETE FROM outreach_contacts WHERE id = ?1`).bind(id).run();
  await electPrimary(c.env, cur.orgId);
  await audit(c, { action: "outreach.contact_deleted", targetType: "outreach_org", targetId: cur.orgId });
  return c.json({ ok: true });
});

/* ------------------------------- suppressions ------------------------------ */

app.get("/suppressions", async (c) => {
  const url = new URL(c.req.url);
  const { page: pg, pageSize, offset } = page(url, 50);
  const q = (url.searchParams.get("q") || "").trim().slice(0, 100);
  const where = q ? `WHERE value LIKE ? ESCAPE '\\'` : "";
  const binds = q ? [like(q.toLowerCase())] : [];
  const [rows, total] = await c.env.DB.batch([
    c.env.DB.prepare(
      `SELECT id, kind, value, reason, note, created_by AS createdBy, created_at AS createdAt
         FROM outreach_suppressions ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    ).bind(...binds, pageSize, offset),
    c.env.DB.prepare(`SELECT COUNT(*) AS n FROM outreach_suppressions ${where}`).bind(...binds),
  ]);
  const n = (total!.results[0] as { n: number }).n;
  return c.json({ rows: rows!.results, total: n, page: pg, pageSize, pageCount: Math.ceil(n / pageSize) || 1 });
});

app.post("/suppressions", async (c) => {
  const b = await parseBody(
    c,
    z.object({
      kind: z.enum(["email", "domain"]),
      value: z.string().trim().min(3).max(254),
      reason: z.enum(["opt_out", "bounce", "complaint", "manual", "legal"]).default("manual"),
      note: z.string().trim().max(500).optional(),
    }),
  );
  const value = b.value.toLowerCase().replace(/^@/, "");
  if (b.kind === "email" && !isValidEmail(value)) throw badRequest("Geen geldig e-mailadres.");
  if (b.kind === "domain" && !hostOf(value)) throw badRequest("Geen geldig domein.");
  await c.env.DB.prepare(
    `INSERT OR IGNORE INTO outreach_suppressions (id, kind, value, reason, note, created_by, created_at)
     VALUES (?1,?2,?3,?4,?5,?6,?7)`,
  )
    .bind(newId(), b.kind, value, b.reason, b.note ?? null, c.get("adminUserId"), nowSec())
    .run();
  const cancelled =
    b.kind === "email"
      ? await cancelPending(c.env, `lower(to_email) = ?2`, value)
      : await cancelPending(c.env, `lower(to_email) LIKE ?2`, `%@${value}`);
  await audit(c, {
    action: "outreach.suppression_added",
    targetType: "outreach",
    meta: { kind: b.kind, reason: b.reason, cancelledMessages: cancelled },
  });
  return c.json({ ok: true, cancelled }, 201);
});

app.delete("/suppressions/:id", async (c) => {
  const id = c.req.param("id");
  const row = await c.env.DB.prepare(`SELECT reason FROM outreach_suppressions WHERE id = ?1`)
    .bind(id)
    .first<{ reason: string }>();
  if (!row) throw notFound("Niet gevonden.");
  if (row.reason === "opt_out" || row.reason === "complaint") {
    throw badRequest("Een afmelding of klacht kan niet worden verwijderd: bezwaren moeten gerespecteerd blijven.");
  }
  await c.env.DB.prepare(`DELETE FROM outreach_suppressions WHERE id = ?1`).bind(id).run();
  await audit(c, { action: "outreach.suppression_removed", targetType: "outreach", meta: { reason: row.reason } });
  return c.json({ ok: true });
});

/* ---------------------------------- events --------------------------------- */

app.post("/events", async (c) => {
  const b = await parseBody(
    c,
    z.object({
      orgId: z.string().min(1).max(40),
      kind: z.enum(["reply", "note", "bounce", "complaint", "opt_out"]),
      body: z.string().trim().max(2000).default(""),
      messageId: z.string().max(40).optional(),
    }),
  );
  const org = await c.env.DB.prepare(`SELECT id FROM outreach_orgs WHERE id = ?1`).bind(b.orgId).first();
  if (!org) throw notFound("Aanbieder niet gevonden.");
  await logEvent(c.env, b.orgId, b.kind, b.body, c.get("adminUserId"), b.messageId ?? null);

  let cancelled = 0;
  if (b.kind === "bounce" || b.kind === "complaint" || b.kind === "opt_out") {
    // The address that was written to (or every address of the org on an objection) goes on the list.
    const addrs = await c.env.DB.prepare(
      b.messageId
        ? `SELECT DISTINCT lower(to_email) AS e FROM outreach_messages WHERE id = ?1`
        : `SELECT DISTINCT lower(email) AS e FROM outreach_contacts WHERE org_id = ?1`,
    )
      .bind(b.messageId ?? b.orgId)
      .all<{ e: string }>();
    const reason = b.kind === "opt_out" ? "opt_out" : b.kind;
    for (const a of addrs.results) {
      await c.env.DB.prepare(
        `INSERT OR IGNORE INTO outreach_suppressions (id, kind, value, reason, note, created_by, created_at)
         VALUES (?1,'email',?2,?3,?4,?5,?6)`,
      )
        .bind(newId(), a.e, reason, b.body.slice(0, 300) || null, c.get("adminUserId"), nowSec())
        .run();
    }
    if (b.kind !== "bounce") {
      await c.env.DB.prepare(
        `UPDATE outreach_orgs SET excluded = 1, excluded_reason = ?1, updated_at = ?2 WHERE id = ?3`,
      )
        .bind(b.kind === "opt_out" ? "bezwaar / afmelding" : "klacht", nowSec(), b.orgId)
        .run();
    }
    cancelled = await cancelPending(c.env, `org_id = ?2`, b.orgId);
  }
  await audit(c, {
    action: `outreach.event_${b.kind}`,
    targetType: "outreach_org",
    targetId: b.orgId,
    meta: { cancelledMessages: cancelled },
  });
  return c.json({ ok: true, cancelled }, 201);
});

/* ------------------------------ export / import ---------------------------- */

app.get("/export.csv", async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT o.id, o.name, o.domain, o.website_url, o.activity_count, o.discovery_status,
            o.excluded, o.excluded_reason,
            c.email, c.kind, c.verification, c.source_type, c.source_url,
            m.status AS message_status, m.test_mode, m.sent_at
       FROM outreach_orgs o
       LEFT JOIN outreach_contacts c ON c.id = (
         SELECT x.id FROM outreach_contacts x WHERE x.org_id = o.id
          ORDER BY x.is_primary DESC, (x.verification = 'checked') DESC, x.created_at ASC LIMIT 1)
       LEFT JOIN outreach_messages m ON m.id = (
         SELECT y.id FROM outreach_messages y WHERE y.org_id = o.id ORDER BY y.created_at DESC LIMIT 1)
      ORDER BY o.activity_count DESC LIMIT 20000`,
  ).all<Record<string, string | number | null>>();
  const header = [
    "org_id", "naam", "domein", "website", "activiteiten", "ontdekking", "uitgesloten",
    "reden_uitsluiting", "email", "soort", "verificatie", "bron_type", "bron_url",
    "bericht_status", "test", "verzonden_op",
  ];
  const lines = [toCsvLine(header)];
  for (const r of rows.results) {
    lines.push(
      toCsvLine([
        r.id, r.name, r.domain, r.website_url, r.activity_count, r.discovery_status,
        r.excluded ? "ja" : "nee", r.excluded_reason, r.email, r.kind, r.verification,
        r.source_type, r.source_url, r.message_status, r.test_mode ? "ja" : "",
        r.sent_at ? new Date(Number(r.sent_at) * 1000).toISOString() : "",
      ]),
    );
  }
  await audit(c, { action: "outreach.exported", targetType: "outreach", meta: { rows: rows.results.length } });
  return new Response(CSV_BOM + lines.join("\r\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="vibin-outreach-${new Date().toISOString().slice(0, 10)}.csv"`,
      "cache-control": "no-store",
    },
  });
});

interface ImportRow {
  line: number;
  domain: string;
  email: string;
  sourceUrl: string;
  kind: string | undefined;
  note: string;
  result: "new" | "exists" | "invalid" | "unknown_org" | "duplicate" | "conflict";
  message: string;
  orgId?: string;
  orgDomain?: string;
}

async function analyseImport(env: Env, csv: string): Promise<{ rows: ImportRow[]; header: string[] }> {
  const table = parseCsv(csv).filter((r) => r.some((x) => x.trim() !== ""));
  if (table.length < 2) throw badRequest("Het bestand bevat geen gegevensrijen.");
  if (table.length > 5001) throw badRequest("Maximaal 5000 rijen per import.");
  const header = table[0]!.map((h) => h.trim().toLowerCase());
  const col = (...names: string[]) => header.findIndex((h) => names.includes(h));
  const iDomain = col("domain", "domein", "website", "url");
  const iEmail = col("email", "e-mail", "emailadres");
  const iSource = col("source_url", "bron_url", "bron", "source");
  const iKind = col("kind", "soort");
  const iNote = col("note", "notitie", "opmerking");
  if (iDomain < 0 || iEmail < 0 || iSource < 0) {
    throw badRequest("Verplichte kolommen: domain (of website), email en source_url.");
  }

  const orgs = await env.DB.prepare(`SELECT id, domain FROM outreach_orgs`).all<{ id: string; domain: string }>();
  const byDomain = new Map(orgs.results.map((o) => [o.domain, o.id]));
  const existing = await env.DB.prepare(`SELECT org_id AS orgId, email FROM outreach_contacts`).all<{
    orgId: string;
    email: string;
  }>();
  const existsSet = new Set(existing.results.map((x) => `${x.orgId}|${x.email}`));
  const emailOrg = new Map<string, string>();
  for (const x of existing.results) emailOrg.set(x.email, x.orgId);

  const seen = new Set<string>();
  const rows: ImportRow[] = [];
  for (let i = 1; i < table.length; i++) {
    const r = table[i]!;
    const rawDomain = (r[iDomain] ?? "").trim();
    const host = hostOf(rawDomain);
    const domain = host ?? rawDomain.toLowerCase();
    const email = normalizeEmail(r[iEmail] ?? "");
    const sourceUrl = (r[iSource] ?? "").trim();
    const kind = iKind >= 0 ? (r[iKind] ?? "").trim().toLowerCase() : "";
    const row: ImportRow = {
      line: i + 1, domain, email, sourceUrl,
      kind: ["generic", "personal", "unknown"].includes(kind) ? kind : undefined,
      note: iNote >= 0 ? (r[iNote] ?? "").trim().slice(0, 300) : "",
      result: "new", message: "",
    };
    const orgId = host ? byDomain.get(registrableDomain(host)) ?? byDomain.get(host) : undefined;
    if (!email || !isValidEmail(email)) {
      row.result = "invalid"; row.message = "ongeldig of ontbrekend e-mailadres";
    } else if (!/^https?:\/\/\S+$/i.test(sourceUrl)) {
      row.result = "invalid"; row.message = "bron-URL ontbreekt of is ongeldig";
    } else if (!host) {
      row.result = "invalid"; row.message = "domein ontbreekt of is ongeldig";
    } else if (!orgId) {
      row.result = "unknown_org"; row.message = "onbekende aanbieder (voer eerst 'Aanbieders bijwerken' uit)";
    } else {
      row.orgId = orgId;
      row.orgDomain = host;
      const key = `${orgId}|${email}`;
      if (seen.has(key)) {
        row.result = "duplicate"; row.message = "komt dubbel voor in het bestand";
      } else if (existsSet.has(key)) {
        row.result = "exists"; row.message = "bestaat al: wordt niet overschreven";
      } else if (emailOrg.get(email) && emailOrg.get(email) !== orgId) {
        row.result = "conflict"; row.message = "dit adres staat al bij een andere aanbieder: handmatig beoordelen";
      }
      seen.add(key);
    }
    rows.push(row);
  }
  return { rows, header };
}

app.post("/import/preview", async (c) => {
  const b = await parseBody(c, z.object({ csv: z.string().min(5).max(2_000_000) }));
  const { rows } = await analyseImport(c.env, b.csv);
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.result] = (counts[r.result] ?? 0) + 1;
  return c.json({
    counts,
    total: rows.length,
    willAdd: counts.new ?? 0,
    sample: rows.filter((r) => r.result !== "new").slice(0, 100),
    preview: rows.filter((r) => r.result === "new").slice(0, 20),
  });
});

app.post("/import/confirm", async (c) => {
  const b = await parseBody(c, z.object({ csv: z.string().min(5).max(2_000_000), expectedNew: z.number().int().min(0) }));
  const { rows } = await analyseImport(c.env, b.csv);
  const fresh = rows.filter((r) => r.result === "new" && r.orgId);
  if (fresh.length !== b.expectedNew) {
    throw conflict("De data is gewijzigd sinds de voorvertoning. Bekijk de voorvertoning opnieuw.", {
      now: fresh.length,
    });
  }
  const now = nowSec();
  for (let i = 0; i < fresh.length; i += 40) {
    await c.env.DB.batch(
      fresh.slice(i, i + 40).map((r) =>
        c.env.DB.prepare(
          `INSERT OR IGNORE INTO outreach_contacts
             (id, org_id, email, kind, source_type, source_url, domain_matches, verification, note, found_at, created_at)
           VALUES (?1,?2,?3,?4,'csv',?5,?6,'unverified',?7,?8,?8)`,
        ).bind(
          newId(), r.orgId!, r.email, r.kind ?? classifyEmail(r.email), r.sourceUrl,
          domainMatchesSite(r.email, r.orgDomain ?? "") ? 1 : 0, r.note || null, now,
        ),
      ),
    );
  }
  const orgIds = [...new Set(fresh.map((r) => r.orgId!))];
  for (const id of orgIds) await electPrimary(c.env, id);
  await audit(c, { action: "outreach.imported", targetType: "outreach", meta: { added: fresh.length } });
  return c.json({ added: fresh.length });
});

export default app;
