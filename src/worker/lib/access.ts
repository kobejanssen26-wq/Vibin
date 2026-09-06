/**
 * Authorization helpers. Every group-scoped route MUST call requireGroupMember
 * (or requireGroupCreator) with the authenticated userId BEFORE touching group
 * data. This is the single choke point that prevents IDOR — changing a groupId
 * in the URL can never expose another group's data.
 */
import { and, eq } from "drizzle-orm";
import type { DB } from "../db/client";
import { groupMembers, groups } from "../db/schema";
import { forbidden, notFound } from "./errors";
import type { Group, GroupMember } from "../db/schema";

export interface GroupAccess {
  group: Group;
  membership: GroupMember;
  isCreator: boolean;
  isActive: boolean;
}

export async function loadGroupAccess(
  db: DB,
  groupId: string,
  userId: string,
): Promise<GroupAccess> {
  const group = await db.query.groups.findFirst({
    where: eq(groups.id, groupId),
  });
  if (!group) throw notFound("That group doesn't exist.");

  const membership = await db.query.groupMembers.findFirst({
    where: and(
      eq(groupMembers.groupId, groupId),
      eq(groupMembers.userId, userId),
    ),
  });
  if (!membership || membership.status === "removed" || membership.status === "left") {
    throw forbidden("You're not a member of this group.");
  }

  return {
    group,
    membership,
    isCreator: group.creatorId === userId,
    isActive: membership.status === "active",
  };
}

export async function requireGroupMember(
  db: DB,
  groupId: string,
  userId: string,
): Promise<GroupAccess> {
  return loadGroupAccess(db, groupId, userId);
}

export async function requireGroupCreator(
  db: DB,
  groupId: string,
  userId: string,
): Promise<GroupAccess> {
  const access = await loadGroupAccess(db, groupId, userId);
  if (!access.isCreator) throw forbidden("Only the group creator can do that.");
  return access;
}

export async function requireActiveMember(
  db: DB,
  groupId: string,
  userId: string,
): Promise<GroupAccess> {
  const access = await loadGroupAccess(db, groupId, userId);
  if (!access.isActive) {
    throw forbidden("You're currently marked inactive in this group.");
  }
  return access;
}

/** user ids of members who currently count toward a unanimous match. */
export async function activeMemberIds(
  db: DB,
  groupId: string,
): Promise<string[]> {
  const rows = await db
    .select({ userId: groupMembers.userId })
    .from(groupMembers)
    .where(
      and(
        eq(groupMembers.groupId, groupId),
        eq(groupMembers.status, "active"),
      ),
    );
  return rows.map((r) => r.userId);
}
