import { and, asc, desc, eq, gte, inArray } from "drizzle-orm";
import type { DB } from "../db/client";
import {
  activities,
  activityImages,
  groupMembers,
  groups,
  matches,
  plans,
  profiles,
} from "../db/schema";
import type { PlanDTO } from "@shared/types";
import { toActivityDTO, toPublicUser } from "./dto";
import {
  buildIcs,
  googleCalendarUrl,
} from "./dates";

async function membersOf(db: DB, groupId: string) {
  const rows = await db
    .select({
      userId: groupMembers.userId,
      displayName: profiles.displayName,
      avatarKey: profiles.avatarKey,
      status: groupMembers.status,
    })
    .from(groupMembers)
    .innerJoin(profiles, eq(profiles.userId, groupMembers.userId))
    .where(eq(groupMembers.groupId, groupId));
  return rows
    .filter((r) => r.status === "active" || r.status === "inactive")
    .map((r) => toPublicUser(r));
}

export async function planDTO(
  db: DB,
  planId: string,
  appUrl: string,
): Promise<PlanDTO | null> {
  const plan = await db.query.plans.findFirst({ where: eq(plans.id, planId) });
  if (!plan) return null;
  return planRowToDTO(db, plan, appUrl);
}

export async function planRowToDTO(
  db: DB,
  plan: typeof plans.$inferSelect,
  appUrl: string,
): Promise<PlanDTO> {
  const [activity, group, imgs, members] = await Promise.all([
    db.query.activities.findFirst({ where: eq(activities.id, plan.activityId) }),
    db.query.groups.findFirst({ where: eq(groups.id, plan.groupId) }),
    db
      .select({ url: activityImages.url })
      .from(activityImages)
      .where(eq(activityImages.activityId, plan.activityId))
      .orderBy(asc(activityImages.sort)),
    membersOf(db, plan.groupId),
  ]);
  const activityDTO = toActivityDTO(activity!, imgs.map((i) => i.url));
  const durationMin = activity?.durationMin ?? 120;
  const icsUrl = `${appUrl}/api/plans/${plan.id}/calendar.ics`;
  const googleUrl = plan.startsAt
    ? googleCalendarUrl({
        title: `${activityDTO.title} — with ${group?.name ?? "the group"}`,
        details: `Planned with VIBIN. ${activityDTO.websiteUrl ?? ""}`.trim(),
        location: plan.locationLabel,
        startSec: plan.startsAt,
        durationMin,
      })
    : `${appUrl}/plans/${plan.id}`;

  return {
    id: plan.id,
    groupId: plan.groupId,
    groupName: group?.name ?? "Group",
    activity: activityDTO,
    startsAt: plan.startsAt,
    locationLabel: plan.locationLabel,
    members,
    calendar: { googleUrl, icsUrl },
    createdAt: plan.createdAt,
  };
}

export async function planIcs(
  db: DB,
  planId: string,
): Promise<string | null> {
  const plan = await db.query.plans.findFirst({ where: eq(plans.id, planId) });
  if (!plan || !plan.startsAt) return null;
  const activity = await db.query.activities.findFirst({
    where: eq(activities.id, plan.activityId),
  });
  const group = await db.query.groups.findFirst({
    where: eq(groups.id, plan.groupId),
  });
  return buildIcs({
    uid: plan.id,
    title: `${activity?.title ?? "Activity"} — ${group?.name ?? "VIBIN"}`,
    description: `Planned with VIBIN.${activity?.websiteUrl ? " " + activity.websiteUrl : ""}`,
    location: plan.locationLabel,
    startSec: plan.startsAt,
    durationMin: activity?.durationMin ?? 120,
    url: activity?.bookingUrl ?? activity?.websiteUrl ?? null,
  });
}

/** The soonest upcoming (or most recent) confirmed plan for a group summary. */
export async function activePlanDTO(
  db: DB,
  groupId: string,
  _userId: string,
  appUrl: string,
): Promise<PlanDTO | null> {
  const completeMatches = await db
    .select({ id: matches.id })
    .from(matches)
    .where(and(eq(matches.groupId, groupId), eq(matches.status, "complete")));
  if (completeMatches.length === 0) return null;

  const row = await db.query.plans.findFirst({
    where: eq(plans.groupId, groupId),
    orderBy: [desc(plans.createdAt)],
  });
  if (!row) return null;
  return planRowToDTO(db, row, appUrl);
}
