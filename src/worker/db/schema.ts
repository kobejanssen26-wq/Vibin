/**
 * VIBIN database schema (Cloudflare D1 / SQLite via Drizzle ORM).
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
  real,
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
    /**
     * user  -> normal VIBIN member
     * admin -> catalogue / moderation access (legacy)
     * owner -> full Owner Command Center; the only role that can enter /admin
     */
    role: text("role", { enum: ["user", "admin", "owner"] })
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
  /** Bumped on every settings save. Votes are stamped with the generation
   *  active when cast (see activityVotes.filterGeneration) so undo/lastVoted
   *  can tell "this filter session" from "an earlier one" with an exact
   *  integer match instead of a same-second-prone timestamp comparison. */
  filterGeneration: integer("filter_generation").notNull().default(0),
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
  /** Owner CRM pipeline status (internal). */
  crmStatus: text("crm_status", {
    enum: [
      "not_contacted",
      "contacted",
      "interested",
      "partner",
      "not_interested",
      "follow_up",
      "needs_review",
      "outdated",
      "inactive",
    ],
  })
    .notNull()
    .default("not_contacted"),
  config: text("config").notNull().default("{}"),
  createdAt: integer("created_at").notNull().default(now),
});

export const activityCategories = sqliteTable("activity_categories", {
  id: text("id").primaryKey(), // slug: "sport", "food_drinks", ...
  label: text("label").notNull(),
  icon: text("icon").notNull().default("✨"),
  sort: integer("sort").notNull().default(0),
  // inactive categories stay valid on existing activities/votes but are
  // hidden from the swipe-filter chip list for new selections.
  active: integer("active").notNull().default(1),
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
    // User-facing copy written/verified by the enrichment pipeline (§28) —
    // null for the ~6000 not-yet-enriched rows, which fall back to a
    // display-layer cleanup of `description` (see dto.ts) rather than
    // showing the raw import text. Never regenerated from a guess.
    shortDescription: text("short_description"),
    fullDescription: text("full_description"),
    descriptionSource: text("description_source"),
    descriptionCheckedAt: integer("description_checked_at"),
    categoryId: text("category_id")
      .notNull()
      .references(() => activityCategories.id),
    subcategory: text("subcategory"),

    // provider / venue
    provider: text("provider"), // human-readable venue/organiser name
    providerWebsite: text("provider_website"),

    // location
    locationLabel: text("location_label").notNull(),
    address: text("address"),
    city: text("city"),
    country: text("country").notNull().default("BE"),
    lat: integer("lat"), // * 1e6
    lng: integer("lng"),

    // pricing
    priceCents: integer("price_cents"), // amount in the unit given by priceType
    priceType: text("price_type", {
      enum: ["per_person", "per_group", "from_per_person", "free", "varies"],
    })
      .notNull()
      .default("per_person"),
    priceBand: text("price_band", {
      enum: ["free", "0_10", "10_25", "25_50", "50_100", "100_plus"],
    }).notNull(),
    currency: text("currency").notNull().default("EUR"),
    // Researched price range + provenance (§10-14) — separate from the
    // single priceCents above so a genuine "€10-20 p.p." range never has to
    // be collapsed into one misleading number. null until the enrichment
    // pipeline actually checks a source; never guessed.
    priceMinCents: integer("price_min_cents"),
    priceMaxCents: integer("price_max_cents"),
    priceUnitNote: text("price_unit_note"), // e.g. "per court / hour", "per game"
    priceConfidence: text("price_confidence", {
      enum: ["exact", "estimate", "unknown"],
    }),
    priceSourceUrl: text("price_source_url"),
    priceCheckedAt: integer("price_checked_at"),

    // logistics
    durationMin: integer("duration_min"),
    minParticipants: integer("min_participants"),
    maxParticipants: integer("max_participants"),
    minAge: integer("min_age"),
    indoorOutdoor: text("indoor_outdoor", {
      enum: ["indoor", "outdoor", "both"],
    }),
    accessibility: text("accessibility"),
    openingHours: text("opening_hours").notNull().default("{}"), // JSON

    // links
    websiteUrl: text("website_url"),
    bookingUrl: text("booking_url"),
    ticketUrl: text("ticket_url"),

    // monetization (§4/§46) — what VIBIN can honestly say about this outbound
    // link. "outbound_tracking" means "we measure the click", nothing more —
    // it is NOT a claim of commission. Every affiliate/commission field stays
    // null until a real, contractually-agreed deal exists; never populate
    // these from a guess.
    monetizationType: text("monetization_type", {
      enum: [
        "none",
        "outbound_tracking",
        "affiliate",
        "direct_partner",
        "booking_partner",
      ],
    })
      .notNull()
      .default("none"),
    affiliateUrl: text("affiliate_url"),
    affiliateNetwork: text("affiliate_network"),
    affiliatePartnerId: text("affiliate_partner_id"),
    commissionType: text("commission_type", {
      enum: ["none", "percentage", "fixed"],
    })
      .notNull()
      .default("none"),
    commissionRate: real("commission_rate"), // % (0-100) or fixed-amount units, per commissionType
    commissionCurrency: text("commission_currency"),
    commissionStatus: text("commission_status", {
      enum: ["none", "pending", "active", "paused", "ended"],
    })
      .notNull()
      .default("none"),

    // media
    imageUrl: text("image_url"),
    imageSource: text("image_source"), // e.g. "Unsplash", "provider"
    imageAttribution: text("image_attribution"), // e.g. "Photo: Jane Doe / Unsplash"
    // true when imageUrl is a shared category/subcategory stock fallback
    // (no venue-specific photo exists) rather than a photo of this exact
    // place — lets the image-quality audit surface "generic" reuse honestly
    // instead of admins mistaking it for a data bug.
    imageIsGeneric: integer("image_is_generic").notNull().default(0),
    // 0 (broken) - 5 (official/authorized, venue-specific) per §22. Null
    // means "not yet assessed" — distinct from 0, which means "checked and
    // broken".
    imageQualityScore: integer("image_quality_score"),
    tags: text("tags").notNull().default("[]"), // JSON array

    // provenance & verification (§14, §27)
    source: text("source").notNull().default("seed"),
    sourceUrl: text("source_url"),
    lastVerifiedAt: integer("last_verified_at"),
    status: text("status", {
      enum: ["verified", "needs_review", "outdated", "inactive"],
    })
      .notNull()
      .default("needs_review"),
    // Which specific aspects still need a human look (§39/§59), e.g.
    // '["price","image"]' — lets Admin surface *what* is weak instead of
    // one blanket "needs review" flag. JSON array of strings; "[]" means
    // nothing specific is flagged (still may be the default needs_review
    // status for a never-enriched row).
    needsReviewFields: text("needs_review_fields").notNull().default("[]"),
    // What the automated check of the venue's own website found (see
    // scripts/enrich/). The URL itself is never deleted — a "dead"/"parked"
    // site is just not offered to users as a link — so a wrong verdict is
    // reversible by flipping this column. null = never checked.
    webStatus: text("web_status", {
      enum: ["alive", "dead", "parked", "closed_signal", "blocked", "unknown"],
    }),
    webCheckedAt: integer("web_checked_at"),

    active: integer("active").notNull().default(1),
    createdAt: integer("created_at").notNull().default(now),
    updatedAt: integer("updated_at").notNull().default(now),
  },
  (t) => ({
    catIdx: index("activities_category_idx").on(t.categoryId),
    activeIdx: index("activities_active_idx").on(t.active),
    statusIdx: index("activities_status_idx").on(t.status),
    cityIdx: index("activities_city_idx").on(t.city),
    monetizationIdx: index("activities_monetization_idx").on(t.monetizationType),
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
/*  Live events (temporary happenings) & their ingestion sources             */
/* -------------------------------------------------------------------------- */

/**
 * A configured feed that events are ingested from. `manual` is admin-entered and
 * always available; the API/feed kinds stay `enabled = 0` until an operator adds
 * credentials/config (see src/worker/events/sources). `config` is opaque JSON
 * interpreted by that source's adapter (endpoint, apiKeyRef, filters, region…).
 */
export const eventSources = sqliteTable(
  "event_sources",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    kind: text("kind", {
      enum: [
        "manual",
        "sports_api",
        "ticket_feed",
        "city_calendar",
        "ics",
        "rss",
      ],
    })
      .notNull()
      .default("manual"),
    enabled: integer("enabled").notNull().default(0),
    /** how trustworthy this source is — drives the default verification_status */
    trust: text("trust", { enum: ["official", "trusted", "third_party"] })
      .notNull()
      .default("third_party"),
    config: text("config").notNull().default("{}"),
    /** minutes between automatic syncs */
    syncEveryMin: integer("sync_every_min").notNull().default(720),
    lastRunAt: integer("last_run_at"),
    nextRunAt: integer("next_run_at"),
    /** JSON: { ok, added, updated, skipped, errors, message } from the last run */
    lastResult: text("last_result"),
    createdAt: integer("created_at").notNull().default(now),
    updatedAt: integer("updated_at").notNull().default(now),
  },
  (t) => ({
    enabledIdx: index("event_sources_enabled_idx").on(t.enabled),
    dueIdx: index("event_sources_next_run_idx").on(t.nextRunAt),
  }),
);

export const events = sqliteTable(
  "events",
  {
    id: text("id").primaryKey(),
    sourceId: text("source_id").references(() => eventSources.id, {
      onDelete: "set null",
    }),
    /** the source's own id for this event (for stable re-sync) */
    externalId: text("external_id"),
    /** normalised name+day+city hash — cross-source de-duplication key */
    dedupeHash: text("dedupe_hash").notNull(),

    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    /** activity-category slug ("culture", "music", …) for filtering parity */
    categoryId: text("category_id").references(() => activityCategories.id),
    kind: text("kind", {
      enum: [
        "sports",
        "music",
        "culture",
        "market",
        "festival",
        "seasonal",
        "food",
        "family",
        "community",
        "nightlife",
        "other",
      ],
    })
      .notNull()
      .default("other"),
    subcategory: text("subcategory"),

    // where
    venueName: text("venue_name"),
    address: text("address"),
    city: text("city"),
    country: text("country").notNull().default("BE"),
    lat: integer("lat"), // * 1e6
    lng: integer("lng"),

    // when (unix seconds, Europe/Brussels)
    startsAt: integer("starts_at").notNull(),
    endsAt: integer("ends_at"),
    allDay: integer("all_day").notNull().default(0),
    timezone: text("timezone").notNull().default("Europe/Brussels"),
    /** How many days before startsAt this event becomes discoverable — a
     *  major festival might want 90, a small local market only 7. Null uses
     *  the platform default (see DEFAULT_VISIBILITY_WINDOW_DAYS). */
    visibilityWindowDays: integer("visibility_window_days"),

    status: text("status", {
      enum: [
        "upcoming",
        "live",
        "completed",
        "cancelled",
        "postponed",
        "sold_out",
        "unknown",
      ],
    })
      .notNull()
      .default("upcoming"),

    // pricing (best-effort; null = unknown, never invented)
    priceType: text("price_type", {
      enum: ["free", "paid", "varies", "unknown"],
    })
      .notNull()
      .default("unknown"),
    priceMinCents: integer("price_min_cents"),
    priceMaxCents: integer("price_max_cents"),
    currency: text("currency").notNull().default("EUR"),

    // links & media
    url: text("url"),
    ticketUrl: text("ticket_url"),
    imageUrl: text("image_url"),
    imageSource: text("image_source"),
    imageAttribution: text("image_attribution"),
    tags: text("tags").notNull().default("[]"),

    // provenance & sync
    source: text("source").notNull().default("manual"),
    sourceUrl: text("source_url"),
    verificationStatus: text("verification_status", {
      enum: ["verified", "needs_review", "unverified", "archived"],
    })
      .notNull()
      .default("needs_review"),
    /** admin-touched fields are frozen against source overwrites (JSON array) */
    lockedFields: text("locked_fields").notNull().default("[]"),
    lastSyncedAt: integer("last_synced_at"),
    nextSyncAt: integer("next_sync_at"),

    active: integer("active").notNull().default(1),
    createdAt: integer("created_at").notNull().default(now),
    updatedAt: integer("updated_at").notNull().default(now),
  },
  (t) => ({
    startsIdx: index("events_starts_at_idx").on(t.startsAt),
    statusIdx: index("events_status_idx").on(t.status),
    cityIdx: index("events_city_idx").on(t.city),
    kindIdx: index("events_kind_idx").on(t.kind),
    activeIdx: index("events_active_idx").on(t.active),
    dedupeIdx: index("events_dedupe_idx").on(t.dedupeHash),
    srcExtUnq: uniqueIndex("events_source_external_unq").on(
      t.sourceId,
      t.externalId,
    ),
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
    /** groupSettings.filterGeneration at the moment this vote was cast — the
     *  undo/lastVoted boundary compares this instead of a timestamp, since a
     *  vote and a filter change can land in the same unix second (seen live:
     *  both timestamps identical), which made a >= timestamp comparison
     *  occasionally let undo reach into the previous filter session. An
     *  integer generation number can't tie like that. */
    filterGeneration: integer("filter_generation").notNull().default(0),
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

/**
 * Push notification device tokens for the iOS / Android apps. One row per
 * (device, user). `token` is an Expo push token; `platform` records where it
 * came from so analytics and troubleshooting can split by OS. Removed on
 * logout, on 401, and when Expo reports it as unregistered.
 */
export const pushTokens = sqliteTable(
  "push_tokens",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull(),
    platform: text("platform", { enum: ["ios", "android", "web"] }).notNull(),
    deviceName: text("device_name"),
    createdAt: integer("created_at").notNull().default(now),
    lastSeenAt: integer("last_seen_at").notNull().default(now),
  },
  (t) => ({
    tokenUnq: uniqueIndex("push_tokens_token_unq").on(t.token),
    userIdx: index("push_tokens_user_idx").on(t.userId),
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
      enum: ["inappropriate", "harassment", "spam", "incorrect_info", "other"],
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
    // internal moderator notes — never shown to the reporter or reported user
    notes: text("notes"),
  },
  (t) => ({
    statusIdx: index("reports_status_idx").on(t.status),
  }),
);

/* -------------------------------------------------------------------------- */
/*  Help / support desk                                                       */
/* -------------------------------------------------------------------------- */

/**
 * A support conversation. The first message is the user's own question;
 * an AI reply (if ANTHROPIC_API_KEY is configured — see lib/support-ai.ts)
 * is appended as its own message, same thread, never a separate system.
 * `aiResolved` is only ever set true by the AI explicitly saying it's
 * confident in its answer — anything else stays "open" for a human.
 */
export const supportTickets = sqliteTable(
  "support_tickets",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    subject: text("subject").notNull(),
    category: text("category", {
      enum: ["account", "groups", "swiping", "activities", "bug", "other"],
    })
      .notNull()
      .default("other"),
    priority: text("priority", { enum: ["low", "normal", "high"] })
      .notNull()
      .default("normal"),
    status: text("status", { enum: ["open", "pending", "resolved", "closed"] })
      .notNull()
      .default("open"),
    // true only when the AI answered and explicitly reported high confidence;
    // false/null means a human should look at this (no key configured, AI was
    // unsure, or nothing has answered yet).
    aiResolved: integer("ai_resolved"),
    assignedTo: text("assigned_to").references(() => users.id, { onDelete: "set null" }),
    createdAt: integer("created_at").notNull().default(now),
    updatedAt: integer("updated_at").notNull().default(now),
  },
  (t) => ({
    userIdx: index("support_tickets_user_idx").on(t.userId),
    statusIdx: index("support_tickets_status_idx").on(t.status),
  }),
);

export const supportMessages = sqliteTable(
  "support_messages",
  {
    id: text("id").primaryKey(),
    ticketId: text("ticket_id")
      .notNull()
      .references(() => supportTickets.id, { onDelete: "cascade" }),
    authorType: text("author_type", { enum: ["user", "ai", "admin", "system"] }).notNull(),
    authorId: text("author_id").references(() => users.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    // admin-only internal note — never sent to or shown to the ticket's user
    internal: integer("internal").notNull().default(0),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => ({
    ticketIdx: index("support_messages_ticket_idx").on(t.ticketId),
  }),
);

/* -------------------------------------------------------------------------- */
/*  Owner Command Center — admin identity, sessions, MFA, recovery            */
/* -------------------------------------------------------------------------- */

/**
 * DB-backed sessions for the Owner Command Center. Separate from the normal
 * app session (which lives in KV): holding a `vibin_session` cookie never
 * grants admin access — you must additionally hold a live `vibin_admin`
 * session whose owner still has role='owner'. Only the SHA-256 hash of the
 * session id is stored; the raw id lives only in the HttpOnly cookie.
 */
export const adminSessions = sqliteTable(
  "admin_sessions",
  {
    id: text("id").primaryKey(), // sha256(rawSessionId)
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    mfaVerifiedAt: integer("mfa_verified_at"), // null until the MFA step passes
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: integer("created_at").notNull().default(now),
    lastSeenAt: integer("last_seen_at").notNull().default(now),
    expiresAt: integer("expires_at").notNull(),
    revokedAt: integer("revoked_at"),
  },
  (t) => ({
    userIdx: index("admin_sessions_user_idx").on(t.userId),
    expiresIdx: index("admin_sessions_expires_idx").on(t.expiresAt),
  }),
);

/**
 * TOTP (RFC 6238) enrolment for an owner. The base32 secret is stored
 * AES-256-GCM encrypted with the server-side ENCRYPTION_KEY — never plaintext,
 * never sent to the frontend after enrolment.
 */
export const adminTotp = sqliteTable("admin_totp", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  secretEnc: text("secret_enc").notNull(), // base64(iv||ciphertext||tag)
  confirmedAt: integer("confirmed_at"), // null until the first code is verified
  createdAt: integer("created_at").notNull().default(now),
});

export const adminRecoveryCodes = sqliteTable(
  "admin_recovery_codes",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    codeHash: text("code_hash").notNull(), // sha256(code) — code shown once
    usedAt: integer("used_at"),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => ({
    userIdx: index("admin_recovery_codes_user_idx").on(t.userId),
    hashIdx: index("admin_recovery_codes_hash_idx").on(t.codeHash),
  }),
);

/* -------------------------------------------------------------------------- */
/*  Owner Command Center — audit, analytics, config                          */
/* -------------------------------------------------------------------------- */

/**
 * Append-only audit trail for every privileged action. Rows are kept even when
 * the target object is deleted. `meta` is small JSON and MUST NEVER contain a
 * secret value — record "credential X viewed", never the credential.
 */
export const auditLog = sqliteTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    actorType: text("actor_type", { enum: ["owner", "admin", "system"] })
      .notNull()
      .default("owner"),
    actorId: text("actor_id").references(() => users.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(), // e.g. "admin.login", "credential.viewed"
    targetType: text("target_type"),
    targetId: text("target_id"),
    meta: text("meta").notNull().default("{}"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => ({
    createdIdx: index("audit_log_created_idx").on(t.createdAt),
    actorIdx: index("audit_log_actor_idx").on(t.actorId),
    actionIdx: index("audit_log_action_idx").on(t.action),
  }),
);

/**
 * Structured product analytics. One row per meaningful event. Foreign keys are
 * ON DELETE SET NULL so historical funnels survive user/activity deletion.
 * `dedupeKey` (when set) is unique — makes retried/reloaded client events
 * idempotent.
 */
export const analyticsEvents = sqliteTable(
  "analytics_events",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    groupId: text("group_id").references(() => groups.id, {
      onDelete: "set null",
    }),
    activityId: text("activity_id").references(() => activities.id, {
      onDelete: "set null",
    }),
    props: text("props").notNull().default("{}"), // small JSON
    dedupeKey: text("dedupe_key"),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => ({
    nameCreatedIdx: index("analytics_events_name_created_idx").on(
      t.name,
      t.createdAt,
    ),
    activityNameIdx: index("analytics_events_activity_name_idx").on(
      t.activityId,
      t.name,
    ),
    groupIdx: index("analytics_events_group_idx").on(t.groupId),
    userIdx: index("analytics_events_user_idx").on(t.userId),
    createdIdx: index("analytics_events_created_idx").on(t.createdAt),
    dedupeUnq: uniqueIndex("analytics_events_dedupe_unq").on(t.dedupeKey),
  }),
);

/** Server-evaluated feature flags. Never used for authorization. */
export const featureFlags = sqliteTable("feature_flags", {
  key: text("key").primaryKey(),
  enabled: integer("enabled").notNull().default(0),
  description: text("description").notNull().default(""),
  updatedAt: integer("updated_at").notNull().default(now),
  updatedBy: text("updated_by").references(() => users.id, {
    onDelete: "set null",
  }),
});

/**
 * Single-row key/value store for owner-controlled runtime config:
 * `owner_setup_completed_at`, `maintenance_mode`, `maintenance_message`, …
 */
export const systemSettings = sqliteTable("system_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull().default(""),
  updatedAt: integer("updated_at").notNull().default(now),
  updatedBy: text("updated_by").references(() => users.id, {
    onDelete: "set null",
  }),
});

/* -------------------------------------------------------------------------- */
/*  Owner Command Center — provider CRM                                       */
/* -------------------------------------------------------------------------- */

/**
 * Business contact details for an activity provider, kept where legitimately
 * obtained. Business information only — not unrelated personal data.
 */
export const providerContacts = sqliteTable(
  "provider_contacts",
  {
    id: text("id").primaryKey(),
    providerId: text("provider_id")
      .notNull()
      .references(() => providers.id, { onDelete: "cascade" }),
    businessName: text("business_name"),
    email: text("email"),
    phone: text("phone"),
    website: text("website"),
    contactPage: text("contact_page"),
    address: text("address"),
    contactPerson: text("contact_person"),
    role: text("role"),
    preferredMethod: text("preferred_method"), // "email" | "phone" | "form" | ...
    notes: text("notes").notNull().default(""),
    nextFollowUpAt: integer("next_follow_up_at"),
    createdAt: integer("created_at").notNull().default(now),
    updatedAt: integer("updated_at").notNull().default(now),
  },
  (t) => ({
    providerIdx: index("provider_contacts_provider_idx").on(t.providerId),
  }),
);

/** A logged interaction with a provider — never auto-fabricated. */
export const providerCommunications = sqliteTable(
  "provider_communications",
  {
    id: text("id").primaryKey(),
    providerId: text("provider_id")
      .notNull()
      .references(() => providers.id, { onDelete: "cascade" }),
    contactId: text("contact_id").references(() => providerContacts.id, {
      onDelete: "set null",
    }),
    kind: text("kind", {
      enum: ["email", "call", "meeting", "note", "other"],
    })
      .notNull()
      .default("note"),
    occurredAt: integer("occurred_at").notNull().default(now),
    subject: text("subject").notNull().default(""),
    status: text("status").notNull().default(""), // free text: "sent", "replied", …
    notes: text("notes").notNull().default(""),
    createdBy: text("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => ({
    providerIdx: index("provider_comms_provider_idx").on(t.providerId),
  }),
);

/* -------------------------------------------------------------------------- */
/*  Owner Command Center — encrypted credential vault                        */
/* -------------------------------------------------------------------------- */

/**
 * Project-related secrets the owner has legitimate reason to keep (provider
 * portal logins, dev-service keys, test accounts). The secret is stored
 * AES-256-GCM encrypted with the server-side ENCRYPTION_KEY — the ciphertext
 * lives here, the key never does. Only `reveal` (with a fresh password
 * re-auth) ever decrypts, and every touch is logged.
 */
export const credentials = sqliteTable(
  "credentials",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    provider: text("provider"),
    category: text("category", {
      enum: [
        "activity_provider",
        "development",
        "services",
        "test_account",
        "other",
      ],
    })
      .notNull()
      .default("other"),
    username: text("username"),
    email: text("email"),
    url: text("url"),
    notes: text("notes").notNull().default(""),
    secretEnc: text("secret_enc").notNull(), // base64(iv||ciphertext||tag)
    tags: text("tags").notNull().default("[]"), // JSON array
    ownerId: text("owner_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: integer("created_at").notNull().default(now),
    updatedAt: integer("updated_at").notNull().default(now),
    lastAccessedAt: integer("last_accessed_at"),
  },
  (t) => ({
    categoryIdx: index("credentials_category_idx").on(t.category),
  }),
);

/** Every create / view / update / delete / export of a credential. Never the
 *  secret value itself. */
export const credentialAccessLog = sqliteTable(
  "credential_access_log",
  {
    id: text("id").primaryKey(),
    credentialId: text("credential_id").notNull(),
    actorId: text("actor_id").references(() => users.id, {
      onDelete: "set null",
    }),
    action: text("action", {
      enum: ["viewed", "created", "updated", "deleted", "exported"],
    }).notNull(),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => ({
    credIdx: index("credential_access_log_cred_idx").on(t.credentialId),
    createdIdx: index("credential_access_log_created_idx").on(t.createdAt),
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
export type EventRow = typeof events.$inferSelect;
export type EventSourceRow = typeof eventSources.$inferSelect;
export type AdminSession = typeof adminSessions.$inferSelect;
export type AdminTotp = typeof adminTotp.$inferSelect;
export type AdminRecoveryCode = typeof adminRecoveryCodes.$inferSelect;
export type AuditLogRow = typeof auditLog.$inferSelect;
export type AnalyticsEvent = typeof analyticsEvents.$inferSelect;
export type FeatureFlag = typeof featureFlags.$inferSelect;
export type SystemSetting = typeof systemSettings.$inferSelect;
