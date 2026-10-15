/**
 * Contact discovery for outreach. Reads ONLY the provider's own public website
 * (homepage + at most two contact-like pages), honours robots.txt, identifies
 * itself, and keeps request volume small. An address is stored with the page it
 * came from; nothing is guessed, composed from a name, or taken from a third
 * party.
 */
import type { Env } from "../env";
import { newId } from "./id";
import {
  classifyEmail,
  domainMatchesSite,
  extractEmails,
  findContactLinks,
  hostOf,
  normalizeWebsite,
  primaryRank,
  registrableDomain,
  robotsAllows,
  type EmailKind,
} from "./outreach-core";

const MAX_BYTES = 300_000;
const TIMEOUT_MS = 7_000;
const MAX_PAGES = 3;

export interface DiscoveredContact {
  email: string;
  kind: EmailKind;
  via: "mailto" | "text";
  sourceUrl: string;
  domainMatches: boolean;
}

export interface DiscoveryResult {
  status: "found" | "none" | "error" | "skipped";
  note: string;
  contacts: DiscoveredContact[];
  reviewFlag: string | null;
}

async function readLimited(res: Response): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let out = "";
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    bytes += value.byteLength;
    out += dec.decode(value, { stream: true });
    if (bytes >= MAX_BYTES) {
      await reader.cancel();
      break;
    }
  }
  return out;
}

async function get(
  fetchImpl: typeof fetch,
  url: string,
  ua: string,
  timeoutMs = TIMEOUT_MS,
): Promise<{ res: Response; text: string } | null> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      signal: ctl.signal,
      redirect: "follow",
      headers: {
        "user-agent": ua,
        accept: "text/html,text/plain;q=0.8",
        "accept-language": "nl-BE,nl;q=0.9,en;q=0.5",
      },
    });
    const ct = res.headers.get("content-type") ?? "";
    if (!res.ok || !/text\/(html|plain)|application\/xhtml/i.test(ct || "text/html")) {
      await res.body?.cancel();
      return { res, text: "" };
    }
    return { res, text: await readLimited(res) };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function discoverSite(
  websiteUrl: string,
  appUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<DiscoveryResult> {
  const site = normalizeWebsite(websiteUrl);
  const siteHost = site ? hostOf(site) : null;
  if (!site || !siteHost) {
    return { status: "skipped", note: "ongeldige of niet-publieke website-URL", contacts: [], reviewFlag: null };
  }
  const siteReg = registrableDomain(siteHost);
  const ua = `VIBINContactBot/1.0 (+${appUrl})`;
  const origin = new URL(site).origin;

  // robots.txt first: a disallow for the pages we want ends the check.
  let robots = "";
  const rb = await get(fetchImpl, `${origin}/robots.txt`, ua, 4_000);
  if (rb?.res.ok) robots = rb.text;
  const allowed = (u: string) => {
    try {
      const p = new URL(u);
      return robotsAllows(robots, p.pathname + p.search);
    } catch {
      return false;
    }
  };
  if (!allowed(site)) {
    return { status: "skipped", note: "robots.txt verbiedt toegang", contacts: [], reviewFlag: null };
  }

  const found = new Map<string, DiscoveredContact>();
  const visited = new Set<string>();
  let reachable = false;
  let redirectedAway = false;

  const visit = async (url: string): Promise<string> => {
    if (visited.has(url) || visited.size >= MAX_PAGES) return "";
    visited.add(url);
    const got = await get(fetchImpl, url, ua);
    if (!got) return "";
    const finalHost = hostOf(got.res.url || url);
    if (!finalHost || registrableDomain(finalHost) !== siteReg) {
      redirectedAway = true; // do not harvest addresses from another party's site
      return "";
    }
    if (!got.res.ok) return "";
    reachable = true;
    for (const f of extractEmails(got.text)) {
      if (found.has(f.email)) continue;
      found.set(f.email, {
        email: f.email,
        kind: classifyEmail(f.email),
        via: f.via,
        sourceUrl: got.res.url || url,
        domainMatches: domainMatchesSite(f.email, siteHost),
      });
    }
    return got.text;
  };

  const home = await visit(site);
  const links = home ? findContactLinks(home, site, 2) : [];
  const candidates = [...links];
  if (!candidates.length) candidates.push(`${origin}/contact`);
  for (const l of candidates) {
    if (visited.size >= MAX_PAGES) break;
    if (!allowed(l)) continue;
    await visit(l);
  }

  if (redirectedAway && !reachable) {
    return { status: "skipped", note: "website verwijst door naar een ander domein", contacts: [], reviewFlag: null };
  }
  if (!reachable) {
    return { status: "error", note: "website niet bereikbaar", contacts: [], reviewFlag: null };
  }
  const contacts = [...found.values()].sort(
    (a, b) =>
      Number(b.domainMatches) - Number(a.domainMatches) ||
      Number(b.kind === "generic") - Number(a.kind === "generic") ||
      primaryRank(a.email) - primaryRank(b.email),
  );
  return {
    status: contacts.length ? "found" : "none",
    note: contacts.length ? `${contacts.length} adres(sen) gevonden` : "geen e-mailadres op de website gevonden",
    contacts,
    reviewFlag: contacts.length > 1 ? "multiple_addresses" : null,
  };
}

/** Persist one result. Existing contacts (and anything edited by hand) are left untouched. */
export async function applyDiscovery(
  env: Env,
  orgId: string,
  r: DiscoveryResult,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const stmts: D1PreparedStatement[] = [];
  for (const c of r.contacts) {
    const verification = c.kind === "generic" && c.domainMatches ? "checked" : "uncertain";
    stmts.push(
      env.DB.prepare(
        `INSERT OR IGNORE INTO outreach_contacts
           (id, org_id, email, kind, source_type, source_url, domain_matches,
            verification, is_primary, found_at, checked_at, created_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,0,?9,?9,?9)`,
      ).bind(
        newId(), orgId, c.email, c.kind,
        c.via === "mailto" ? "website_mailto" : "website_text",
        c.sourceUrl, c.domainMatches ? 1 : 0, verification, now,
      ),
    );
  }
  stmts.push(
    env.DB.prepare(
      `UPDATE outreach_orgs
          SET discovery_status = ?1, discovery_note = ?2, discovered_at = ?3,
              review_flag = COALESCE(review_flag, ?4), updated_at = ?3
        WHERE id = ?5`,
    ).bind(r.status, r.note, now, r.reviewFlag, orgId),
  );
  await env.DB.batch(stmts);
  if (r.contacts.length) await electPrimary(env, orgId);
}

/**
 * Exactly one primary contact per org: a manually chosen one wins; otherwise the
 * best checked generic address on the org's own domain.
 */
export async function electPrimary(env: Env, orgId: string): Promise<void> {
  const rows = await env.DB.prepare(
    `SELECT id, email, kind, verification, source_type AS sourceType, is_primary AS isPrimary,
            domain_matches AS domainMatches
       FROM outreach_contacts WHERE org_id = ?1`,
  )
    .bind(orgId)
    .all<{
      id: string; email: string; kind: string; verification: string;
      sourceType: string; isPrimary: number; domainMatches: number;
    }>();
  const list = rows.results;
  if (!list.length) return;
  if (list.some((c) => c.sourceType === "manual" && c.isPrimary)) return;
  const score = (c: (typeof list)[number]) =>
    (c.verification === "checked" ? 100 : 0) +
    (c.kind === "generic" ? 50 : c.kind === "unknown" ? 10 : 0) +
    (c.domainMatches ? 20 : 0) -
    primaryRank(c.email);
  const best = [...list].sort((a, b) => score(b) - score(a))[0]!;
  if (list.filter((c) => c.isPrimary).length === 1 && best.isPrimary) return;
  await env.DB.batch([
    env.DB.prepare(`UPDATE outreach_contacts SET is_primary = 0 WHERE org_id = ?1`).bind(orgId),
    env.DB.prepare(`UPDATE outreach_contacts SET is_primary = 1 WHERE id = ?1`).bind(best.id),
  ]);
}

/** Check the next `limit` pending organisations. Sequential on purpose: gentle on sites. */
export async function runDiscoveryBatch(
  env: Env,
  limit: number,
  fetchImpl: typeof fetch = fetch,
): Promise<{ checked: number; found: number }> {
  const rows = await env.DB.prepare(
    `SELECT id, website_url AS websiteUrl FROM outreach_orgs
      WHERE (discovery_status = 'pending'
             OR (discovery_status = 'error' AND discovered_at < unixepoch() - 259200))
        AND excluded = 0
      ORDER BY (review_flag IS NOT NULL) ASC, activity_count DESC, created_at ASC
      LIMIT ?1`,
  )
    .bind(Math.max(1, Math.min(25, limit)))
    .all<{ id: string; websiteUrl: string }>();
  let found = 0;
  for (const o of rows.results) {
    let result: DiscoveryResult;
    try {
      result = await discoverSite(o.websiteUrl, env.APP_URL, fetchImpl);
    } catch (e) {
      result = {
        status: "error",
        note: `fout: ${e instanceof Error ? e.message.slice(0, 100) : "onbekend"}`,
        contacts: [],
        reviewFlag: null,
      };
    }
    await applyDiscovery(env, o.id, result);
    if (result.status === "found") found++;
  }
  return { checked: rows.results.length, found };
}
