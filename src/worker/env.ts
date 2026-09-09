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
}

/** Hono context variables set by middleware. */
export interface Vars {
  userId: string | null;
  sessionId: string | null;
  /** Set by the Owner Command Center admin-session middleware. */
  adminUserId: string | null;
  adminSessionId: string | null;
}
