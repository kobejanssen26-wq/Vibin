import { describe, expect, it } from "vitest";
import { ADMIN_PERMISSIONS, normalizePermissions } from "@shared/constants";
import { canGrant, requiredFor } from "./admin-rbac";

describe("requiredFor (path -> permission)", () => {
  it("maps the developer areas to their permission", () => {
    expect(requiredFor("/activities")).toBe("catalogue");
    expect(requiredFor("/activities/abc/verify")).toBe("catalogue");
    expect(requiredFor("/activities/import/preview")).toBe("catalogue");
    expect(requiredFor("/categories/reorder")).toBe("catalogue");
    expect(requiredFor("/quality/list")).toBe("catalogue");
    expect(requiredFor("/support/tickets/1")).toBe("support");
    expect(requiredFor("/reports/7")).toBe("support");
    expect(requiredFor("/events-coverage")).toBe("events");
    expect(requiredFor("/files/list")).toBe("files.read");
    expect(requiredFor("/team/developers/x")).toBe("team.manage");
  });

  it("keeps everything else owner-only, by default", () => {
    for (const p of [
      "/overview",
      "/search",
      "/users",
      "/users/u1/status",
      "/groups",
      "/settings",
      "/flags/x",
      "/audit",
      "/system",
      "/errors",
      "/funnel",
      "/providers/p1",
      "/vault",
      "/vault/1/reveal",
      "/outreach/orgs",
      "/outreach/send",
      "/swipe/decide",
      "/stats",
      "/quality/shared-emails",
      "/quality/link/a/b",
      "/something-new-in-the-future",
      "/",
    ]) {
      expect(requiredFor(p), p).toBe("owner");
    }
  });

  it("does not let path tricks borrow another area's permission", () => {
    expect(requiredFor("/activitiesx")).toBe("owner");
    expect(requiredFor("/filesystem")).toBe("owner");
    expect(requiredFor("/teams")).toBe("owner");
    expect(requiredFor("//files")).toBe("owner");
  });
});

describe("canGrant", () => {
  it("lets the owner grant anything", () => {
    expect(canGrant("owner", [], ["team.manage", "files.write"])).toBe(true);
  });
  it("limits a delegated manager to what they hold, never team.manage", () => {
    const mine = ["catalogue", "files.read", "team.manage"];
    expect(canGrant("developer", mine, ["catalogue"])).toBe(true);
    expect(canGrant("developer", mine, ["files.write"])).toBe(false);
    expect(canGrant("developer", mine, ["team.manage"])).toBe(false);
    expect(canGrant("developer", mine, [])).toBe(true);
  });
});

describe("normalizePermissions", () => {
  it("drops unknown keys, de-duplicates and keeps a stable order", () => {
    expect(normalizePermissions(["support", "nope", "catalogue", "support", 5, null])).toEqual(["catalogue", "support"]);
    expect(normalizePermissions("catalogue")).toEqual([]);
    expect(normalizePermissions(undefined)).toEqual([]);
  });
  it("files.write implies files.read", () => {
    expect(normalizePermissions(["files.write"])).toEqual(["files.read", "files.write"]);
  });
  it("lists every permission once", () => {
    expect(new Set(ADMIN_PERMISSIONS.map((p) => p.key)).size).toBe(ADMIN_PERMISSIONS.length);
  });
});
