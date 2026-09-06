/**
 * Password hashing with PBKDF2-SHA-256 via the Web Crypto API (available on
 * Workers with no native dependency). Format stored in `users.password_hash`:
 *
 *   pbkdf2$<iterations>$<saltB64>$<hashB64>
 *
 * Verification is constant-time. Iteration count is versioned in the string so
 * it can be raised later and old hashes upgraded on next login.
 */
const ITERATIONS = 210_000;
const KEY_LEN = 32;
const enc = new TextEncoder();

function toB64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
function fromB64(s: string): Uint8Array {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

async function derive(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<ArrayBuffer> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  return crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    keyMaterial,
    KEY_LEN * 8,
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt, ITERATIONS);
  return `pbkdf2$${ITERATIONS}$${toB64(salt.buffer)}$${toB64(hash)}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<{ ok: boolean; needsRehash: boolean }> {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return { ok: false, needsRehash: false };
  const iterations = Number(parts[1]);
  const salt = fromB64(parts[2]!);
  const expected = fromB64(parts[3]!);
  const actual = new Uint8Array(await derive(password, salt, iterations));

  if (actual.length !== expected.length) return { ok: false, needsRehash: false };
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual[i]! ^ expected[i]!;
  return { ok: diff === 0, needsRehash: iterations < ITERATIONS };
}

/** SHA-256 hex — used to store email verification / reset tokens at rest. */
export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(input));
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
