/**
 * Password hashing with PBKDF2-SHA-256 via Web Crypto.
 *
 * The Cloudflare Workers runtime caps a single PBKDF2 call at 100 000
 * iterations, so we CHAIN several rounds: the output of one 100k round is fed
 * as the input key material of the next. `ROUNDS` rounds ≈ `ROUNDS * 100k`
 * effective iterations.
 *
 * Stored format (self-describing so parameters can be raised later and old
 * hashes upgraded on next login):
 *
 *   pbkdf2$<iterPerRound>x<rounds>$<saltB64>$<hashB64>
 */
const ITER_PER_ROUND = 100_000;
const ROUNDS = 6; // ≈ 600k effective iterations (OWASP-recommended ballpark)
const KEY_LEN = 32;
const enc = new TextEncoder();

function toB64(buf: ArrayBuffer | ArrayBufferLike | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return btoa(String.fromCharCode(...bytes));
}
function fromB64(s: string): Uint8Array {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

async function pbkdf2Once(
  keyMaterial: ArrayBuffer | Uint8Array,
  salt: Uint8Array,
  iterations: number,
): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey(
    "raw",
    keyMaterial as BufferSource,
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  return crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    KEY_LEN * 8,
  );
}

async function deriveChained(
  password: string,
  salt: Uint8Array,
  iterPerRound: number,
  rounds: number,
): Promise<Uint8Array> {
  let out: ArrayBuffer = await pbkdf2Once(enc.encode(password), salt, iterPerRound);
  for (let i = 1; i < rounds; i++) {
    out = await pbkdf2Once(new Uint8Array(out), salt, iterPerRound);
  }
  return new Uint8Array(out);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await deriveChained(password, salt, ITER_PER_ROUND, ROUNDS);
  return `pbkdf2$${ITER_PER_ROUND}x${ROUNDS}$${toB64(salt)}$${toB64(hash)}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<{ ok: boolean; needsRehash: boolean }> {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") {
    return { ok: false, needsRehash: false };
  }
  const [iterStr, roundStr] = (parts[1] ?? "").split("x");
  const iterPerRound = Number(iterStr);
  const rounds = Number(roundStr ?? "1") || 1;
  if (!iterPerRound) return { ok: false, needsRehash: false };

  const salt = fromB64(parts[2]!);
  const expected = fromB64(parts[3]!);
  const actual = await deriveChained(password, salt, iterPerRound, rounds);

  if (actual.length !== expected.length) return { ok: false, needsRehash: false };
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual[i]! ^ expected[i]!;
  return {
    ok: diff === 0,
    needsRehash: iterPerRound * rounds < ITER_PER_ROUND * ROUNDS,
  };
}

/** SHA-256 hex — used to store email verification / reset tokens at rest. */
export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(input));
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
