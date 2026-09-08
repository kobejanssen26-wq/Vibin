/**
 * Application-level authenticated encryption for secrets at rest
 * (Owner Command Center: TOTP secrets, credential vault entries).
 *
 * AES-256-GCM via Web Crypto — a standard, well-reviewed primitive. No custom
 * cryptography. The 256-bit key comes from `env.ENCRYPTION_KEY` (base64 of 32
 * random bytes) and lives only in deployment secrets: never in the database,
 * never sent to the frontend, never logged.
 *
 * Wire format (base64):  [ 12-byte IV | ciphertext | 16-byte GCM tag ]
 */

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64encode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function b64decode(s: string): Uint8Array {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

/** True when a usable key is configured. */
export function hasEncryptionKey(env: { ENCRYPTION_KEY?: string }): boolean {
  return typeof env.ENCRYPTION_KEY === "string" && env.ENCRYPTION_KEY.length > 0;
}

async function importKey(rawB64: string): Promise<CryptoKey> {
  const raw = b64decode(rawB64);
  if (raw.length !== 32) {
    throw new Error(
      "ENCRYPTION_KEY must be base64 of exactly 32 bytes (256 bits).",
    );
  }
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function encryptSecret(
  env: { ENCRYPTION_KEY?: string },
  plaintext: string,
): Promise<string> {
  if (!hasEncryptionKey(env)) {
    throw new Error("ENCRYPTION_KEY is not configured.");
  }
  const key = await importKey(env.ENCRYPTION_KEY!);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(plaintext)),
  );
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv, 0);
  out.set(ct, iv.length);
  return b64encode(out);
}

export async function decryptSecret(
  env: { ENCRYPTION_KEY?: string },
  packedB64: string,
): Promise<string> {
  if (!hasEncryptionKey(env)) {
    throw new Error("ENCRYPTION_KEY is not configured.");
  }
  const key = await importKey(env.ENCRYPTION_KEY!);
  const packed = b64decode(packedB64);
  const iv = packed.slice(0, 12);
  const ct = packed.slice(12);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return dec.decode(pt);
}

/** Generate a fresh 32-byte key, base64-encoded — for `.env` / secret setup. */
export function generateEncryptionKey(): string {
  return b64encode(crypto.getRandomValues(new Uint8Array(32)));
}
