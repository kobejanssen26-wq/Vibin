/** Shapes returned by `/api/admin/cc/swipe/*` (see src/worker/routes/admin-swipe.ts). */

export type Decision = "keep" | "delete" | "later" | "none";

export interface SwipeContact {
  email: string;
  evidence: string;
  kind: string;
  scope: string;
  linkStatus: string;
}

export interface SwipeCardData {
  id: string;
  title: string;
  description: string;
  categoryId: string;
  category: string;
  subcategory: string | null;
  provider: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  locationLabel: string;
  lat: number | null;
  lng: number | null;
  websiteUrl: string | null;
  imageUrl: string | null;
  imageIsGeneric: boolean;
  status: string;
  active: boolean;
  webStatus: string | null;
  source: string;
  updatedAt: number;
  decision: Decision | null;
  /** 0 = the owner has not decided yet. Sent back with every change (optimistic lock). */
  version: number;
  reresearch: boolean;
  decidedAt: number | null;
  deleted: boolean;
  contacts: SwipeContact[];
  organisation: { id: string; name: string; domain: string; activityCount: number; excluded: number } | null;
  audit: { outcome: string; rule: string; reason: string; hidden: boolean; source: string } | null;
  research: {
    verdict: string;
    existence: string;
    suitability: string;
    method: string;
    note: string;
    researchedAt: number;
    pendingCorrections: number;
  } | null;
  // details only
  priceCents?: number | null;
  priceType?: string;
  priceBand?: string;
  bookingUrl?: string | null;
  openingHours?: Record<string, string>;
  needsReviewFields?: string[];
  corrections?: { field: string; from: string; to: string; sourceUrl?: string; confidence?: string }[];
  evidence?: { field: string; found: string; verified: string; status: string; sourceUrl?: string; note?: string }[];
  sources?: { url: string; kind: string; checkedAt?: string }[];
  decisionNote?: string | null;
}

export interface SwipeSummary {
  total: number;
  unreviewed: number;
  unreviewedActive: number;
  keep: number;
  deleted: number;
  later: number;
  activeTotal: number;
  researched: number;
  unresearched: number;
  manual: number;
  reresearch: number;
  /** emptied from the trash: gone for good */
  purged: number;
  categories: { id: string; label: string }[];
}

/** What emptying the trash would take along (read-only preview). */
export interface TrashPreview {
  total: number;
  inUse: number;
  deletable: number;
  impact: { votes: number; deckSlots: number; matches: number; plans: number };
  sample: { id: string; title: string; city: string | null; inUse: boolean }[];
  phrase: string;
}

export interface SwipeFilters {
  review: "unreviewed" | "keep" | "delete" | "later" | "all";
  research: "any" | "researched" | "unresearched" | "manual";
  visibility: "active" | "hidden" | "all";
  category: string;
  city: string;
  org: string;
  orgLabel: string;
  email: string;
  q: string;
}

export const DEFAULT_FILTERS: SwipeFilters = {
  review: "unreviewed",
  research: "any",
  visibility: "active",
  category: "",
  city: "",
  org: "",
  orgLabel: "",
  email: "",
  q: "",
};

export function filtersToQuery(f: SwipeFilters, after?: string | null): string {
  const p = new URLSearchParams();
  p.set("review", f.review);
  p.set("research", f.research);
  p.set("visibility", f.visibility);
  if (f.category) p.set("category", f.category);
  if (f.city) p.set("city", f.city);
  if (f.org) p.set("org", f.org);
  if (f.email.trim()) p.set("email", f.email.trim());
  if (f.q.trim()) p.set("q", f.q.trim());
  if (after) p.set("after", after);
  p.set("limit", "20");
  return p.toString();
}

/** One owner action as the screen tracks it, until the server has confirmed it. */
export interface LedgerEntry {
  key: number;
  activityId: string;
  title: string;
  decision: Exclude<Decision, "none">;
  /** saving = request in flight · saved = confirmed by the server · failed = NOT saved · conflict = changed elsewhere */
  status: "saving" | "saved" | "failed" | "conflict";
  error?: string;
  /** the version the server confirmed (needed for undo) */
  version?: number;
  /** the card as it was when decided, so a failed save can be retried */
  card: SwipeCardData;
  undone?: boolean;
}
