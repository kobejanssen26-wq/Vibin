/**
 * Mingo database schema (Cloudflare D1 / SQLite via Drizzle ORM).
 *
 * Conventions
 * -----------
 * - Primary keys are short opaque text ids (nanoid), generated in the app layer.
 * - Timestamps are unix epoch SECONDS stored as integers.
 * - JSON-ish columns store `text` and are parsed/serialised at the repo layer.
 * - Every foreign key uses ON DELETE CASCADE unless a soft-delete is required.
 *
 * Migrations are generated with `npm run db:generate` and applied with
 * `wrangler d1 migrations apply`. Never hand-edit a committed migration.
 */
import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const now = sql`(unixepoch())`;

/* -------------------------------------------------------------------------- */
/*  Identity & auth                                                          */
/* -------------------------------------------------------------------------- */

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    emailNormalized: text("email_normalized").notNull(),
    passwordHash: text("password_hash").notNull(),
    emailVerifiedAt: integer("email_verified_at"),
    role: text("role", { enum: ["user", "admin"] })
      .notNull()
      .default("user"),
    status: text("status", { enum: ["active", "suspended", "deleted"] })
      .notNull()
      .default("active"),
    createdAt: integer("created_at").notNull().default(now),
    updatedAt: integer("updated_at").notNull().default(now),
  },
  (t) => ({
    emailUnq: uniqueIndex("users_email_normalized_unq").on(t.emailNormalized),
  }),
);

export const profiles = sqliteTable("profiles", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  displayName: text("display_name").notNull(),
  avatarKey: text("avatar_key"), // R2 object key, nullable
  age: integer("age"),
  locationLabel: text("location_label"),
  bio: text("bio"),
  updatedAt: integer("updated_at").notNull().default(now),
});

/**
 * Single-use tokens for email verification and password reset.
 * Only the SHA-256 hash of the token is stored.
 */
export const emailTokens = sqliteTable(
  "email_tokens",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["verify", "reset"] }).notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: integer("expires_at").notNull(),
    usedAt: integer("used_at"),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => ({
    hashIdx: index("email_tokens_hash_idx").on(t.tokenHash),
    userIdx: index("email_tokens_user_idx").on(t.userId),
  }),
);

export const notificationPrefs = sqliteTable("notification_prefs", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  // JSON: { invites:bool, joins:bool, activityMatch:bool, dateVoting:bool,
  //         dateMatch:bool, upcoming:bool, messages:bool }
  channels: text("channels").notNull().default("{}"),
  updatedAt: integer("updated_at").notNull().default(now),
});

/* -------------------------------------------------------------------------- */
/*  Groups                                                                   */
/* -------------------------------------------------------------------------- */

export const groups = sqliteTable(
  "groups",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    creatorId: text("creator_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /**
     * configuring  -> settings not finalised
     * swiping      -> activity voting in progress
     * date_matching-> activity matched, voting on a date/time
     * planned      -> activity + date locked in
     * archived     -> done / hidden
     */
    status: text("status", {
      enum: ["configuring", "swiping", "date_matching", "planned", "archived"],
    })
      .notNull()
      .default("configuring"),
    createdAt: integer("created_at").notNull().default(now),
    updatedAt: integer("updated_at").notNull().default(now),
  },
  (t) => ({
    creatorIdx: index("groups_creator_idx").on(t.creatorId),
  }),
);

export const groupSettings = sqliteTable("group_settings", {
  groupId: text("group_id")
    .primaryKey()
    .references(() => groups.id, { onDelete: "cascade" }),
  // JSON array of category slugs; ignored when allActivities = 1
  categories: text("categories").notNull().default("[]"),
  allActivities: integer("all_activities").notNull().default(0),
  locationLabel: text("location_label"),
  lat: integer("lat"), // stored * 1e6 to keep integer precision
  lng: integer("lng"),
  radiusKm: integer("radius_km").notNull().default(25),
  budgetBand: text("budget_band", {
    enum: ["any", "free", "0_10", "10_25", "25_50", "50_100", "100_plus"],
  })
    .notNull()
    .default("any"),
  /**
   * known   -> dateSpecific / one of the presets resolves to a concrete date
   * unknown -> triggers the second (date) matching phase after an activity match
   */
  dateMode: text("date_mode", {
    enum: [
      "tonight",
      "tomorrow",
      "this_weekend",
      "this_week",
      "this_month",
      "vacation",
      "specific",
      "unknown",
    ],
  })
    .notNull()
    .default("unknown"),
  dateSpecific: integer("date_specific"), // epoch seconds, when dateMode = specific
  timeBand: text("time_band", {
    enum: ["morning", "afternoon", "evening", "night", "specific", "unknown"],
  })
    .notNull()
    .default("unknown"),
  timeSpecific: text("time_specific"), // "HH:MM"
  updatedAt: integer("updated_at").notNull().default(now),
});

export const groupMembers = sqliteTable(
  "group_members",
  {
    id: text("id").primaryKey(),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["creator", "member"] })
      .notNull()
      .default("member"),
    /**
     * active   -> counts toward unanimous match
     * inactive -> temporarily excluded from the match requirement
     * removed  -> kicked by creator
     * left     -> voluntarily left
     */
    status: text("status", {
      enum: ["active", "inactive", "removed", "left"],
    })
      .notNull()
      .default("active"),
    joinedAt: integer("joined_at").notNull().default(now),
  },
  (t) => ({
    memberUnq: uniqueIndex("group_members_group_user_unq").on(
      t.groupId,
      t.userId,
    ),
    groupIdx: index("group_members_group_idx").on(t.groupId),
    userIdx: index("group_members_user_idx").on(t.userId),
  }),
);

export const groupInvites = sqliteTable(
  "group_invites",
  {
    id: text("id").primaryKey(),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    maxUses: integer("max_uses"), // null = unlimited
    uses: integer("uses").notNull().default(0),
    expiresAt: integer("expires_at"), // null = never
    revokedAt: integer("revoked_at"),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => ({
    codeUnq: uniqueIndex("group_invites_code_unq").on(t.code),
    groupIdx: index("group_invites_group_idx").on(t.groupId),
  }),
);

/* -------------------------------------------------------------------------- */
/*  Activities & providers                                                   */
/* -------------------------------------------------------------------------- */

export const providers = sqliteTable("providers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  kind: text("kind", {
    enum: ["seed", "event_api", "booking_api", "local_business", "dataset"],
  })
    .notNull()
    .default("seed"),
  enabled: integer("enabled").notNull().default(1),
  config: text("config").notNull().default("{}"),
  createdAt: integer("created_at").notNull().default(now),
});

export const activityCategories = sqliteTable("activity_categories", {
  id: text("id").primaryKey(), // slug: "sport", "food_drinks", ...
  label: text("label").notNull(),
  icon: text("icon").notNull().default("✨"),
  sort: integer("sort").notNull().default(0),
});

export const activities = sqliteTable(
  "activities",
  {
    id: text("id").primaryKey(),
    providerId: text("provider_id")
      .notNull()
      .references(() => providers.id),
    externalId: text("external_id"),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    categoryId: text("category_id")
      .notNull()
      .references(() => activityCategories.id),
    locationLabel: text("location_label").notNull(),
    lat: integer("lat"), // * 1e6
    lng: integer("lng"),
    priceCents: integer("price_cents"), // per person, null = unknown/free-form
    priceBand: text("price_band", {
      enum: ["free", "0_10", "10_25", "25_50", "50_100", "100_plus"],
    }).notNull(),
    currency: text("currency").notNull().default("EUR"),
    durationMin: integer("duration_min"),
    openingHours: text("opening_hours").notNull().default("{}"), // JSON
    websiteUrl: text("website_url"),
    bookingUrl: text("booking_url"),
    ticketUrl: text("ticket_url"),
    minAge: integer("min_age"),
    imageUrl: text("image_url"),
    tags: text("tags").notNull().default("[]"), // JSON array
    source: text("source").notNull().default("seed"),
    active: integer("active").notNull().default(1),
    createdAt: integer("created_at").notNull().default(now),
    updatedAt: integer("updated_at").notNull().default(now),
  },
  (t) => ({
    catIdx: index("activities_category_idx").on(t.categoryId),
    activeIdx: index("activities_active_idx").on(t.active),
    extUnq: uniqueIndex("activities_provider_external_unq").on(
      t.providerId,
      t.externalId,
    ),
  }),
);

export const activityImages = sqliteTable(
  "activity_images",
  {
    id: text("id").primaryKey(),
    activityId: text("activity_id")
      .notNull()
      .references(() => activities.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    sort: integer("sort").notNull().default(0),
  },
  (t) => ({
    actIdx: index("activity_images_activity_idx").on(t.activityId),
  }),
);

/* -------------------------------------------------------------------------- */
/*  Swipe deck & activity votes                                              */
/* -------------------------------------------------------------------------- */

/**
 * The ordered deck of activities a group is swiping through. Materialised once
 * when swiping starts so ordering + undo are deterministic and new members see
 * the same deck.
 */
export const groupActivityPool = sqliteTable(
  "group_activity_pool",
  {
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    activityId: text("activity_id")
      .notNull()
      .references(() => activities.id, { onDelete: "cascade" }),
    sort: integer("sort").notNull().default(0),
    addedAt: integer("added_at").notNull().default(now),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.groupId, t.activityId] }),
    sortIdx: index("group_activity_pool_sort_idx").on(t.groupId, t.sort),
  }),
);

export const activityVotes = sqliteTable(
  "activity_votes",
  {
    id: text("id").primaryKey(),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    activityId: text("activity_id")
      .notNull()
      .references(() => activities.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    value: text("value", { enum: ["like", "nope", "superlike"] }).notNull(),
    createdAt: integer("created_at").notNull().default(now),
    updatedAt: integer("updated_at").notNull().default(now),
  },
  (t) => ({
    voteUnq: uniqueIndex("activity_votes_group_activity_user_unq").on(
      t.groupId,
      t.activityId,
      t.userId,
    ),
    groupActivityIdx: index("activity_votes_group_activity_idx").on(
      t.groupId,
      t.activityId,
    ),
  }),
);

/* -------------------------------------------------------------------------- */
/*  Matches, date matching & plans                                           */
/* -------------------------------------------------------------------------- */

export const matches = sqliteTable(
  "matches",
  {
    id: text("id").primaryKey(),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    activityId: text("activity_id")
      .notNull()
      .references(() => activities.id, { onDelete: "cascade" }),
    /**
     * activity_matched -> everyone liked the activity; date still open
     * complete         -> activity + date both locked
     * cancelled        -> group abandoned this match
     */
    status: text("status", {
      enum: ["activity_matched", "complete", "cancelled"],
    })
      .notNull()
      .default("activity_matched"),
    chosenDateOptionId: text("chosen_date_option_id"),
    startsAt: integer("starts_at"), // resolved concrete datetime (epoch seconds)
    matchedAt: integer("matched_at").notNull().default(now),
    completedAt: integer("completed_at"),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => ({
    groupIdx: index("matches_group_idx").on(t.groupId),
    groupActivityUnq: uniqueIndex("matches_group_activity_unq").on(
      t.groupId,
      t.activityId,
    ),
  }),
);

export const dateOptions = sqliteTable(
  "date_options",
  {
    id: text("id").primaryKey(),
    matchId: text("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    startsAt: integer("starts_at").notNull(), // epoch seconds
    label: text("label").notNull(),
    sort: integer("sort").notNull().default(0),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => ({
    matchIdx: index("date_options_match_idx").on(t.matchId),
  }),
);

export const dateVotes = sqliteTable(
  "date_votes",
  {
    id: text("id").primaryKey(),
    dateOptionId: text("date_option_id")
      .notNull()
      .references(() => dateOptions.id, { onDelete: "cascade" }),
    matchId: text("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    value: text("value", { enum: ["yes", "no", "maybe"] }).notNull(),
    createdAt: integer("created_at").notNull().default(now),
    updatedAt: integer("updated_at").notNull().default(now),
  },
  (t) => ({
    voteUnq: uniqueIndex("date_votes_option_user_unq").on(
      t.dateOptionId,
      t.userId,
    ),
    matchIdx: index("date_votes_match_idx").on(t.matchId),
  }),
);

export const plans = sqliteTable(
  "plans",
  {
    id: text("id").primaryKey(),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    matchId: text("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    activityId: text("activity_id")
      .notNull()
      .references(() => activities.id, { onDelete: "cascade" }),
    startsAt: integer("starts_at"), // null when the group locked activity-only
    locationLabel: text("location_label").notNull(),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => ({
    groupIdx: index("plans_group_idx").on(t.groupId),
    matchUnq: uniqueIndex("plans_match_unq").on(t.matchId),
  }),
);

/* -------------------------------------------------------------------------- */
/*  Chat, notifications, moderation                                          */
/* -------------------------------------------------------------------------- */

export const messages = sqliteTable(
  "messages",
  {
    id: text("id").primaryKey(),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }), // null = system
    kind: text("kind", { enum: ["text", "system"] })
      .notNull()
      .default("text"),
    body: text("body").notNull(),
    meta: text("meta").notNull().default("{}"), // JSON for system-message payloads
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => ({
    groupIdx: index("messages_group_created_idx").on(t.groupId, t.createdAt),
  }),
);

export const notifications = sqliteTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    data: text("data").notNull().default("{}"), // JSON, e.g. { groupId, matchId }
    readAt: integer("read_at"),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => ({
    userIdx: index("notifications_user_created_idx").on(t.userId, t.createdAt),
  }),
);

export const reports = sqliteTable(
  "reports",
  {
    id: text("id").primaryKey(),
    reporterId: text("reporter_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    targetType: text("target_type", {
      enum: ["activity", "group", "member", "message"],
    }).notNull(),
    targetId: text("target_id").notNull(),
    reason: text("reason", {
      enum: ["inappropriate", "spam", "incorrect_info", "other"],
    }).notNull(),
    detail: text("detail").notNull().default(""),
    status: text("status", { enum: ["open", "reviewing", "resolved", "dismissed"] })
      .notNull()
      .default("open"),
    resolverId: text("resolver_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: integer("created_at").notNull().default(now),
    resolvedAt: integer("resolved_at"),
  },
  (t) => ({
    statusIdx: index("reports_status_idx").on(t.status),
  }),
);

/* -------------------------------------------------------------------------- */
/*  Inferred types                                                           */
/* -------------------------------------------------------------------------- */

export type User = typeof users.$inferSelect;
export type Profile = typeof profiles.$inferSelect;
export type Group = typeof groups.$inferSelect;
export type GroupSettings = typeof groupSettings.$inferSelect;
export type GroupMember = typeof groupMembers.$inferSelect;
export type GroupInvite = typeof groupInvites.$inferSelect;
export type Activity = typeof activities.$inferSelect;
export type ActivityCategory = typeof activityCategories.$inferSelect;
export type ActivityVote = typeof activityVotes.$inferSelect;
export type Match = typeof matches.$inferSelect;
export type DateOption = typeof dateOptions.$inferSelect;
export type DateVote = typeof dateVotes.$inferSelect;
export type Plan = typeof plans.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type Report = typeof reports.$inferSelect;
export type Provider = typeof providers.$inferSelect;
