import type { Env } from "../env";
import { tooMany } from "./errors";

/**
 * Fixed-window rate limiter backed by KV. Not perfectly precise under heavy
 * concurrency (KV is eventually consistent) but entirely adequate for abuse
 * prevention on auth + write endpoints. For hot paths, swap in a Durable Object.
 */
export async function rateLimit(
  env: Env,
  bucket: string,
  key: string,
  limit: number,
  windowSec: number,
): Promise<void> {
  // Disabled locally so end-to-end tests can create many accounts quickly.
  if (env.APP_ENV === "development") return;
  const now = Math.floor(Date.now() / 1000);
  const window = Math.floor(now / windowSec);
  const kvKey = `rl:${bucket}:${key}:${window}`;
  const current = Number((await env.KV.get(kvKey)) ?? "0");
  if (current >= limit) throw tooMany();
  await env.KV.put(kvKey, String(current + 1), { expirationTtl: windowSec + 5 });
}

export function clientIp(req: Request): string {
  return (
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}
