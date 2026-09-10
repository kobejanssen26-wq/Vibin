/**
 * Loads the vote history the ranker needs and turns it into a RankContext.
 * Kept separate from rank.ts so the scoring maths stays pure + unit-testable.
 */
import { and, desc, eq } from "drizzle-orm";
import type { DB } from "../db/client";
import { activities, activityVotes, groupSettings } from "../db/schema";
import { buildRankContext, type RankContext, type VoteSignalRow } from "./rank";

const PERSONAL_LOOKBACK = 400; // most-recent votes across all this user's groups
const GROUP_LOOKBACK = 600; // most-recent votes in this group (all members)

export async function loadRankContext(
  db: DB,
  groupId: string,
  userId: string,
  groupSize: number,
): Promise<RankContext> {
  const settings = await db.query.groupSettings.findFirst({
    where: eq(groupSettings.groupId, groupId),
  });

  const [personalRows, groupRows] = await Promise.all([
    db
      .select({
        value: activityVotes.value,
        updatedAt: activityVotes.updatedAt,
        categoryId: activities.categoryId,
        subcategory: activities.subcategory,
        tags: activities.tags,
      })
      .from(activityVotes)
      .innerJoin(activities, eq(activities.id, activityVotes.activityId))
      .where(eq(activityVotes.userId, userId))
      .orderBy(desc(activityVotes.updatedAt))
      .limit(PERSONAL_LOOKBACK),
    db
      .select({
        value: activityVotes.value,
        updatedAt: activityVotes.updatedAt,
        categoryId: activities.categoryId,
        subcategory: activities.subcategory,
        tags: activities.tags,
      })
      .from(activityVotes)
      .innerJoin(activities, eq(activities.id, activityVotes.activityId))
      .where(eq(activityVotes.groupId, groupId))
      .orderBy(desc(activityVotes.updatedAt))
      .limit(GROUP_LOOKBACK),
  ]);

  return buildRankContext(
    personalRows as VoteSignalRow[],
    groupRows as VoteSignalRow[],
    {
      origin:
        settings?.lat != null && settings?.lng != null
          ? { lat: settings.lat / 1e6, lng: settings.lng / 1e6 }
          : null,
      radiusKm: settings?.radiusKm ?? 25,
      groupSize,
    },
  );
}

/** True once the group/user has enough signal that ranking beats shuffling. */
export function rankingWorthwhile(ctx: RankContext): boolean {
  return ctx.personal.totalWeight + ctx.group.totalWeight >= 3;
}

export type { RankContext };
