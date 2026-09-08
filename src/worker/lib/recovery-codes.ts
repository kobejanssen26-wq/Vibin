/**
 * One-time recovery codes for Owner Command Center MFA.
 * Codes are shown exactly once at generation; only SHA-256 hashes are stored.
 * Regenerating replaces the whole set (old codes stop working).
 */
import { and, eq, isNull } from "drizzle-orm";
import type { Env } from "../env";
import { createDb } from "../db/client";
import { adminRecoveryCodes } from "../db/schema";
import { newId } from "./id";
import { sha256Hex } from "./password";

// Crockford-ish base32, no ambiguous chars.
const ALPHABET = "abcdefghjkmnpqrstvwxyz23456789";
const GROUPS = 3;
const GROUP_LEN = 4;
const COUNT = 10;

function randomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(GROUPS * GROUP_LEN));
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    if (i > 0 && i % GROUP_LEN === 0) out += "-";
    out += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return out; // e.g. "k3m9-pq2r-7tvw"
}

/** Normalise before hashing so display formatting doesn't matter on entry. */
export function normaliseCode(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Replace this owner's recovery codes with a fresh set. Returns the plaintext
 * codes — the ONLY time they exist outside a hash. Caller must show them once.
 */
export async function regenerateRecoveryCodes(
  env: Env,
  userId: string,
): Promise<string[]> {
  const db = createDb(env);
  await db.delete(adminRecoveryCodes).where(eq(adminRecoveryCodes.userId, userId));
  const codes: string[] = [];
  const rows: (typeof adminRecoveryCodes.$inferInsert)[] = [];
  for (let i = 0; i < COUNT; i++) {
    const code = randomCode();
    codes.push(code);
    rows.push({
      id: newId(),
      userId,
      codeHash: await sha256Hex(normaliseCode(code)),
      createdAt: Math.floor(Date.now() / 1000),
    });
  }
  await db.insert(adminRecoveryCodes).values(rows);
  return codes;
}

/** Consume a recovery code. Returns true and marks it used on success. */
export async function consumeRecoveryCode(
  env: Env,
  userId: string,
  input: string,
): Promise<boolean> {
  const hash = await sha256Hex(normaliseCode(input));
  const db = createDb(env);
  const row = await db.query.adminRecoveryCodes.findFirst({
    where: and(
      eq(adminRecoveryCodes.userId, userId),
      eq(adminRecoveryCodes.codeHash, hash),
      isNull(adminRecoveryCodes.usedAt),
    ),
  });
  if (!row) return false;
  await db
    .update(adminRecoveryCodes)
    .set({ usedAt: Math.floor(Date.now() / 1000) })
    .where(eq(adminRecoveryCodes.id, row.id));
  return true;
}

export async function remainingRecoveryCodes(
  env: Env,
  userId: string,
): Promise<number> {
  const db = createDb(env);
  const rows = await db.query.adminRecoveryCodes.findMany({
    where: and(
      eq(adminRecoveryCodes.userId, userId),
      isNull(adminRecoveryCodes.usedAt),
    ),
    columns: { id: true },
  });
  return rows.length;
}
