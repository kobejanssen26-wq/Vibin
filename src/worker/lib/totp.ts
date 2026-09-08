/**
 * TOTP (RFC 6238) — time-based one-time passwords for Owner Command Center MFA.
 *
 * Standard parameters, compatible with Google Authenticator / 1Password / Authy:
 *   algorithm SHA-1, 6 digits, 30-second step, ±1 step drift tolerance.
 *
 * This implements the published RFC, it is not custom cryptography.
 */

const STEP = 30;
const DIGITS = 6;
const B32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** RFC 4648 base32, no padding — used for the shared secret. */
export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Uint8Array {
  const clean = input.replace(/=+$/,"").replace(/\s+/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32_ALPHABET.indexOf(ch);
    if (idx === -1) throw new Error("Invalid base32 character in TOTP secret.");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

/** A fresh 20-byte (160-bit) secret, base32-encoded. */
export function generateTotpSecret(): string {
  return base32Encode(crypto.getRandomValues(new Uint8Array(20)));
}

async function hotp(secret: Uint8Array, counter: number): Promise<string> {
  const buf = new ArrayBuffer(8);
  const view = new DataView(buf);
  // counter is < 2^53; write as big-endian 64-bit
  view.setUint32(0, Math.floor(counter / 2 ** 32));
  view.setUint32(4, counter >>> 0);

  const key = await crypto.subtle.importKey(
    "raw",
    secret,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, buf));
  const offset = mac[mac.length - 1]! & 0x0f;
  const bin =
    ((mac[offset]! & 0x7f) << 24) |
    ((mac[offset + 1]! & 0xff) << 16) |
    ((mac[offset + 2]! & 0xff) << 8) |
    (mac[offset + 3]! & 0xff);
  return (bin % 10 ** DIGITS).toString().padStart(DIGITS, "0");
}

/** Current 6-digit code for a base32 secret. */
export async function totpNow(
  secretB32: string,
  atSeconds = Math.floor(Date.now() / 1000),
): Promise<string> {
  return hotp(base32Decode(secretB32), Math.floor(atSeconds / STEP));
}

/**
 * Constant-time-ish verification against the current step ±1 (clock drift).
 * Returns true on the first match.
 */
export async function verifyTotp(
  secretB32: string,
  code: string,
  atSeconds = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  const cleaned = code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(cleaned)) return false;
  const secret = base32Decode(secretB32);
  const step = Math.floor(atSeconds / STEP);
  for (const c of [step, step - 1, step + 1]) {
    // eslint-disable-next-line no-await-in-loop
    const expected = await hotp(secret, c);
    if (timingSafeEqual(expected, cleaned)) return true;
  }
  return false;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** otpauth:// URI for QR provisioning. `issuer` and `account` are label-only. */
export function otpauthUri(opts: {
  secretB32: string;
  issuer: string;
  account: string;
}): string {
  const label = encodeURIComponent(`${opts.issuer}:${opts.account}`);
  const params = new URLSearchParams({
    secret: opts.secretB32,
    issuer: opts.issuer,
    algorithm: "SHA1",
    digits: String(DIGITS),
    period: String(STEP),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
