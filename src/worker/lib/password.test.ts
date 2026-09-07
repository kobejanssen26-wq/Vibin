import { describe, expect, it } from "vitest";
import { hashPassword, sha256Hex, verifyPassword } from "./password";

describe("password hashing", () => {
  it("round-trips a correct password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    const { ok } = await verifyPassword("correct horse battery staple", hash);
    expect(ok).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("s3cret-passphrase-1");
    const { ok } = await verifyPassword("s3cret-passphrase-2", hash);
    expect(ok).toBe(false);
  });

  it("stores a self-describing, chained-round format (Workers caps 1 call at 100k)", () => {
    // pbkdf2$<iterPerRound>x<rounds>$<salt>$<hash>
    return hashPassword("x").then((h) => {
      const [scheme, params] = h.split("$");
      expect(scheme).toBe("pbkdf2");
      const [iter, rounds] = params!.split("x").map(Number);
      expect(iter).toBeLessThanOrEqual(100_000);
      expect(rounds).toBeGreaterThanOrEqual(2);
    });
  });

  it("verifies an older, weaker hash and flags it for rehash", async () => {
    // Simulate a hash created with fewer rounds.
    const weak = await hashPassword("legacy-pw");
    const [, , salt, digest] = weak.split("$");
    const downgraded = `pbkdf2$100000x2$${salt}$${digest}`;
    // (digest won't actually match 2 rounds, so ok=false — but the parser must
    //  not throw and must compute needsRehash from the parsed params.)
    const res = await verifyPassword("legacy-pw", downgraded);
    expect(res.needsRehash).toBe(true);
  });

  it("sha256Hex is stable and hex", async () => {
    const a = await sha256Hex("token-abc");
    const b = await sha256Hex("token-abc");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});
