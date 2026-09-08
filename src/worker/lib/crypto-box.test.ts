import { describe, expect, it } from "vitest";
import {
  decryptSecret,
  encryptSecret,
  generateEncryptionKey,
  hasEncryptionKey,
} from "./crypto-box";

describe("crypto-box (AES-256-GCM secret encryption)", () => {
  it("round-trips a secret and never leaks the plaintext", async () => {
    const env = { ENCRYPTION_KEY: generateEncryptionKey() };
    const packed = await encryptSecret(env, "s3cr3t-provider-password");
    expect(packed).not.toContain("s3cr3t");
    expect(packed).toMatch(/^[A-Za-z0-9+/]+=*$/); // base64
    expect(await decryptSecret(env, packed)).toBe("s3cr3t-provider-password");
  });

  it("produces a different ciphertext each time (random IV)", async () => {
    const env = { ENCRYPTION_KEY: generateEncryptionKey() };
    const a = await encryptSecret(env, "same");
    const b = await encryptSecret(env, "same");
    expect(a).not.toEqual(b);
    expect(await decryptSecret(env, a)).toBe("same");
    expect(await decryptSecret(env, b)).toBe("same");
  });

  it("fails to decrypt with the wrong key", async () => {
    const packed = await encryptSecret({ ENCRYPTION_KEY: generateEncryptionKey() }, "x");
    await expect(
      decryptSecret({ ENCRYPTION_KEY: generateEncryptionKey() }, packed),
    ).rejects.toBeTruthy();
  });

  it("rejects tampered ciphertext (GCM auth tag)", async () => {
    const env = { ENCRYPTION_KEY: generateEncryptionKey() };
    const packed = await encryptSecret(env, "authentic");
    const bytes = Uint8Array.from(atob(packed), (c) => c.charCodeAt(0));
    const last = bytes.length - 1;
    bytes[last] = (bytes[last] ?? 0) ^ 0x01;
    const tampered = btoa(String.fromCharCode(...bytes));
    await expect(decryptSecret(env, tampered)).rejects.toBeTruthy();
  });

  it("requires a 32-byte key and reports configuration", async () => {
    expect(hasEncryptionKey({})).toBe(false);
    expect(hasEncryptionKey({ ENCRYPTION_KEY: generateEncryptionKey() })).toBe(true);
    await expect(encryptSecret({ ENCRYPTION_KEY: btoa("too-short") }, "x")).rejects.toThrow();
  });
});
