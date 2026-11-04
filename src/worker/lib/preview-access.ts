/**
 * Preview access code for the "binnenkort" (coming soon) mode.
 *
 * While maintenance mode is on the public sees the coming-soon page. The owner (and anyone the
 * owner hands the code to) can type an access code on that page; a correct code sets a signed,
 * HttpOnly cookie and the site then works for that browser as if maintenance mode were off.
 *
 * Storage: only a salted SHA-256 of the code lives in `system_settings` ("salt:hash"); the code
 * itself is never stored or logged. The pass cookie is `<expiry>.<hmac>` where the HMAC key is
 * that stored value, so changing or clearing the code invalidates every pass at once. No extra
 * secret or migration is needed.
 */

export const PREVIEW_COOKIE = "vibin_preview";
export const PREVIEW_PASS_DAYS = 30;
export const PREVIEW_CODE_MIN = 6;
export const PREVIEW_CODE_MAX = 64;

const enc = new TextEncoder();

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time string comparison (length is not secret here: both sides are fixed-length hex). */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Codes are compared case-insensitively and without spaces/dashes, so "ab12-cd34" == "AB12CD34". */
export function normalizeCode(code: string): string {
  return code.replace(/[\s-]+/g, "").toUpperCase();
}

async function sha256Hex(text: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", enc.encode(text)));
}

/** Turns a plain code into the value kept in the database: "salt:hash". */
export async function makeStoredCode(code: string): Promise<string> {
  const salt = toHex(crypto.getRandomValues(new Uint8Array(12)).buffer);
  return `${salt}:${await sha256Hex(`${salt}:${normalizeCode(code)}`)}`;
}

export async function verifyCode(stored: string | null | undefined, code: string): Promise<boolean> {
  if (!stored || !code) return false;
  const i = stored.indexOf(":");
  if (i < 1) return false;
  const salt = stored.slice(0, i);
  const hash = stored.slice(i + 1);
  return safeEqual(hash, await sha256Hex(`${salt}:${normalizeCode(code)}`));
}

async function hmacHex(key: string, message: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toHex(await crypto.subtle.sign("HMAC", k, enc.encode(message)));
}

/** Cookie value that proves the code was entered; expires after PREVIEW_PASS_DAYS. */
export async function signPass(stored: string, nowSec = Math.floor(Date.now() / 1000)): Promise<string> {
  const exp = nowSec + PREVIEW_PASS_DAYS * 86400;
  return `${exp}.${await hmacHex(stored, `vibin-preview:${exp}`)}`;
}

export async function verifyPass(
  stored: string | null | undefined,
  cookie: string | null | undefined,
  nowSec = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  if (!stored || !cookie) return false;
  const dot = cookie.indexOf(".");
  if (dot < 1) return false;
  const exp = Number(cookie.slice(0, dot));
  if (!Number.isInteger(exp) || exp < nowSec) return false;
  return safeEqual(cookie.slice(dot + 1), await hmacHex(stored, `vibin-preview:${exp}`));
}
