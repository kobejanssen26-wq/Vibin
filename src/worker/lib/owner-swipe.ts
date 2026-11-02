/**
 * Owner Swipe Manager — the rules, kept free of I/O so they can be unit-tested.
 *
 * The owner's verdict on an activity has priority over every automatic process
 * (imports, audits, AI research). These helpers decide what a verdict changes; the
 * route (`routes/admin-swipe.ts`) applies it atomically with an optimistic version check.
 */
import { AppError } from "./errors";

export type Decision = "keep" | "delete" | "later" | "none";
export const DECISIONS: readonly Decision[] = ["keep", "delete", "later", "none"];

/** Statuses an activity may be restored to; anything else (inactive/outdated) becomes needs_review. */
const RESTORABLE = new Set(["verified", "needs_review"]);

/** What we know about one activity right before a decision. */
export interface CurrentState {
  active: number;
  status: string;
  decision: Decision | null;
  version: number;
  /** The visible state a deleted activity returns to (from the decision row). */
  prevActive: number | null;
  prevStatus: string | null;
  /** activity_audits row, if any. */
  auditHidden: number | null;
  auditPrevActive: number | null;
  auditPrevStatus: string | null;
}

export interface Plan {
  /** Nothing to change (the activity already has this verdict). */
  noop: boolean;
  /** New value of activities.active/status, or null when the activity is left alone. */
  activity: { active: number; status: string } | null;
  /** exclude = hide via audit row; restore = make visible via audit row; null = leave the audit alone. */
  audit: "exclude" | "restore" | null;
  /** Restore target to store in the decision row (null = clear). */
  prevActive: number | null;
  prevStatus: string | null;
}

/** The visible state to return to, given an activity that is currently hidden (or about to be). */
export function visibleStateOf(cur: CurrentState): { active: number; status: string } {
  let status: string;
  if (cur.decision === "delete") status = cur.prevStatus ?? "needs_review";
  else if (cur.auditHidden === 1) status = cur.auditPrevStatus ?? "needs_review";
  else status = cur.status;
  return { active: 1, status: RESTORABLE.has(status) ? status : "needs_review" };
}

export function isHidden(cur: Pick<CurrentState, "active" | "status">): boolean {
  return cur.active === 0 || cur.status === "inactive";
}

/**
 * What a verdict does. `keep` makes a hidden/deleted activity visible again (the owner overrules
 * the audit) but never changes verification: a kept activity is NOT automatically "verified".
 */
export function planDecision(cur: CurrentState, target: Exclude<Decision, "none">): Plan {
  if (cur.decision === target) {
    return { noop: true, activity: null, audit: null, prevActive: cur.prevActive, prevStatus: cur.prevStatus };
  }

  if (target === "later") {
    if (cur.decision === "delete") {
      throw new AppError(409, "deleted", "Deze activiteit is verwijderd. Herstel hem eerst als je hem opnieuw wilt beoordelen.");
    }
    // postponing never changes the activity
    return { noop: false, activity: null, audit: null, prevActive: cur.prevActive, prevStatus: cur.prevStatus };
  }

  if (target === "keep") {
    const wasDeleted = cur.decision === "delete";
    if (isHidden(cur) || wasDeleted) {
      const v = visibleStateOf(cur);
      return {
        noop: false,
        activity: v,
        audit: wasDeleted || cur.auditHidden === 1 ? "restore" : null,
        prevActive: null,
        prevStatus: null,
      };
    }
    return { noop: false, activity: null, audit: null, prevActive: null, prevStatus: null };
  }

  // delete: remember the visible state first (what "restore" returns to), then hide
  const visible = isHidden(cur) || cur.auditHidden === 1 ? visibleStateOf(cur) : { active: cur.active, status: cur.status };
  return {
    noop: false,
    activity: { active: 0, status: "inactive" },
    audit: "exclude",
    prevActive: visible.active,
    prevStatus: visible.status,
  };
}

/* -------------------------------------------------------------------------- */
/*  Keys that let imports recognise a deleted venue under a new id            */
/* -------------------------------------------------------------------------- */

const norm = (s: string | null | undefined) =>
  (s ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** "title|city", accent- and punctuation-insensitive. null when the title is too short to be a safe key. */
export function titleKey(title: string | null | undefined, city: string | null | undefined): string | null {
  const t = norm(title);
  if (t.length < 3) return null;
  return `${t}|${norm(city)}`;
}

/** Normalised website: host (without www) plus path, no query, no trailing slash. */
export function urlKey(url: string | null | undefined): string | null {
  const raw = (url ?? "").trim();
  if (!raw) return null;
  try {
    const u = new URL(/^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    const path = u.pathname.replace(/\/+$/, "").toLowerCase();
    if (!host.includes(".")) return null;
    return `${host}${path}`;
  } catch {
    return null;
  }
}

/**
 * A website key is only a reliable identity when it points at the venue's own site. A social
 * network or aggregator page identifies the platform, not the venue, so it is never used.
 */
const SHARED_HOSTS = /(^|\.)(facebook|instagram|twitter|x|linkedin|youtube|tiktok|google|goo|tripadvisor|booking|airbnb|eventbrite|wikipedia|linktr\.ee|visitflanders|visitwallonia|visit)\./i;
export function reliableUrlKey(url: string | null | undefined): string | null {
  const k = urlKey(url);
  if (!k) return null;
  const host = k.split("/")[0]!;
  return SHARED_HOSTS.test(`${host}.`) ? null : k;
}

/* -------------------------------------------------------------------------- */
/*  Filters                                                                   */
/* -------------------------------------------------------------------------- */

export const REVIEW_FILTERS = ["unreviewed", "keep", "delete", "later", "all"] as const;
export const RESEARCH_FILTERS = ["any", "researched", "unresearched", "manual"] as const;
export const VISIBILITY_FILTERS = ["active", "hidden", "all"] as const;
export type ReviewFilter = (typeof REVIEW_FILTERS)[number];
export type ResearchFilter = (typeof RESEARCH_FILTERS)[number];
export type VisibilityFilter = (typeof VISIBILITY_FILTERS)[number];

export interface QueueFilters {
  review: ReviewFilter;
  research: ResearchFilter;
  visibility: VisibilityFilter;
  category?: string;
  city?: string;
  org?: string;
  email?: string;
  q?: string;
}

/**
 * The WHERE for the queue/summary. `a` = activities, `d` = owner_activity_decisions (LEFT JOINed),
 * `u` = activity_audits (LEFT JOINed), `r` = activity_research (LEFT JOINed).
 * Every value is a bound parameter; the returned SQL contains only fixed text.
 */
export function buildQueueWhere(f: QueueFilters): { sql: string; binds: unknown[] } {
  const w: string[] = [];
  const binds: unknown[] = [];

  switch (f.review) {
    case "unreviewed":
      w.push("(d.decision IS NULL OR d.decision = 'none')");
      break;
    case "keep":
    case "delete":
    case "later":
      w.push("d.decision = ?");
      binds.push(f.review);
      break;
    default:
      break;
  }

  // Visibility only matters for activities the owner has not deleted (deleted ones are always inactive).
  if (f.review !== "delete") {
    if (f.visibility === "active") w.push("a.active = 1");
    else if (f.visibility === "hidden") w.push("(a.active = 0 OR a.status = 'inactive')");
  }

  if (f.research === "researched") w.push("r.activity_id IS NOT NULL");
  else if (f.research === "unresearched") w.push("r.activity_id IS NULL");
  else if (f.research === "manual") w.push("(u.outcome = 'manual' OR r.verdict = 'manual')");

  if (f.category) {
    w.push("a.category_id = ?");
    binds.push(f.category);
  }
  if (f.city) {
    w.push("a.city = ? COLLATE NOCASE");
    binds.push(f.city);
  }
  if (f.org) {
    w.push("EXISTS (SELECT 1 FROM outreach_org_activities oa WHERE oa.activity_id = a.id AND oa.org_id = ?)");
    binds.push(f.org);
  }
  if (f.email) {
    w.push(
      `EXISTS (SELECT 1 FROM activity_contact_links l JOIN outreach_contacts c ON c.id = l.contact_id
                WHERE l.activity_id = a.id AND c.email LIKE ? ESCAPE '\\')`,
    );
    binds.push(`%${likeEscape(f.email.toLowerCase())}%`);
  }
  if (f.q) {
    w.push("(a.title LIKE ? ESCAPE '\\' OR a.provider LIKE ? ESCAPE '\\' OR a.id = ?)");
    const pat = `%${likeEscape(f.q)}%`;
    binds.push(pat, pat, f.q);
  }
  return { sql: w.length ? `WHERE ${w.join(" AND ")}` : "", binds };
}

export function likeEscape(s: string): string {
  return s.replace(/[\\%_]/g, (m) => `\\${m}`);
}
