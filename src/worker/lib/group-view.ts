import { and, eq, inArray, ne } from "drizzle-orm";
import type { DB } from "../db/client";
import {
  groupMembers,
  groupSettings,
  matches,
  profiles,
} from "../db/schema";
import type { Group } from "../db/schema";
import type { GroupDTO, GroupSettingsDTO } from "@shared/types";
import { toGroupMemberDTO } from "./dto";
import { groupHasKnownDate } from "../engine/match";
import type { CategoryId } from "@shared/constants";

export function settingsToDTO(
  s: typeof groupSettings.$inferSelect | undefined,
): GroupSettingsDTO | null {
  if (!s) return null;
  return {
    categories: JSON.parse(s.categories) as CategoryId[],
    allActivities: s.allActivities === 1,
    locationLabel: s.locationLabel,
    lat: s.lat != null ? s.lat / 1e6 : null,
    lng: s.lng != null ? s.lng / 1e6 : null,
    radiusKm: s.radiusKm,
    budgetBand: s.budgetBand,
    dateMode: s.dateMode,
    dateSpecific: s.dateSpecific,
    timeBand: s.timeBand,
    timeSpecific: s.timeSpecific,
    dateKnown: groupHasKnownDate(s.dateMode),
  };
}

export async function buildGroupDTO(
  db: DB,
  group: Group,
  currentUserId: string,
  appUrl: string,
): Promise<GroupDTO> {
  const memberRows = await db
    .select({
      m: groupMembers,
      displayName: profiles.displayName,
      avatarKey: profiles.avatarKey,
    })
    .from(groupMembers)
    .innerJoin(profiles, eq(profiles.userId, groupMembers.userId))
    .where(
      and(
        eq(groupMembers.groupId, group.id),
        ne(groupMembers.status, "removed"),
        ne(groupMembers.status, "left"),
      ),
    );

  const members = memberRows
    .map((r) =>
      toGroupMemberDTO(r.m, { displayName: r.displayName, avatarKey: r.avatarKey }, currentUserId),
    )
    .sort((a, b) => (a.role === "creator" ? -1 : b.role === "creator" ? 1 : a.joinedAt - b.joinedAt));

  const settingsRow = await db.query.groupSettings.findFirst({
    where: eq(groupSettings.groupId, group.id),
  });

  const invite = await db.query.groupInvites.findFirst({
    where: (i, { and: a, eq: e, isNull }) =>
      a(e(i.groupId, group.id), isNull(i.revokedAt)),
  });

  return {
    id: group.id,
    name: group.name,
    status: group.status,
    createdAt: group.createdAt,
    isCreator: group.creatorId === currentUserId,
    memberCount: members.length,
    activeMemberCount: members.filter((m) => m.status === "active").length,
    settings: settingsToDTO(settingsRow),
    members,
    inviteCode: invite?.code ?? null,
    inviteUrl: invite ? `${appUrl}/join/${invite.code}` : null,
  };
}

export async function matchCountFor(db: DB, groupId: string): Promise<number> {
  const rows = await db
    .select({ id: matches.id })
    .from(matches)
    .where(
      and(eq(matches.groupId, groupId), inArray(matches.status, ["activity_matched", "complete"])),
    );
  return rows.length;
}
