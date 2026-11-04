import { describe, expect, it } from "vitest";
import {
  PREVIEW_PASS_DAYS,
  makeStoredCode,
  normalizeCode,
  safeEqual,
  signPass,
  verifyCode,
  verifyPass,
} from "./preview-access";

describe("preview access code", () => {
  it("accepts the right code and rejects a wrong one", async () => {
    const stored = await makeStoredCode("K7QM-2XZP-9HTA");
    expect(await verifyCode(stored, "K7QM-2XZP-9HTA")).toBe(true);
    expect(await verifyCode(stored, "K7QM-2XZP-9HTB")).toBe(false);
    expect(await verifyCode(stored, "")).toBe(false);
  });

  it("ignores case, spaces and dashes when typing the code", async () => {
    const stored = await makeStoredCode("K7QM-2XZP-9HTA");
    expect(await verifyCode(stored, "k7qm 2xzp 9hta")).toBe(true);
    expect(await verifyCode(stored, "K7QM2XZP9HTA")).toBe(true);
    expect(normalizeCode(" ab-cd ef ")).toBe("ABCDEF");
  });

  it("never stores the code and salts every hash", async () => {
    const a = await makeStoredCode("same-code-123");
    const b = await makeStoredCode("same-code-123");
    expect(a).not.toBe(b);
    expect(a).not.toContain("SAMECODE123");
    expect(a).not.toContain("same-code-123");
    expect(a).toMatch(/^[0-9a-f]{24}:[0-9a-f]{64}$/);
  });

  it("fails closed when nothing is stored or the stored value is malformed", async () => {
    expect(await verifyCode(null, "anything")).toBe(false);
    expect(await verifyCode("", "anything")).toBe(false);
    expect(await verifyCode("nocolon", "anything")).toBe(false);
  });

  it("safeEqual compares values of equal length only", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});

describe("preview pass cookie", () => {
  it("a freshly signed pass verifies and expires after the configured days", async () => {
    const stored = await makeStoredCode("hunter2-hunter2");
    const now = 1_800_000_000;
    const pass = await signPass(stored, now);
    expect(await verifyPass(stored, pass, now + 60)).toBe(true);
    expect(await verifyPass(stored, pass, now + PREVIEW_PASS_DAYS * 86400 - 1)).toBe(true);
    expect(await verifyPass(stored, pass, now + PREVIEW_PASS_DAYS * 86400 + 1)).toBe(false);
  });

  it("rejects a tampered expiry, a tampered signature and garbage", async () => {
    const stored = await makeStoredCode("hunter2-hunter2");
    const now = 1_800_000_000;
    const pass = await signPass(stored, now);
    const [exp, sig] = pass.split(".");
    expect(await verifyPass(stored, `${Number(exp) + 99999}.${sig}`, now)).toBe(false);
    expect(await verifyPass(stored, `${exp}.${sig!.replace(/.$/, sig!.endsWith("0") ? "1" : "0")}`, now)).toBe(false);
    expect(await verifyPass(stored, "garbage", now)).toBe(false);
    expect(await verifyPass(stored, "", now)).toBe(false);
    expect(await verifyPass(stored, undefined, now)).toBe(false);
  });

  it("changing or clearing the code invalidates every earlier pass", async () => {
    const oldStored = await makeStoredCode("old-code-1234");
    const newStored = await makeStoredCode("new-code-5678");
    const now = 1_800_000_000;
    const pass = await signPass(oldStored, now);
    expect(await verifyPass(oldStored, pass, now)).toBe(true);
    expect(await verifyPass(newStored, pass, now)).toBe(false);
    expect(await verifyPass("", pass, now)).toBe(false);
    expect(await verifyPass(null, pass, now)).toBe(false);
  });
});
