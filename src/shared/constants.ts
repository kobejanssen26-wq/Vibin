/** Values shared by the Worker API and the React client. Keep framework-free. */

export const ACTIVITY_CATEGORIES = [
  { id: "sport", label: "Sport", icon: "🏅" },
  { id: "adventure", label: "Adventure", icon: "🧗" },
  { id: "food_drinks", label: "Food & Drinks", icon: "🍽️" },
  { id: "nightlife", label: "Nightlife", icon: "🌃" },
  { id: "creative", label: "Creative", icon: "🎨" },
  { id: "relaxation", label: "Relaxation", icon: "🧖" },
  { id: "culture", label: "Culture", icon: "🏛️" },
  { id: "nature", label: "Nature", icon: "🌲" },
  { id: "gaming", label: "Gaming", icon: "🎮" },
  { id: "entertainment", label: "Entertainment", icon: "🎬" },
  { id: "learning", label: "Learning", icon: "📚" },
  { id: "other", label: "Other", icon: "✨" },
] as const;

export type CategoryId = (typeof ACTIVITY_CATEGORIES)[number]["id"];

export const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  ACTIVITY_CATEGORIES.map((c) => [c.id, c.label]),
);
export const CATEGORY_ICON: Record<string, string> = Object.fromEntries(
  ACTIVITY_CATEGORIES.map((c) => [c.id, c.icon]),
);

export const BUDGET_BANDS = [
  { id: "any", label: "Any budget" },
  { id: "free", label: "Free" },
  { id: "0_10", label: "€0–10" },
  { id: "10_25", label: "€10–25" },
  { id: "25_50", label: "€25–50" },
  { id: "50_100", label: "€50–100" },
  { id: "100_plus", label: "€100+" },
] as const;

export type BudgetBand = (typeof BUDGET_BANDS)[number]["id"];

/** Price bands attached to an activity (no "any"). */
export type PriceBand = Exclude<BudgetBand, "any">;

export const RADIUS_OPTIONS_KM = [1, 2, 5, 10, 15, 25, 50, 100] as const;

export const DATE_MODES = [
  { id: "tonight", label: "Tonight", known: true },
  { id: "tomorrow", label: "Tomorrow", known: true },
  { id: "this_weekend", label: "This weekend", known: true },
  { id: "this_week", label: "This week", known: true },
  { id: "this_month", label: "This month", known: true },
  { id: "vacation", label: "During vacation", known: true },
  { id: "specific", label: "Specific date", known: true },
  { id: "unknown", label: "We don't know yet", known: false },
] as const;

export type DateMode = (typeof DATE_MODES)[number]["id"];

export const TIME_BANDS = [
  { id: "morning", label: "Morning" },
  { id: "afternoon", label: "Afternoon" },
  { id: "evening", label: "Evening" },
  { id: "night", label: "Night" },
  { id: "specific", label: "Specific time" },
  { id: "unknown", label: "Not sure yet" },
] as const;

export type TimeBand = (typeof TIME_BANDS)[number]["id"];

export const GROUP_STATUSES = [
  "configuring",
  "swiping",
  "date_matching",
  "planned",
  "archived",
] as const;
export type GroupStatus = (typeof GROUP_STATUSES)[number];

export const INVITE_CODE_LENGTH = 6;
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
export const SESSION_COOKIE = "vibin_session";
export const CSRF_COOKIE = "vibin_csrf";
export const CSRF_HEADER = "x-vibin-csrf";

/**
 * Native (iOS / Android) clients can't rely on a cookie jar and have no
 * cross-site attack surface, so they authenticate with a bearer token instead:
 * `Authorization: Bearer <token>` where the token IS the KV session id. They
 * send `X-Vibin-Client: mobile` on every request; the server then accepts the
 * bearer header and skips the double-submit CSRF check (there is no ambient
 * credential to forge). The web app is unchanged — it never sends this header.
 */
export const CLIENT_HEADER = "x-vibin-client";
export const CLIENT_MOBILE = "mobile";

/* Owner Command Center — a separate, shorter-lived privileged session. */
export const ADMIN_SESSION_COOKIE = "vibin_admin";
export const ADMIN_CSRF_COOKIE = "vibin_admin_csrf";
export const ADMIN_CSRF_HEADER = "x-vibin-admin-csrf";
export const ADMIN_SESSION_TTL_SECONDS = 60 * 60 * 12; // 12 hours
export const ADMIN_MFA_GRACE_SECONDS = 60 * 10; // re-auth window for reveal actions

export const LIMITS = {
  groupName: { min: 2, max: 60 },
  displayName: { min: 2, max: 40 },
  password: { min: 10, max: 200 },
  message: { min: 1, max: 2000 },
  bio: { max: 280 },
  maxActiveMembers: 20,
  deckSize: 40,
} as const;
