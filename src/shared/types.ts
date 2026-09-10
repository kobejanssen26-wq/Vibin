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
  description: string;
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
  /** activity info only — NOT a live-availability guarantee */
  availabilityNote: string;
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
  deckSize: number;
  /** cards still awaiting this user's vote, in order */
  queue: SwipeCardDTO[];
  /** most recent card this user voted on (for undo) */
  lastVoted: SwipeCardDTO | null;
  /** collective progress on the frontmost undecided card */
  currentProgress: { voted: number; total: number } | null;
  newMatch: MatchDTO | null;
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
