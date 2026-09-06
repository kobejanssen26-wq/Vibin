/** Cloudflare bindings + secrets available to the Worker at runtime. */
export interface Env {
  // --- bindings (wrangler.jsonc) ---
  DB: D1Database;
  KV: KVNamespace;
  MEDIA: R2Bucket;
  ASSETS: Fetcher;

  // --- vars ---
  APP_ENV: "development" | "staging" | "production";
  APP_URL: string;

  // --- secrets (wrangler secret put / .dev.vars) ---
  AUTH_SECRET: string;
  EMAIL_API_KEY?: string;
  EMAIL_FROM?: string;
}

/** Hono context variables set by middleware. */
export interface Vars {
  userId: string | null;
  sessionId: string | null;
}
