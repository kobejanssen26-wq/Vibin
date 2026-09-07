/**
 * VIBIN match engine — pure, deterministic decision logic.
 *
 * Everything here is a pure function over plain data so it can be unit-tested
 * exhaustively (see match.test.ts) and reused by any route without touching the
 * database. The route layer is responsible for loading rows, calling these
 * functions inside a transaction, and persisting the result.
 *
 * CORE RULE
 * ---------
 * An activity is a MATCH only if EVERY active group member has voted `like`
 * (or `superlike`). A single `nope` — or a single member who has not voted yet
 * — means "no match yet".
 */

export type ActivityVoteValue = "like" | "nope" | "superlike";
export type DateVoteValue = "yes" | "no" | "maybe";

export interface MemberVote<V> {
  userId: string;
  value: V;
}

export type ActivityMatchResult =
  | { status: "pending"; votesIn: number; total: number; remaining: string[] }
  | { status: "rejected"; votesIn: number; total: number }
  | { status: "matched"; votesIn: number; total: number; superlikes: string[] };

/**
 * Evaluate a single activity for a group.
 *
 * @param activeMemberIds  user ids of members whose status === "active"
 * @param votes            every vote cast for THIS activity in THIS group
 */
export function evaluateActivityMatch(
  activeMemberIds: readonly string[],
  votes: readonly MemberVote<ActivityVoteValue>[],
): ActivityMatchResult {
  const active = new Set(activeMemberIds);
  const total = active.size;

  // A group with no active members can never match anything.
  if (total === 0) {
    return { status: "pending", votesIn: 0, total: 0, remaining: [] };
  }

  // Only votes from currently-active members count.
  const relevant = votes.filter((v) => active.has(v.userId));
  const byUser = new Map<string, ActivityVoteValue>();
  for (const v of relevant) byUser.set(v.userId, v.value);

  const votesIn = byUser.size;

  // Any explicit "nope" from an active member kills the match immediately.
  for (const value of byUser.values()) {
    if (value === "nope") return { status: "rejected", votesIn, total };
  }

  const remaining = activeMemberIds.filter((id) => !byUser.has(id));
  if (remaining.length > 0) {
    return { status: "pending", votesIn, total, remaining };
  }

  // Everyone voted and nobody said no  →  unanimous like  →  MATCH.
  const superlikes = activeMemberIds.filter(
    (id) => byUser.get(id) === "superlike",
  );
  return { status: "matched", votesIn, total, superlikes };
}

/* -------------------------------------------------------------------------- */
/*  Date / time matching (second phase)                                      */
/* -------------------------------------------------------------------------- */

export interface DateOptionTally {
  optionId: string;
  startsAt: number;
  yes: number;
  no: number;
  maybe: number;
  notVoted: number;
  /** everyone can make it: no `no`, and no missing votes (maybe counts as ok) */
  unanimous: boolean;
  /** nobody blocks it: no `no`, but some votes still outstanding */
  viable: boolean;
  /** ranking score — higher is better */
  score: number;
}

export type DateMatchResult =
  | { status: "pending"; options: DateOptionTally[] }
  | { status: "no_consensus"; options: DateOptionTally[] }
  | { status: "matched"; chosen: DateOptionTally; options: DateOptionTally[] };

/**
 * Evaluate all proposed date options for a match.
 *
 * Priority order:
 *   1. An option EVERY active member accepts (yes/maybe, none missing, no "no").
 *      Among those, most "yes" wins, then earliest start.
 *   2. If voting is still open and at least one option is not blocked → pending.
 *   3. Otherwise → no_consensus: surface the strongest non-blocked options and
 *      let the group keep voting or add new options. Never auto-pick an option
 *      that excludes someone.
 */
export function evaluateDateMatch(
  activeMemberIds: readonly string[],
  options: readonly { id: string; startsAt: number }[],
  votes: readonly (MemberVote<DateVoteValue> & { optionId: string })[],
): DateMatchResult {
  const active = new Set(activeMemberIds);
  const total = active.size;

  const tallies: DateOptionTally[] = options
    .map((opt) => {
      const cast = votes.filter(
        (v) => v.optionId === opt.id && active.has(v.userId),
      );
      const byUser = new Map<string, DateVoteValue>();
      for (const v of cast) byUser.set(v.userId, v.value);

      let yes = 0;
      let no = 0;
      let maybe = 0;
      for (const val of byUser.values()) {
        if (val === "yes") yes++;
        else if (val === "no") no++;
        else maybe++;
      }
      const notVoted = total - byUser.size;
      const blocked = no > 0;
      const unanimous = !blocked && notVoted === 0;
      const viable = !blocked && !unanimous;

      // Score: strongly reward "yes", mildly reward "maybe", heavily punish
      // any block, gently prefer earlier dates as a tie-breaker.
      const score =
        (blocked ? -1000 : 0) +
        yes * 10 +
        maybe * 3 -
        notVoted * 1 -
        opt.startsAt / 1e12;

      return {
        optionId: opt.id,
        startsAt: opt.startsAt,
        yes,
        no,
        maybe,
        notVoted,
        unanimous,
        viable,
        score,
      };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.yes - a.yes ||
        a.startsAt - b.startsAt,
    );

  const unanimousOptions = tallies
    .filter((t) => t.unanimous)
    .sort((a, b) => b.yes - a.yes || a.startsAt - b.startsAt);

  if (unanimousOptions.length > 0) {
    return { status: "matched", chosen: unanimousOptions[0]!, options: tallies };
  }

  const anyViable = tallies.some((t) => t.viable);
  if (anyViable) return { status: "pending", options: tallies };

  return { status: "no_consensus", options: tallies };
}

/* -------------------------------------------------------------------------- */
/*  Voting progress (for the dashboard / realtime badge)                     */
/* -------------------------------------------------------------------------- */

export interface VoteProgress {
  voted: number;
  total: number;
  complete: boolean;
}

export function activityVoteProgress(
  activeMemberIds: readonly string[],
  votesForActivity: readonly MemberVote<ActivityVoteValue>[],
): VoteProgress {
  const active = new Set(activeMemberIds);
  const voters = new Set(
    votesForActivity.filter((v) => active.has(v.userId)).map((v) => v.userId),
  );
  return {
    voted: voters.size,
    total: active.size,
    complete: voters.size === active.size && active.size > 0,
  };
}

/**
 * Does the group already have a concrete date, so the second matching phase
 * should be SKIPPED and the match completed immediately? (Business rule §10.)
 */
export function groupHasKnownDate(dateMode: string): boolean {
  return dateMode !== "unknown";
}
