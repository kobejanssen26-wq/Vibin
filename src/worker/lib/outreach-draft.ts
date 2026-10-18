/**
 * Outreach drafts: which contact and which activities a mail is about, and the
 * stored grouping verdict per organisation.
 *
 * Nothing here sends mail and nothing here ever changes the `activities`
 * table: grouping only touches the outreach_* tables.
 */
import type { Env } from "../env";
import { newId } from "./id";
import { loadConfig } from "./outreach-config";
import {
  assessGroup,
  classifyRole,
  composeMail,
  type GroupActivity,
  type GroupAssessment,
} from "./outreach-core";

const nowSec = () => Math.floor(Date.now() / 1000);

/** Statuses in which a message "claims" its activities (a draft or cancelled mail does not). */
const CLAIMING = `('approved','queued','sending','sent')`;

interface LinkRow {
  org_id: string;
  id: string;
  title: string;
  provider: string | null;
  city: string | null;
  confidence: string;
  source: string;
  included: number;
}

/** Linked, live activities of the given organisations (one query for the whole chunk). */
async function loadLinks(env: Env, orgIds: string[]): Promise<LinkRow[]> {
  if (!orgIds.length) return [];
  const ph = orgIds.map((_, i) => `?${i + 1}`).join(",");
  const res = await env.DB.prepare(
    `SELECT l.org_id, a.id, a.title, a.provider, a.city, l.confidence, l.source, l.included
       FROM outreach_org_activities l JOIN activities a ON a.id = l.activity_id
      WHERE l.org_id IN (${ph}) AND a.active = 1
      ORDER BY a.title`,
  )
    .bind(...orgIds)
    .all<LinkRow>();
  return res.results;
}

const asGroupActivity = (r: LinkRow): GroupActivity => ({ id: r.id, title: r.title, provider: r.provider, city: r.city });

/** Persist one verdict: org row first, then the per-activity links that came from the domain. */
async function saveAssessment(env: Env, orgId: string, a: GroupAssessment): Promise<void> {
  const note = a.reasons.map((r) => r.message).join(" ");
  const stmts: D1PreparedStatement[] = [
    env.DB.prepare(
      `UPDATE outreach_orgs SET group_confidence = ?1, group_source = ?2, group_note = ?3, updated_at = ?4 WHERE id = ?5`,
    ).bind(a.confidence, a.source, note.slice(0, 600), nowSec(), orgId),
    ...a.perActivity.map((p) =>
      env.DB.prepare(
        `UPDATE outreach_org_activities SET confidence = ?1, included = ?2
          WHERE org_id = ?3 AND activity_id = ?4 AND source = 'domain'`,
      ).bind(p.confidence, p.included ? 1 : 0, orgId, p.id),
    ),
  ];
  await env.DB.batch(stmts);
}

export interface OrgForAssess {
  id: string;
  domain: string;
  review_flag: string | null;
  group_confirmed: number;
}

/**
 * Judge organisations that have not been judged yet (or one explicitly, `force`).
 * A grouping the owner confirmed is never overwritten.
 */
export async function assessOrgs(
  env: Env,
  opts: { orgId?: string; limit?: number } = {},
): Promise<{ assessed: number; low: number; medium: number; high: number }> {
  const orgs = opts.orgId
    ? (
        await env.DB.prepare(
          `SELECT id, domain, review_flag, group_confirmed FROM outreach_orgs WHERE id = ?1 AND group_confirmed = 0`,
        )
          .bind(opts.orgId)
          .all<OrgForAssess>()
      ).results
    : (
        await env.DB.prepare(
          `SELECT id, domain, review_flag, group_confirmed FROM outreach_orgs
            WHERE group_confidence = 'unchecked' AND group_confirmed = 0 LIMIT ?1`,
        )
          .bind(opts.limit ?? 400)
          .all<OrgForAssess>()
      ).results;
  const out = { assessed: 0, low: 0, medium: 0, high: 0 };
  for (let i = 0; i < orgs.length; i += 50) {
    const chunk = orgs.slice(i, i + 50);
    const links = await loadLinks(env, chunk.map((o) => o.id));
    const byOrg = new Map<string, LinkRow[]>();
    for (const l of links) byOrg.set(l.org_id, [...(byOrg.get(l.org_id) ?? []), l]);
    for (const o of chunk) {
      const acts = (byOrg.get(o.id) ?? []).map(asGroupActivity);
      const a = assessGroup({ domain: o.domain, activities: acts, reviewFlag: o.review_flag });
      await saveAssessment(env, o.id, a);
      out.assessed++;
      out[a.confidence]++;
    }
  }
  return out;
}

/** Fill in the role of contacts that have none yet (cheap, from the local part only). */
export async function backfillContactRoles(env: Env): Promise<number> {
  const rows = await env.DB.prepare(`SELECT id, email FROM outreach_contacts WHERE role = 'unknown' LIMIT 1000`).all<{
    id: string;
    email: string;
  }>();
  if (!rows.results.length) return 0;
  const stmts = rows.results.map((r) =>
    env.DB.prepare(`UPDATE outreach_contacts SET role = ?1 WHERE id = ?2`).bind(classifyRole(r.email), r.id),
  );
  for (let i = 0; i < stmts.length; i += 100) await env.DB.batch(stmts.slice(i, i + 100));
  return rows.results.length;
}

/** The current verdict, recomputed (pure) so the owner sees *why*, plus the stored state. */
export async function describeGroup(env: Env, orgId: string) {
  const org = await env.DB.prepare(
    `SELECT id, domain, review_flag, group_confidence AS confidence, group_source AS source,
            group_note AS note, group_confirmed AS confirmed
       FROM outreach_orgs WHERE id = ?1`,
  )
    .bind(orgId)
    .first<{
      id: string;
      domain: string;
      review_flag: string | null;
      confidence: string;
      source: string | null;
      note: string | null;
      confirmed: number;
    }>();
  if (!org) return null;
  const links = (await loadLinks(env, [orgId])).map(asGroupActivity);
  const live = assessGroup({ domain: org.domain, activities: links, reviewFlag: org.review_flag });
  return {
    confidence: org.confidence,
    source: org.source,
    note: org.note,
    confirmed: !!org.confirmed,
    reasons: live.reasons,
  };
}

export interface Selection {
  ids: string[];
  titles: string[];
  /** Linked and included, but already named in another message to this organisation. */
  alreadyMentioned: { id: string; title: string }[];
  /** The organisation has linked activities at all. */
  hasLinks: boolean;
}

/**
 * Which activities this message may name: the included ones, only the contact's
 * own activity when the address is tied to one, and never one that another open
 * or sent message to this organisation already named.
 */
export async function selectActivities(
  env: Env,
  orgId: string,
  contact: { activity_id?: string | null },
  testMode: number,
  selfMessageId?: string,
): Promise<Selection> {
  const rows = (await loadLinks(env, [orgId])).filter((r) => r.included === 1 || (contact.activity_id && r.id === contact.activity_id));
  const all = await env.DB.prepare(`SELECT COUNT(*) AS n FROM outreach_org_activities WHERE org_id = ?1`)
    .bind(orgId)
    .first<{ n: number }>();
  const hasLinks = (all?.n ?? 0) > 0;
  const own = contact.activity_id ? rows.filter((r) => r.id === contact.activity_id) : rows;
  const mentioned = await env.DB.prepare(
    `SELECT DISTINCT x.activity_id AS id
       FROM outreach_message_activities x JOIN outreach_messages m ON m.id = x.message_id
      WHERE m.org_id = ?1 AND m.test_mode = ?2 AND m.id != ?3 AND m.status IN ${CLAIMING}`,
  )
    .bind(orgId, testMode, selfMessageId ?? "")
    .all<{ id: string }>();
  const taken = new Set(mentioned.results.map((m) => m.id));
  const free = own.filter((r) => !taken.has(r.id));
  return {
    ids: free.map((r) => r.id),
    titles: free.map((r) => r.title),
    alreadyMentioned: own.filter((r) => taken.has(r.id)).map((r) => ({ id: r.id, title: r.title })),
    hasLinks,
  };
}

/** Titles in `message_activities` that another claiming message to the same org also names. */
export async function mentionedElsewhere(
  env: Env,
  row: { id: string; org_id: string; test_mode: number },
): Promise<string[]> {
  const res = await env.DB.prepare(
    `SELECT DISTINCT me.title AS title
       FROM outreach_message_activities me
       JOIN outreach_message_activities other ON other.activity_id = me.activity_id AND other.message_id != me.message_id
       JOIN outreach_messages om ON om.id = other.message_id
      WHERE me.message_id = ?1 AND om.org_id = ?2 AND om.test_mode = ?3 AND om.status IN ${CLAIMING}`,
  )
    .bind(row.id, row.org_id, row.test_mode)
    .all<{ title: string }>();
  return res.results.map((r) => r.title);
}

/** Only a legacy message (written before activities were recorded) has no snapshot at all. */
export async function hasSnapshot(env: Env, messageId: string): Promise<boolean> {
  const r = await env.DB.prepare(`SELECT 1 AS x FROM outreach_message_activities WHERE message_id = ?1 LIMIT 1`)
    .bind(messageId)
    .first();
  return !!r;
}

/* --------------------------------- prepare -------------------------------- */

export type PrepareResult =
  | { ok: true; messageId: string; created: boolean }
  | { ok: false; code: string; message: string };

export async function prepareDraft(env: Env, orgId: string, contactId?: string): Promise<PrepareResult> {
  const config = await loadConfig(env);
  const org = await env.DB.prepare(
    `SELECT id, name, excluded, group_confidence FROM outreach_orgs WHERE id = ?1`,
  )
    .bind(orgId)
    .first<{ id: string; name: string; excluded: number; group_confidence: string }>();
  if (!org) return { ok: false, code: "org_missing", message: "Aanbieder niet gevonden." };
  if (org.excluded) return { ok: false, code: "org_excluded", message: "Aanbieder is uitgesloten." };
  if (org.group_confidence === "unchecked") await assessOrgs(env, { orgId });

  type C = { id: string; email: string; activity_id: string | null };
  const contact = contactId
    ? await env.DB.prepare(`SELECT id, email, activity_id FROM outreach_contacts WHERE id = ?1 AND org_id = ?2`)
        .bind(contactId, orgId)
        .first<C>()
    : await env.DB.prepare(
        `SELECT id, email, activity_id FROM outreach_contacts WHERE org_id = ?1
          ORDER BY is_primary DESC, (verification = 'checked') DESC, (kind = 'generic') DESC,
                   CASE role WHEN 'general' THEN 0 WHEN 'sales' THEN 1 WHEN 'groups' THEN 2
                             WHEN 'reservations' THEN 3 ELSE 4 END, created_at ASC
          LIMIT 1`,
      )
        .bind(orgId)
        .first<C>();
  if (!contact) return { ok: false, code: "no_contact", message: "Geen e-mailadres beschikbaar." };

  const testMode = config.mode === "live" ? 0 : 1;
  const now = nowSec();

  const existing = await env.DB.prepare(
    `SELECT id, status FROM outreach_messages
      WHERE contact_id = ?1 AND test_mode = ?2 AND status NOT IN ('cancelled','failed')
      LIMIT 1`,
  )
    .bind(contact.id, testMode)
    .first<{ id: string; status: string }>();
  // A test mail that was already "sent" (to the test inbox / dry-run) must never block a new test concept.
  const replaceSentTest = !!existing && existing.status === "sent" && testMode === 1;
  if (existing && !replaceSentTest) {
    if (existing.status === "sent") {
      return { ok: false, code: "already_sent", message: "Naar dit adres is al een bericht verzonden." };
    }
    if (existing.status === "queued" || existing.status === "sending") {
      return { ok: false, code: "in_queue", message: "Dit bericht staat al in een campagne." };
    }
  }

  const sel = await selectActivities(env, orgId, contact, testMode, existing && !replaceSentTest ? existing.id : undefined);
  if (sel.hasLinks && !sel.ids.length) {
    return {
      ok: false,
      code: "no_activities",
      message: sel.alreadyMentioned.length
        ? "Alle activiteiten zijn al genoemd in een ander bericht aan deze aanbieder."
        : "Er is geen activiteit geselecteerd om te vermelden.",
    };
  }

  const looksLikeDomain = /^[a-z0-9-]+(.[a-z0-9-]+)+$/.test(org.name.trim());
  const providerName = looksLikeDomain ? "" : org.name;
  const shownSite = config.websiteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const { subject, body } = composeMail(config, {
    provider: providerName,
    website: shownSite,
    contact: config.contactAddress,
    titles: sel.titles,
  });

  if (replaceSentTest && existing) {
    await env.DB.prepare(
      `UPDATE outreach_messages SET status = 'cancelled', error = 'Vervangen door een nieuw testconcept', updated_at = ?1 WHERE id = ?2`,
    )
      .bind(now, existing.id)
      .run();
  }

  const snapshot = (messageId: string) =>
    sel.ids.map((id, i) =>
      env.DB.prepare(`INSERT INTO outreach_message_activities (message_id, activity_id, title) VALUES (?1,?2,?3)`).bind(
        messageId,
        id,
        sel.titles[i]!,
      ),
    );

  if (existing && !replaceSentTest) {
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE outreach_messages
            SET subject = ?1, body_text = ?2, to_email = ?3, status = 'draft',
                approved_by = NULL, approved_at = NULL, approved_hash = NULL,
                error = NULL, updated_at = ?4
          WHERE id = ?5`,
      ).bind(subject, body, contact.email, now, existing.id),
      env.DB.prepare(`DELETE FROM outreach_message_activities WHERE message_id = ?1`).bind(existing.id),
      ...snapshot(existing.id),
    ]);
    return { ok: true, messageId: existing.id, created: false };
  }
  const id = newId();
  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO outreach_messages
           (id, org_id, contact_id, to_email, subject, body_text, status, test_mode, created_at, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,'draft',?7,?8,?8)`,
      ).bind(id, orgId, contact.id, contact.email, subject, body, testMode, now),
      ...snapshot(id),
    ]);
  } catch {
    return { ok: false, code: "duplicate", message: "Er bestaat al een bericht voor dit adres." };
  }
  return { ok: true, messageId: id, created: true };
}

/**
 * After the owner changes which activities are named, every unsent draft or
 * approved (not yet queued) message of the organisation is rebuilt and returns
 * to "draft": an approval never survives a different text.
 */
export async function refreshOrgDrafts(env: Env, orgId: string): Promise<{ refreshed: number; failed: number }> {
  const rows = await env.DB.prepare(
    `SELECT contact_id FROM outreach_messages
      WHERE org_id = ?1 AND status IN ('draft','approved') AND contact_id IS NOT NULL`,
  )
    .bind(orgId)
    .all<{ contact_id: string }>();
  let refreshed = 0;
  let failed = 0;
  for (const r of rows.results) {
    const res = await prepareDraft(env, orgId, r.contact_id);
    if (res.ok) refreshed++;
    else {
      failed++;
      // Nothing left to name: the draft must not stay approvable with stale text.
      await env.DB.prepare(
        `UPDATE outreach_messages SET status = 'cancelled', error = ?1, updated_at = ?2
          WHERE org_id = ?3 AND contact_id = ?4 AND status IN ('draft','approved')`,
      )
        .bind(res.message, nowSec(), orgId, r.contact_id)
        .run();
    }
  }
  return { refreshed, failed };
}

/* -------------------------------- preview data ------------------------------- */

export async function messageContext(env: Env, messageId: string, orgId: string) {
  const [acts, prior, group, src] = await Promise.all([
    env.DB.prepare(
      `SELECT x.activity_id AS id, x.title, a.website_url AS websiteUrl, a.city
         FROM outreach_message_activities x LEFT JOIN activities a ON a.id = x.activity_id
        WHERE x.message_id = ?1 ORDER BY x.title`,
    )
      .bind(messageId)
      .all(),
    env.DB.prepare(
      `SELECT id, to_email AS toEmail, status, test_mode AS testMode, sent_at AS sentAt, created_at AS createdAt
         FROM outreach_messages WHERE org_id = ?1 AND id != ?2 AND status != 'cancelled'
        ORDER BY created_at DESC LIMIT 10`,
    )
      .bind(orgId, messageId)
      .all(),
    describeGroup(env, orgId),
    env.DB.prepare(
      `SELECT c.source_url AS contactSource, c.role, o.website_url AS orgSite
         FROM outreach_messages m
         LEFT JOIN outreach_contacts c ON c.id = m.contact_id
         LEFT JOIN outreach_orgs o ON o.id = m.org_id WHERE m.id = ?1`,
    )
      .bind(messageId)
      .first<{ contactSource: string | null; role: string | null; orgSite: string | null }>(),
  ]);
  return {
    activities: acts.results,
    priorMessages: prior.results,
    group,
    sources: { contact: src?.contactSource ?? null, website: src?.orgSite ?? null, role: src?.role ?? null },
  };
}
