/** Cloudflare bindings + secrets available to the Worker at runtime. */
export interface Env {
  // --- bindings (wrangler.jsonc) ---
  DB: D1Database;
  KV: KVNamespace;
  /** Optional — only bound when R2 is enabled on the account. */
  MEDIA?: R2Bucket;
  ASSETS: Fetcher;

  // --- vars ---
  APP_ENV: "development" | "staging" | "production";
  APP_URL: string;
  /** Optional deploy marker (git sha / CI build number) shown in the Command
   *  Center version panel. Falls back to "dev" when unset. */
  BUILD_ID?: string;
  /**
   * How many days of inactivity before a user session expires (sliding
   * window — every authenticated request within the window extends it).
   * Parse with a fallback: `Number(env.SESSION_INACTIVITY_DAYS) || 14`.
   * Optional — defaults to 14 when unset.
   */
  SESSION_INACTIVITY_DAYS?: string;

  // --- secrets (wrangler secret put / .dev.vars) ---
  /** Reserved for signed tokens (not yet used — sessions are opaque + KV-backed). */
  AUTH_SECRET?: string;
  EMAIL_API_KEY?: string;
  EMAIL_FROM?: string;
  /**
   * Owner Command Center — application-level encryption key for the credential
   * vault and TOTP secrets. Base64 of 32 random bytes. MUST be set in
   * production (`wrangler secret put ENCRYPTION_KEY`); never committed, never
   * sent to the frontend, never logged.
   */
  ENCRYPTION_KEY?: string;
  /** iOS app Team ID + Android signing-cert SHA-256, for the deep-link
   *  association files at /.well-known/*. Placeholders are served until set. */
  APPLE_TEAM_ID?: string;
  ANDROID_CERT_SHA256?: string;
  /**
   * Owner Command Center — break-glass recovery. A high-entropy string held
   * only in deployment secrets. Presenting it (server-side, rate-limited,
   * audited) authorises a one-shot owner password reset + TOTP clear. It is
   * NOT a login and grants no session on its own.
   */
  OWNER_RECOVERY_SECRET?: string;
  /**
   * Image backfill (§27/§28) — server-side only key for the Street View
   * Static API, used to fill in a real per-venue photo for activities that
   * currently only have a generic category fallback. Never sent to the
   * client: /media/streetview/:id fetches with this key and streams the
   * image bytes back, so the key itself never appears in any URL a browser
   * sees. Optional — the backfill route and admin action both no-op cleanly
   * (404 / clear error) when this isn't set.
   */
  GOOGLE_MAPS_API_KEY?: string;
  /**
   * Help desk (§34-37) — first-line AI answers for support tickets. Optional:
   * without it, every ticket just goes straight to a human (still fully
   * functional, see lib/support-ai.ts). Never used for anything except
   * answering support questions from the fixed product-knowledge prompt.
   */
  ANTHROPIC_API_KEY?: string;
  /** Where a new support ticket's escalation email is sent. Falls back to
   *  EMAIL_FROM when unset — set this to the real inbox someone reads. */
  SUPPORT_EMAIL?: string;
}

/** Hono context variables set by middleware. */
export interface Vars {
  userId: string | null;
  sessionId: string | null;
  /** Set by the Owner Command Center admin-session middleware. */
  adminUserId: string | null;
  adminSessionId: string | null;
}
