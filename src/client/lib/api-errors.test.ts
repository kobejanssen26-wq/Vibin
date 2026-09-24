import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { API_ERROR_KEYS, localizeApiError } from "./api-errors";
import { setActiveLang } from "./i18n";

beforeEach(() => setActiveLang("en"));
afterEach(() => setActiveLang("en"));

const workerSource = (() => {
  const walk = (d: string): string[] =>
    fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith(".ts") ? [path.join(d, e.name)] : []));
  return walk(path.resolve(__dirname, "../../worker"))
    .filter((f) => !f.endsWith(".test.ts"))
    .map((f) => fs.readFileSync(f, "utf8"))
    .join("\n");
})();

describe("localizeApiError", () => {
  it("leaves everything untouched in English", () => {
    expect(localizeApiError("Email or password is incorrect.")).toBe("Email or password is incorrect.");
  });

  it("translates known worker messages in Dutch and passes unknown ones through", () => {
    setActiveLang("nl");
    expect(localizeApiError("Email or password is incorrect.")).toBe("E-mailadres of wachtwoord is onjuist.");
    expect(localizeApiError("Groups are capped at 12 members.")).toBe("Groepen zijn beperkt tot 12 leden.");
    expect(localizeApiError("Some admin-only thing happened.")).toBe("Some admin-only thing happened.");
  });

  it("only keeps translations for messages the worker still sends", () => {
    const stale = API_ERROR_KEYS.filter((k) => !workerSource.includes(k));
    expect(stale).toEqual([]);
  });
});
