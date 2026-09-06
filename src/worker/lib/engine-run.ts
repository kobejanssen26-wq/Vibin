/**
 * The transactional bridge between the pure match engine and the database.
 * Both votes.ts and dates.ts funnel through here so the "did this cause a
 * match / a plan?" logic lives in exactly one place.
 *
 * Concurrency: D1 serialises writes, and every caller RE-READS all votes after
 * committing its own vote before evaluating. The matches table has a UNIQUE
 * index on (group_id, activity_id); match creation uses INSERT ... ON CONFLICT
 * DO NOTHING + RETURNING, so two members casting the deciding vote at the same
 * instant can only ever produce one match row — the loser reads it back.
 */
import { and, asc, eq } from "drizzle-orm";
import type { DB } from "../db/client";
import type { Env } from "../env";
import {
  activities,
  activityVotes,
  dateOptions,
  dateVotes,
  groupMembers,
  groupSettings,
  groups,
  matches,
  plans,
} from "../db/schema";
import {
  evaluateActivityMatch,
  evaluateDateMatch,
  groupHasKnownDate,
} from "../engine/match";
import { generateDateOptions, resolveKnownStart } from "./dates";
import { newId } from "./id";
import { notifyGroup, systemMessage } from "./notify";
import { matchDTO } from "./match-view";
import type { MatchDTO } from "@shared/types";

async function activeIds(db: DB, groupId: string): Promise<string[]> {
  const rows = await db
    .select({ userId: groupMembers.userId })
    .from(groupMembers)
    .where(
      and(eq(groupMembers.groupId, groupId), eq(groupMembers.status, "active")),
    );
  return rows.map((r) => r.userId);
}

/** Evaluate one activity for a group; create the match + transition if unanimous. */
export async function runActivityMatch(
  db: DB,
  env: Env,
  groupId: string,
  activityId: string,
  actingUserId: string,
): Promise<MatchDTO | null> {
  const members = await activeIds(db, groupId);
  const votes = await db
    .select({ userId: activityVotes.userId, value: activityVotes.value })
    .from(activityVotes)
    .where(
      and(
        eq(activityVotes.groupId, groupId),
        eq(activityVotes.activityId, activityId),
      ),
    );

  const result = evaluateActivityMatch(members, votes);
  if (result.status !== "matched") return null;

  const now = Math.floor(Date.now() / 1000);
  const created = await db
    .insert(matches)
    .values({
      id: newId(),
      groupId,
      activityId,
      status: "activity_matched",
      matchedAt: now,
      createdAt: now,
    })
    .onConflictDoNothing()
    .returning();

  const match =
    created[0] ??
    (await db.query.matches.findFirst({
      where: and(eq(matches.groupId, groupId), eq(matches.activityId, activityId)),
    }));
  if (!match) return null;
  if (created.length === 0) {
    // Another request already handled this match + transition.
    return matchDTO(db, match.id);
  }

  const activity = await db.query.activities.findFirst({
    where: eq(activities.id, activityId),
  });
  const settings = await db.query.groupSettings.findFirst({
    where: eq(groupSettings.groupId, groupId),
  });

  await systemMessage(
    db,
    groupId,
    `🔥 Everyone matched on ${activity?.title ?? "an activity"}!`,
    { type: "activity_match", matchId: match.id, activityId },
  );

  if (settings && groupHasKnownDate(settings.dateMode)) {
    // §10 — the group already knows when. Skip date voting, complete the plan.
    const startsAt = resolveKnownStart(
      settings.dateMode,
      settings.dateSpecific,
      settings.timeBand,
      settings.timeSpecific,
    );
    await db.batch([
      db
        .update(matches)
        .set({ status: "complete", startsAt, completedAt: now })
        .where(eq(matches.id, match.id)),
      db.insert(plans).values({
        id: newId(),
        groupId,
        matchId: match.id,
        activityId,
        startsAt,
        locationLabel: activity?.locationLabel ?? "",
        createdAt: now,
      }),
      db
        .update(groups)
        .set({ status: "planned", updatedAt: now })
        .where(eq(groups.id, groupId)),
    ]);
    await systemMessage(
      db,
      groupId,
      `🎉 It's a plan! ${activity?.title ?? "Activity"} is locked in.`,
      { type: "plan_confirmed", matchId: match.id },
    );
    await notifyGroup(db, groupId, actingUserId, {
      kind: "plan_confirmed",
      title: `It's a plan — ${activity?.title ?? "your activity"}!`,
      body: "Everyone's going. Open the plan for details.",
      data: { matchId: match.id },
    });
  } else {
    // Start the second matching phase — date/time voting.
    const options = generateDateOptions();
    await db.batch([
      db
        .update(groups)
        .set({ status: "date_matching", updatedAt: now })
        .where(eq(groups.id, groupId)),
      db.insert(dateOptions).values(
        options.map((o, i) => ({
          id: newId(),
          matchId: match.id,
          groupId,
          startsAt: o.startsAt,
          label: o.label,
          sort: i,
          createdAt: now,
        })),
      ),
    ]);
    await systemMessage(
      db,
      groupId,
      `📅 Now let's find a date for ${activity?.title ?? "it"} — vote on the options.`,
      { type: "date_voting_started", matchId: match.id },
    );
    await notifyGroup(db, groupId, actingUserId, {
      kind: "date_voting_started",
      title: `Date voting started for ${activity?.title ?? "your match"}`,
      body: "Say which times work for you.",
      data: { matchId: match.id },
    });
  }

  return matchDTO(db, match.id);
}

/** Evaluate date votes for a match; complete the plan when a slot is unanimous. */
export async function runDateMatch(
  db: DB,
  env: Env,
  matchId: string,
  actingUserId: string,
): Promise<{ completed: boolean }> {
  const match = await db.query.matches.findFirst({
    where: eq(matches.id, matchId),
  });
  if (!match || match.status === "complete") return { completed: false };

  const members = await activeIds(db, match.groupId);
  const opts = await db
    .select()
    .from(dateOptions)
    .where(eq(dateOptions.matchId, matchId))
    .orderBy(asc(dateOptions.startsAt));
  const votes = await db
    .select({
      userId: dateVotes.userId,
      value: dateVotes.value,
      optionId: dateVotes.dateOptionId,
    })
    .from(dateVotes)
    .where(eq(dateVotes.matchId, matchId));

  const result = evaluateDateMatch(
    members,
    opts.map((o) => ({ id: o.id, startsAt: o.startsAt })),
    votes,
  );
  if (result.status !== "matched") return { completed: false };

  const chosen = opts.find((o) => o.id === result.chosen.optionId)!;
  const activity = await db.query.activities.findFirst({
    where: eq(activities.id, match.activityId),
  });
  const now = Math.floor(Date.now() / 1000);

  const done = await db
    .update(matches)
    .set({
      status: "complete",
      chosenDateOptionId: chosen.id,
      startsAt: chosen.startsAt,
      completedAt: now,
    })
    .where(and(eq(matches.id, matchId), eq(matches.status, "activity_matched")))
    .returning();
  if (done.length === 0) return { completed: false }; // someone beat us to it

  await db.batch([
    db.insert(plans).values({
      id: newId(),
      groupId: match.groupId,
      matchId,
      activityId: match.activityId,
      startsAt: chosen.startsAt,
      locationLabel: activity?.locationLabel ?? "",
      createdAt: now,
    }),
    db
      .update(groups)
      .set({ status: "planned", updatedAt: now })
      .where(eq(groups.id, match.groupId)),
  ]);
  await systemMessage(
    db,
    match.groupId,
    `📅 Everyone agreed on ${chosen.label}! It's a plan. 🎉`,
    { type: "plan_confirmed", matchId },
  );
  await notifyGroup(db, match.groupId, actingUserId, {
    kind: "plan_confirmed",
    title: `Date locked: ${chosen.label}`,
    body: `${activity?.title ?? "Your activity"} is fully planned.`,
    data: { matchId },
  });
  return { completed: true };
}
