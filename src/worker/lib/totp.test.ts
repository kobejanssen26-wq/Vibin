import { describe, expect, it } from "vitest";
import {
  base32Decode,
  base32Encode,
  generateTotpSecret,
  otpauthUri,
  totpNow,
  verifyTotp,
} from "./totp";

// RFC 6238 Appendix B reference secret (ASCII "12345678901234567890"), SHA-1.
const RFC_SECRET_BYTES = new TextEncoder().encode("12345678901234567890");
const RFC_SECRET_B32 = base32Encode(RFC_SECRET_BYTES);

describe("base32", () => {
  it("round-trips arbitrary bytes", () => {
    const bytes = crypto.getRandomValues(new Uint8Array(20));
    expect([...base32Decode(base32Encode(bytes))]).toEqual([...bytes]);
  });
  it("ignores spacing and case on decode", () => {
    const enc = base32Encode(RFC_SECRET_BYTES);
    const spaced = enc.toLowerCase().replace(/(.{4})/g, "$1 ").trim();
    expect([...base32Decode(spaced)]).toEqual([...RFC_SECRET_BYTES]);
  });
});

describe("TOTP (RFC 6238 SHA-1 vectors)", () => {
  it("matches the published codes (6-digit truncation)", async () => {
    // RFC 6238 8-digit codes are 94287082 / 07081804 / 89005924; VIBIN uses 6.
    expect(await totpNow(RFC_SECRET_B32, 59)).toBe("287082");
    expect(await totpNow(RFC_SECRET_B32, 1111111109)).toBe("081804");
    expect(await totpNow(RFC_SECRET_B32, 1234567890)).toBe("005924");
  });

  it("verifies the current code and rejects wrong ones", async () => {
    const now = 1111111109;
    const code = await totpNow(RFC_SECRET_B32, now);
    expect(await verifyTotp(RFC_SECRET_B32, code, now)).toBe(true);
    expect(await verifyTotp(RFC_SECRET_B32, "000000", now)).toBe(false);
    expect(await verifyTotp(RFC_SECRET_B32, "abc", now)).toBe(false);
  });

  it("tolerates ±1 step of clock drift", async () => {
    const t = 1234567890;
    const prev = await totpNow(RFC_SECRET_B32, t - 30);
    const next = await totpNow(RFC_SECRET_B32, t + 30);
    expect(await verifyTotp(RFC_SECRET_B32, prev, t)).toBe(true);
    expect(await verifyTotp(RFC_SECRET_B32, next, t)).toBe(true);
    // two steps out is rejected
    const far = await totpNow(RFC_SECRET_B32, t - 90);
    expect(await verifyTotp(RFC_SECRET_B32, far, t)).toBe(false);
  });

  it("generates a 32-char base32 secret and a scannable URI", () => {
    const s = generateTotpSecret();
    expect(s).toMatch(/^[A-Z2-7]{32}$/);
    const uri = otpauthUri({ secretB32: s, issuer: "VIBIN Owner", account: "me@x.com" });
    expect(uri).toContain("otpauth://totp/");
    expect(uri).toContain(`secret=${s}`);
    expect(uri).toContain("algorithm=SHA1");
    expect(uri).toContain("digits=6");
  });
});
