import { describe, expect, it } from "vitest";
import {
  activityVoteProgress,
  evaluateActivityMatch,
  evaluateDateMatch,
  groupHasKnownDate,
  type MemberVote,
  type ActivityVoteValue,
  type DateVoteValue,
} from "./match";

const members = ["kobe", "lisa", "jan"];

function av(userId: string, value: ActivityVoteValue): MemberVote<ActivityVoteValue> {
  return { userId, value };
}

describe("evaluateActivityMatch", () => {
  it("is pending while any active member has not voted", () => {
    const r = evaluateActivityMatch(members, [av("kobe", "like"), av("lisa", "like")]);
    expect(r.status).toBe("pending");
    if (r.status === "pending") {
      expect(r.remaining).toEqual(["jan"]);
      expect(r.votesIn).toBe(2);
      expect(r.total).toBe(3);
    }
  });

  it("2 of 3 like → still no match", () => {
    const r = evaluateActivityMatch(members, [av("kobe", "like"), av("lisa", "like")]);
    expect(r.status).not.toBe("matched");
  });

  it("3 of 3 like → MATCH", () => {
    const r = evaluateActivityMatch(members, [
      av("kobe", "like"),
      av("lisa", "like"),
      av("jan", "like"),
    ]);
    expect(r.status).toBe("matched");
    if (r.status === "matched") expect(r.total).toBe(3);
  });

  it("a single nope rejects the activity even before everyone votes", () => {
    const r = evaluateActivityMatch(members, [av("kobe", "like"), av("lisa", "nope")]);
    expect(r.status).toBe("rejected");
  });

  it("a nope after a full house still rejects", () => {
    const r = evaluateActivityMatch(members, [
      av("kobe", "like"),
      av("lisa", "like"),
      av("jan", "nope"),
    ]);
    expect(r.status).toBe("rejected");
  });

  it("superlike counts as a like and is reported", () => {
    const r = evaluateActivityMatch(members, [
      av("kobe", "superlike"),
      av("lisa", "like"),
      av("jan", "superlike"),
    ]);
    expect(r.status).toBe("matched");
    if (r.status === "matched") expect(r.superlikes.sort()).toEqual(["jan", "kobe"]);
  });

  it("ignores votes from members who are no longer active", () => {
    // "dries" voted, then left the group; only kobe/lisa/jan are active.
    const r = evaluateActivityMatch(members, [
      av("kobe", "like"),
      av("lisa", "like"),
      av("jan", "like"),
      av("dries", "nope"),
    ]);
    expect(r.status).toBe("matched");
  });

  it("a member who joins after voting started keeps the match pending", () => {
    const withNewMember = [...members, "emma"];
    const r = evaluateActivityMatch(withNewMember, [
      av("kobe", "like"),
      av("lisa", "like"),
      av("jan", "like"),
    ]);
    expect(r.status).toBe("pending");
    if (r.status === "pending") expect(r.remaining).toEqual(["emma"]);
  });

  it("solo group: one like is a match", () => {
    const r = evaluateActivityMatch(["kobe"], [av("kobe", "like")]);
    expect(r.status).toBe("matched");
  });

  it("empty active set never matches", () => {
    const r = evaluateActivityMatch([], []);
    expect(r.status).toBe("pending");
  });

  it("re-voting: last value per user wins via caller de-dupe semantics", () => {
    // The route layer upserts, so the engine only ever sees one row per user.
    // But if it sees two, the later filter/Map keeps the last one.
    const r = evaluateActivityMatch(members, [
      av("kobe", "nope"),
      av("kobe", "like"),
      av("lisa", "like"),
      av("jan", "like"),
    ]);
    expect(r.status).toBe("matched");
  });
});

describe("activityVoteProgress", () => {
  it("counts distinct active voters", () => {
    const p = activityVoteProgress(members, [av("kobe", "like"), av("lisa", "nope")]);
    expect(p).toEqual({ voted: 2, total: 3, complete: false });
  });

  it("is complete when every active member has voted", () => {
    const p = activityVoteProgress(members, [
      av("kobe", "like"),
      av("lisa", "like"),
      av("jan", "nope"),
    ]);
    expect(p.complete).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */

function dv(
  userId: string,
  optionId: string,
  value: DateVoteValue,
): MemberVote<DateVoteValue> & { optionId: string } {
  return { userId, optionId, value };
}

const FRI = 1_757_700_000; // arbitrary ascending epoch seconds
const SAT_AFT = 1_757_772_000;
const SAT_EVE = 1_757_793_000;
const SUN = 1_757_876_400;

const dateOpts = [
  { id: "fri", startsAt: FRI },
  { id: "sat_aft", startsAt: SAT_AFT },
  { id: "sat_eve", startsAt: SAT_EVE },
  { id: "sun", startsAt: SUN },
];

describe("evaluateDateMatch", () => {
  it("everyone says yes to one option → matched on it", () => {
    const r = evaluateDateMatch(members, dateOpts, [
      dv("kobe", "sat_eve", "yes"),
      dv("lisa", "sat_eve", "yes"),
      dv("jan", "sat_eve", "yes"),
    ]);
    expect(r.status).toBe("matched");
    if (r.status === "matched") expect(r.chosen.optionId).toBe("sat_eve");
  });

  it("one member says no → that option cannot be chosen", () => {
    // Single option on the table so voting is genuinely finished.
    const oneOpt = [{ id: "sat_eve", startsAt: SAT_EVE }];
    const r = evaluateDateMatch(members, oneOpt, [
      dv("kobe", "sat_eve", "yes"),
      dv("lisa", "sat_eve", "yes"),
      dv("jan", "sat_eve", "no"),
    ]);
    expect(r.status).toBe("no_consensus");
    const satEve = r.options.find((o) => o.optionId === "sat_eve")!;
    expect(satEve.unanimous).toBe(false);
  });

  it("keeps voting (pending) when other options are still untouched", () => {
    const r = evaluateDateMatch(members, dateOpts, [
      dv("kobe", "sat_eve", "yes"),
      dv("lisa", "sat_eve", "yes"),
      dv("jan", "sat_eve", "no"),
    ]);
    expect(r.status).toBe("pending");
  });

  it("pending while nobody blocks but votes are outstanding", () => {
    const r = evaluateDateMatch(members, dateOpts, [
      dv("kobe", "sat_eve", "yes"),
      dv("lisa", "sat_eve", "yes"),
    ]);
    expect(r.status).toBe("pending");
  });

  it("maybe still allows a unanimous match", () => {
    const r = evaluateDateMatch(members, dateOpts, [
      dv("kobe", "sun", "yes"),
      dv("lisa", "sun", "maybe"),
      dv("jan", "sun", "yes"),
    ]);
    expect(r.status).toBe("matched");
    if (r.status === "matched") expect(r.chosen.optionId).toBe("sun");
  });

  it("prefers the option with the most solid yes votes", () => {
    const r = evaluateDateMatch(members, dateOpts, [
      // sat_aft: 2 yes + 1 maybe (unanimous, weaker)
      dv("kobe", "sat_aft", "yes"),
      dv("lisa", "sat_aft", "yes"),
      dv("jan", "sat_aft", "maybe"),
      // sun: 3 yes (unanimous, stronger)
      dv("kobe", "sun", "yes"),
      dv("lisa", "sun", "yes"),
      dv("jan", "sun", "yes"),
    ]);
    expect(r.status).toBe("matched");
    if (r.status === "matched") expect(r.chosen.optionId).toBe("sun");
  });

  it("never auto-picks an option that excludes someone", () => {
    const r = evaluateDateMatch(members, dateOpts, [
      // fri: 2 yes, 1 no  → blocked
      dv("kobe", "fri", "yes"),
      dv("lisa", "fri", "yes"),
      dv("jan", "fri", "no"),
      // everything else fully rejected too
      dv("kobe", "sat_aft", "no"),
      dv("lisa", "sat_aft", "no"),
      dv("jan", "sat_aft", "no"),
      dv("kobe", "sat_eve", "no"),
      dv("lisa", "sat_eve", "no"),
      dv("jan", "sat_eve", "no"),
      dv("kobe", "sun", "no"),
      dv("lisa", "sun", "no"),
      dv("jan", "sun", "no"),
    ]);
    expect(r.status).toBe("no_consensus");
  });

  it("tie on yes-count falls back to the earliest start", () => {
    const r = evaluateDateMatch(members, dateOpts, [
      dv("kobe", "sat_aft", "yes"),
      dv("lisa", "sat_aft", "yes"),
      dv("jan", "sat_aft", "yes"),
      dv("kobe", "sat_eve", "yes"),
      dv("lisa", "sat_eve", "yes"),
      dv("jan", "sat_eve", "yes"),
    ]);
    expect(r.status).toBe("matched");
    if (r.status === "matched") expect(r.chosen.optionId).toBe("sat_aft");
  });
});

describe("groupHasKnownDate", () => {
  it("unknown → false (start date-matching phase)", () => {
    expect(groupHasKnownDate("unknown")).toBe(false);
  });
  it.each(["tonight", "this_weekend", "specific", "this_month"])(
    "%s → true (skip date-matching, complete immediately)",
    (mode) => {
      expect(groupHasKnownDate(mode)).toBe(true);
    },
  );
});
