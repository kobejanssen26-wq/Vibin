import { and, eq, ne, sql } from "drizzle-orm";
import type { DB } from "../db/client";
import { groupMembers, messages, notifications } from "../db/schema";
import { newId } from "./id";
import { chunk, rowsPerInsert } from "./chunk";
import { pushToUsers } from "./push";

export async function notifyUsers(
  db: DB,
  userIds: string[],
  n: { kind: string; title: string; body?: string; data?: Record<string, unknown> },
): Promise<void> {
  if (userIds.length === 0) return;
  const now = Math.floor(Date.now() / 1000);
  const rows = userIds.map((userId) => ({
    id: newId(),
    userId,
    kind: n.kind,
    title: n.title,
    body: n.body ?? "",
    data: JSON.stringify(n.data ?? {}),
    createdAt: now,
  }));
  for (const batch of chunk(rows, rowsPerInsert(7))) {
    await db.insert(notifications).values(batch);
  }
  // Fan out to the mobile apps. Best-effort: pushToUsers never throws.
  await pushToUsers(db, userIds, n);
}

export async function notifyGroup(
  db: DB,
  groupId: string,
  exceptUserId: string | null,
  n: { kind: string; title: string; body?: string; data?: Record<string, unknown> },
): Promise<void> {
  const rows = await db
    .select({ userId: groupMembers.userId })
    .from(groupMembers)
    .where(
      and(
        eq(groupMembers.groupId, groupId),
        ne(groupMembers.status, "removed"),
        ne(groupMembers.status, "left"),
      ),
    );
  const targets = rows
    .map((r) => r.userId)
    .filter((id) => id !== exceptUserId);
  await notifyUsers(db, targets, { ...n, data: { groupId, ...n.data } });
}

/**
 * Wipe a former member's existing notifications for one group — called when
 * they leave or get removed, so nothing about a group they can no longer
 * open lingers in their notification list. notifyGroup already excludes
 * left/removed members from *future* notifications; this handles the ones
 * already sent before they left.
 */
export async function clearGroupNotifications(
  db: DB,
  userId: string,
  groupId: string,
): Promise<void> {
  await db
    .delete(notifications)
    .where(
      and(
        eq(notifications.userId, userId),
        sql`json_extract(${notifications.data}, '$.groupId') = ${groupId}`,
      ),
    );
}

/** Post a system message into the group chat (match / date / plan events). */
export async function systemMessage(
  db: DB,
  groupId: string,
  body: string,
  meta: Record<string, unknown> = {},
): Promise<void> {
  await db.insert(messages).values({
    id: newId(),
    groupId,
    userId: null,
    kind: "system",
    body,
    meta: JSON.stringify(meta),
    createdAt: Math.floor(Date.now() / 1000),
  });
}
