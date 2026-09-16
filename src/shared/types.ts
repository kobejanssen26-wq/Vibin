/**
 * API response DTOs — the contract between the Worker and the React client.
 * These are hand-written (not inferred from Drizzle) so the wire format stays
 * stable and never leaks internal columns (e.g. password_hash, other members'
 * individual votes).
 */
import type {
  BudgetBand,
  CategoryId,
  DateMode,
  GroupStatus,
  PriceBand,
  TimeBand,
} from "./constants";

export interface PublicUser {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  initials: string;
}

export interface Me extends PublicUser {
  email: string;
  emailVerified: boolean;
  role: "user" | "admin" | "owner";
  age: number | null;
  locationLabel: string | null;
  bio: string | null;
}

export interface GroupMemberDTO extends PublicUser {
  role: "creator" | "member";
  status: "active" | "inactive" | "removed" | "left";
  joinedAt: number;
  isYou: boolean;
}

export interface GroupSettingsDTO {
  categories: CategoryId[];
  allActivities: boolean;
  locationLabel: string | null;
  lat: number | null;
  lng: number | null;
  radiusKm: number;
  budgetBand: BudgetBand;
  dateMode: DateMode;
  dateSpecific: number | null;
  timeBand: TimeBand;
  timeSpecific: string | null;
  /** derived: does the group already know when? (skips date-matching phase) */
  dateKnown: boolean;
}

export interface GroupDTO {
  id: string;
  name: string;
  status: GroupStatus;
  createdAt: number;
  isCreator: boolean;
  memberCount: number;
  activeMemberCount: number;
  settings: GroupSettingsDTO | null;
  members: GroupMemberDTO[];
  inviteCode: string | null;
  inviteUrl: string | null;
}

export interface GroupSummaryDTO {
  id: string;
  name: string;
  status: GroupStatus;
  memberCount: number;
  activeMemberCount: number;
  dateKnown: boolean;
  /** progress on the current card, if swiping */
  progress: { voted: number; total: number } | null;
  matchCount: number;
  upcomingPlan: PlanDTO | null;
  lastActivityAt: number;
}

export type PriceType = "per_person" | "per_group" | "from_per_person" | "free" | "varies";
export type IndoorOutdoor = "indoor" | "outdoor" | "both" | null;
export type ActivityStatus = "verified" | "needs_review" | "outdated" | "inactive";

export interface ActivityDTO {
  id: string;
  title: string;
  /** short, card-length copy (~25-55 words) */
  description: string;
  /** longer copy for the expanded/match view — falls back to `description`
   *  when no separately-written full description exists */
  fullDescription: string;
  category: CategoryId;
  subcategory: string | null;
  categoryLabel: string;
  categoryIcon: string;
  // provider / source
  provider: string | null;
  providerWebsite: string | null;
  // location
  locationLabel: string;
  address: string | null;
  city: string | null;
  country: string;
  lat: number | null;
  lng: number | null;
  /** straight-line km from the group's chosen point, when one is set */
  distanceKm: number | null;
  // pricing
  priceCents: number | null;
  priceType: PriceType;
  priceBand: PriceBand;
  priceLabel: string;
  /** true when priceLabel is a category/estimate-level figure, not a
   *  venue-verified exact price — UI should show it as an approximation */
  priceIsEstimate: boolean;
  currency: string;
  // logistics
  durationMin: number | null;
  minParticipants: number | null;
  maxParticipants: number | null;
  minAge: number | null;
  indoorOutdoor: IndoorOutdoor;
  accessibility: string | null;
  openingHours: Record<string, string>;
  // links
  websiteUrl: string | null;
  bookingUrl: string | null;
  ticketUrl: string | null;
  // media
  imageUrl: string | null;
  images: string[];
  /** where imageUrl came from, e.g. "Wikimedia Commons" | "Unsplash" | "provider" */
  imageSource: string | null;
  /** author + licence credit for imageUrl — shown as a caption when required */
  imageAttribution: string | null;
  tags: string[];
  // provenance
  source: string;
  sourceUrl: string | null;
  lastVerifiedAt: number | null;
  status: ActivityStatus;
  /** what VIBIN can honestly say about outbound clicks — never implies a deal */
  monetizationType:
    | "none"
    | "outbound_tracking"
    | "affiliate"
    | "direct_partner"
    | "booking_partner";
  /** activity info only — NOT a live-availability guarantee */
  availabilityNote: string;
}

/* --------------------------------- events -------------------------------- */

export type EventKind =
  | "sports"
  | "music"
  | "culture"
  | "market"
  | "festival"
  | "seasonal"
  | "food"
  | "family"
  | "community"
  | "nightlife"
  | "other";

export type EventStatus =
  | "upcoming"
  | "live"
  | "completed"
  | "cancelled"
  | "postponed"
  | "sold_out"
  | "unknown";

export type EventPriceType = "free" | "paid" | "varies" | "unknown";
export type EventVerification = "verified" | "needs_review" | "unverified" | "archived";

export interface EventDTO {
  id: string;
  title: string;
  description: string;
  kind: EventKind;
  category: CategoryId | null;
  subcategory: string | null;
  // where
  venueName: string | null;
  address: string | null;
  city: string | null;
  lat: number | null;
  lng: number | null;
  distanceKm: number | null;
  // when
  startsAt: number;
  endsAt: number | null;
  allDay: boolean;
  timezone: string;
  /** human countdown, e.g. "Tonight 20:00", "In 3 days", "Live now" */
  whenLabel: string;
  status: EventStatus;
  // price (never invented — null means unknown)
  priceType: EventPriceType;
  priceMinCents: number | null;
  priceMaxCents: number | null;
  currency: string;
  priceLabel: string;
  // links & media
  url: string | null;
  ticketUrl: string | null;
  imageUrl: string | null;
  imageSource: string | null;
  imageAttribution: string | null;
  tags: string[];
  // provenance
  source: string;
  sourceUrl: string | null;
  verificationStatus: EventVerification;
  lastSyncedAt: number | null;
  /** events are third-party info — always shown with a freshness caveat */
  freshnessNote: string;
}

export type ActivityVoteValue = "like" | "nope" | "superlike";

export interface SwipeCardDTO {
  activity: ActivityDTO;
  /** this user's existing vote on this card, if any (for undo / re-entry) */
  yourVote: ActivityVoteValue | null;
  position: number;
  deckSize: number;
}

export interface SwipeStateDTO {
  groupId: string;
  status: GroupStatus;
  /** activities materialised into the shared pool so far (grows in batches) */
  deckSize: number;
  /** cards still awaiting this user's vote, in order */
  queue: SwipeCardDTO[];
  /** most recent card this user voted on (for undo) */
  lastVoted: SwipeCardDTO | null;
  /** collective progress on the frontmost undecided card */
  currentProgress: { voted: number; total: number } | null;
  newMatch: MatchDTO | null;
  /** more eligible activities exist — the client can pull another batch */
  hasMore: boolean;
  /** how many cards this user has already voted on (for a dynamic progress label) */
  swipedByYou: number;
  /** the filters this deck was built from — shown as chips, editable mid-swipe */
  filters: GroupSettingsDTO | null;
  /** whether this member may change the group's filters (creator only) */
  canChangeFilters: boolean;
  /** true only when the queue is empty AND the backend has nothing more */
  finished: boolean;
}

export interface MatchDTO {
  id: string;
  groupId: string;
  status: "activity_matched" | "complete" | "cancelled";
  activity: ActivityDTO;
  members: PublicUser[];
  startsAt: number | null;
  needsDateMatch: boolean;
  matchedAt: number;
}

export interface DateOptionDTO {
  id: string;
  startsAt: number;
  label: string;
  yourVote: "yes" | "no" | "maybe" | null;
  tally: { yes: number; no: number; maybe: number; notVoted: number };
  unanimous: boolean;
}

export interface DateMatchStateDTO {
  matchId: string;
  activity: ActivityDTO;
  status: "pending" | "no_consensus" | "matched";
  options: DateOptionDTO[];
  chosenOptionId: string | null;
  members: PublicUser[];
}

export interface PlanDTO {
  id: string;
  groupId: string;
  groupName: string;
  activity: ActivityDTO;
  startsAt: number | null;
  locationLabel: string;
  members: PublicUser[];
  calendar: {
    googleUrl: string;
    icsUrl: string;
  };
  createdAt: number;
}

export interface MessageDTO {
  id: string;
  kind: "text" | "system";
  body: string;
  meta: Record<string, unknown>;
  author: PublicUser | null;
  createdAt: number;
  isYou: boolean;
}

export interface NotificationDTO {
  id: string;
  kind: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  read: boolean;
  createdAt: number;
}

export interface ApiError {
  error: string;
  message: string;
  details?: unknown;
}
