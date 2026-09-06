import { and, asc, eq, ne } from "drizzle-orm";
import type { DB } from "../db/client";
import {
  activities,
  activityImages,
  dateOptions,
  dateVotes,
  groupMembers,
  matches,
  profiles,
} from "../db/schema";
import type {
  DateMatchStateDTO,
  DateOptionDTO,
  MatchDTO,
} from "@shared/types";
import { toActivityDTO, toPublicUser } from "./dto";
import { formatWhen } from "./dates";

export async function groupPublicMembers(db: DB, groupId: string) {
  const rows = await db
    .select({
      userId: groupMembers.userId,
      displayName: profiles.displayName,
      avatarKey: profiles.avatarKey,
      status: groupMembers.status,
    })
    .from(groupMembers)
    .innerJoin(profiles, eq(profiles.userId, groupMembers.userId))
    .where(
      and(
        eq(groupMembers.groupId, groupId),
        ne(groupMembers.status, "removed"),
        ne(groupMembers.status, "left"),
      ),
    );
  return rows.map((r) => toPublicUser(r));
}

export async function matchDTO(
  db: DB,
  matchId: string,
): Promise<MatchDTO | null> {
  const m = await db.query.matches.findFirst({ where: eq(matches.id, matchId) });
  if (!m) return null;
  const [activity, imgs, members] = await Promise.all([
    db.query.activities.findFirst({ where: eq(activities.id, m.activityId) }),
    db
      .select({ url: activityImages.url })
      .from(activityImages)
      .where(eq(activityImages.activityId, m.activityId))
      .orderBy(asc(activityImages.sort)),
    groupPublicMembers(db, m.groupId),
  ]);
  return {
    id: m.id,
    groupId: m.groupId,
    status: m.status,
    activity: toActivityDTO(activity!, imgs.map((i) => i.url)),
    members,
    startsAt: m.startsAt,
    needsDateMatch: m.status === "activity_matched" && m.startsAt == null,
    matchedAt: m.matchedAt,
  };
}

export async function dateMatchStateDTO(
  db: DB,
  matchId: string,
  userId: string,
): Promise<DateMatchStateDTO | null> {
  const m = await db.query.matches.findFirst({ where: eq(matches.id, matchId) });
  if (!m) return null;

  const [activity, opts, votes, members] = await Promise.all([
    db.query.activities.findFirst({ where: eq(activities.id, m.activityId) }),
    db
      .select()
      .from(dateOptions)
      .where(eq(dateOptions.matchId, matchId))
      .orderBy(asc(dateOptions.startsAt)),
    db.select().from(dateVotes).where(eq(dateVotes.matchId, matchId)),
    groupPublicMembers(db, m.groupId),
  ]);

  const activeIds = await db
    .select({ userId: groupMembers.userId })
    .from(groupMembers)
    .where(
      and(eq(groupMembers.groupId, m.groupId), eq(groupMembers.status, "active")),
    );
  const total = activeIds.length;

  const options: DateOptionDTO[] = opts.map((o) => {
    const cast = votes.filter((v) => v.dateOptionId === o.id);
    const yes = cast.filter((v) => v.value === "yes").length;
    const no = cast.filter((v) => v.value === "no").length;
    const maybe = cast.filter((v) => v.value === "maybe").length;
    const mine = cast.find((v) => v.userId === userId)?.value ?? null;
    return {
      id: o.id,
      startsAt: o.startsAt,
      label: o.label || formatWhen(o.startsAt),
      yourVote: mine,
      tally: { yes, no, maybe, notVoted: Math.max(0, total - yes - no - maybe) },
      unanimous: no === 0 && yes + maybe >= total && total > 0,
    };
  });

  const status: DateMatchStateDTO["status"] =
    m.status === "complete"
      ? "matched"
      : options.some((o) => o.unanimous)
        ? "matched"
        : options.some((o) => o.tally.no === 0)
          ? "pending"
          : "no_consensus";

  return {
    matchId,
    activity: toActivityDTO(activity!),
    status,
    options,
    chosenOptionId: m.chosenDateOptionId,
    members,
  };
}
