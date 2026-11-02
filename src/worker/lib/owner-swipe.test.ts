import { describe, expect, it } from "vitest";
import {
  buildQueueWhere,
  isHidden,
  planDecision,
  reliableUrlKey,
  titleKey,
  urlKey,
  visibleStateOf,
  type CurrentState,
} from "./owner-swipe";

const visible = (over: Partial<CurrentState> = {}): CurrentState => ({
  active: 1,
  status: "needs_review",
  decision: null,
  version: 0,
  prevActive: null,
  prevStatus: null,
  auditHidden: null,
  auditPrevActive: null,
  auditPrevStatus: null,
  ...over,
});
const deleted = (over: Partial<CurrentState> = {}): CurrentState =>
  visible({ active: 0, status: "inactive", decision: "delete", version: 3, prevActive: 1, prevStatus: "verified", auditHidden: 1, ...over });

describe("planDecision", () => {
  it("keep on a visible activity changes nothing about the activity (kept ≠ verified)", () => {
    const p = planDecision(visible({ status: "needs_review" }), "keep");
    expect(p.noop).toBe(false);
    expect(p.activity).toBeNull();
    expect(p.audit).toBeNull();
  });

  it("delete hides softly and remembers the visible state to return to", () => {
    const p = planDecision(visible({ status: "verified" }), "delete");
    expect(p.activity).toEqual({ active: 0, status: "inactive" });
    expect(p.audit).toBe("exclude");
    expect(p.prevActive).toBe(1);
    expect(p.prevStatus).toBe("verified");
  });

  it("delete on an activity the audit already hid returns to the audit's previous state", () => {
    const p = planDecision(visible({ active: 0, status: "inactive", auditHidden: 1, auditPrevActive: 1, auditPrevStatus: "verified" }), "delete");
    expect(p.prevStatus).toBe("verified");
    expect(p.activity).toEqual({ active: 0, status: "inactive" });
  });

  it("deleting twice is a no-op, not a second version", () => {
    expect(planDecision(deleted(), "delete").noop).toBe(true);
  });

  it("restoring a deleted activity returns its earlier visible status and un-hides the audit", () => {
    const p = planDecision(deleted(), "keep");
    expect(p.activity).toEqual({ active: 1, status: "verified" });
    expect(p.audit).toBe("restore");
  });

  it("never restores to an inactive/outdated status", () => {
    const p = planDecision(deleted({ prevStatus: "outdated" }), "keep");
    expect(p.activity?.status).toBe("needs_review");
  });

  it("keep overrules an automatic hide (the owner outranks the audit)", () => {
    const p = planDecision(visible({ active: 0, status: "inactive", auditHidden: 1, auditPrevStatus: "needs_review" }), "keep");
    expect(p.activity).toEqual({ active: 1, status: "needs_review" });
    expect(p.audit).toBe("restore");
  });

  it("later never touches the activity", () => {
    const p = planDecision(visible(), "later");
    expect(p.activity).toBeNull();
    expect(p.audit).toBeNull();
  });

  it("later on a deleted activity is refused: restore first", () => {
    expect(() => planDecision(deleted(), "later")).toThrow(/Herstel/);
  });
});

describe("visible state helpers", () => {
  it("knows when an activity is hidden", () => {
    expect(isHidden({ active: 0, status: "needs_review" })).toBe(true);
    expect(isHidden({ active: 1, status: "inactive" })).toBe(true);
    expect(isHidden({ active: 1, status: "verified" })).toBe(false);
  });
  it("visibleStateOf prefers the owner's stored state for a deleted activity", () => {
    expect(visibleStateOf(deleted({ prevStatus: "verified", auditPrevStatus: "needs_review" }))).toEqual({ active: 1, status: "verified" });
  });
});

describe("keys that recognise a deleted venue under a new id", () => {
  it("title key ignores case, accents and punctuation", () => {
    expect(titleKey("Café  Belgica!", "Gent")).toBe(titleKey("cafe belgica", "gent"));
  });
  it("refuses titles too short to be a safe key", () => {
    expect(titleKey("A", "Gent")).toBeNull();
  });
  it("url key drops protocol, www, query and trailing slash", () => {
    expect(urlKey("https://www.Example.be/Path/?x=1")).toBe("example.be/path");
    expect(urlKey("example.be/path/")).toBe("example.be/path");
  });
  it("does not trust social/aggregator pages as a venue identity", () => {
    expect(reliableUrlKey("https://www.facebook.com/somevenue")).toBeNull();
    expect(reliableUrlKey("https://www.tripadvisor.com/Attraction-123")).toBeNull();
    expect(reliableUrlKey("https://www.klimhal.be/")).toBe("klimhal.be");
  });
  it("returns null for junk", () => {
    expect(urlKey("")).toBeNull();
    expect(urlKey("not a url")).toBeNull();
  });
});

describe("buildQueueWhere", () => {
  const base = { review: "unreviewed", research: "any", visibility: "active" } as const;
  it("default view = not reviewed yet and active", () => {
    const w = buildQueueWhere({ ...base });
    expect(w.sql).toContain("d.decision IS NULL OR d.decision = 'none'");
    expect(w.sql).toContain("a.active = 1");
    expect(w.binds).toEqual([]);
  });
  it("the deleted list ignores the visibility filter (deleted rows are always inactive)", () => {
    const w = buildQueueWhere({ ...base, review: "delete" });
    expect(w.sql).not.toContain("a.active");
    expect(w.binds).toEqual(["delete"]);
  });
  it("binds every user value, never interpolates it", () => {
    const evil = "x'); DROP TABLE activities;--";
    const w = buildQueueWhere({ ...base, q: evil, city: evil, email: evil, category: evil, org: evil });
    expect(w.sql).not.toContain("DROP");
    expect(w.binds.filter((b) => String(b).includes("DROP")).length).toBeGreaterThanOrEqual(5);
  });
  it("escapes LIKE wildcards in free text", () => {
    const w = buildQueueWhere({ ...base, q: "100%_done" });
    expect(w.binds[0]).toBe("%100\\%\\_done%");
  });
  it("research filters", () => {
    expect(buildQueueWhere({ ...base, research: "unresearched" }).sql).toContain("r.activity_id IS NULL");
    expect(buildQueueWhere({ ...base, research: "researched" }).sql).toContain("r.activity_id IS NOT NULL");
    expect(buildQueueWhere({ ...base, research: "manual" }).sql).toContain("r.verdict = 'manual'");
  });
});
