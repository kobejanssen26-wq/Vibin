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

  // --- secrets (wrangler secret put / .dev.vars) ---
  /** Reserved for signed tokens (not yet used — sessions are opaque + KV-backed). */
  AUTH_SECRET?: string;
  EMAIL_API_KEY?: string;
  EMAIL_FROM?: string;
}

/** Hono context variables set by middleware. */
export interface Vars {
  userId: string | null;
  sessionId: string | null;
}
