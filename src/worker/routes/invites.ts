import { Hono } from "hono";
import { and, eq, ne } from "drizzle-orm";
import type { Env, Vars } from "../env";
import { createDb } from "../db/client";
import { groupInvites, groupMembers, groups } from "../db/schema";
import { badRequest, notFound } from "../lib/errors";
import { newId } from "../lib/id";
import { buildGroupDTO } from "../lib/group-view";
import { systemMessage, notifyGroup } from "../lib/notify";
import { LIMITS } from "@shared/constants";

type Ctx = { Bindings: Env; Variables: Vars };
const app = new Hono<Ctx>();

const uid = (c: { get: (k: "userId") => string | null }) => c.get("userId")!;

async function loadInvite(db: ReturnType<typeof createDb>, code: string) {
  const invite = await db.query.groupInvites.findFirst({
    where: eq(groupInvites.code, code.toUpperCase()),
  });
  if (!invite) throw notFound("That invite link isn't valid.");
  const now = Math.floor(Date.now() / 1000);
  if (invite.revokedAt) throw badRequest("This invite link has been revoked.");
  if (invite.expiresAt && invite.expiresAt < now) {
    throw badRequest("This invite link has expired. Ask for a new one.");
  }
  if (invite.maxUses != null && invite.uses >= invite.maxUses) {
    throw badRequest("This invite link has already been used up.");
  }
  const group = await db.query.groups.findFirst({
    where: eq(groups.id, invite.groupId),
  });
  if (!group || group.status === "archived") {
    throw notFound("That group is no longer available.");
  }
  return { invite, group };
}

/* ------------------------------ preview ------------------------------- */
app.get("/:code", async (c) => {
  const db = createDb(c.env);
  const { group } = await loadInvite(db, c.req.param("code"));
  const members = await db
    .select({ id: groupMembers.id })
    .from(groupMembers)
    .where(
      and(
        eq(groupMembers.groupId, group.id),
        ne(groupMembers.status, "removed"),
        ne(groupMembers.status, "left"),
      ),
    );
  const existing = await db.query.groupMembers.findFirst({
    where: and(
      eq(groupMembers.groupId, group.id),
      eq(groupMembers.userId, uid(c)),
    ),
  });
  return c.json({
    invite: {
      groupId: group.id,
      groupName: group.name,
      groupStatus: group.status,
      memberCount: members.length,
      alreadyMember:
        !!existing && existing.status !== "removed" && existing.status !== "left",
    },
  });
});

/* ------------------------------- join -------------------------------- */
app.post("/:code/join", async (c) => {
  const db = createDb(c.env);
  const userId = uid(c);
  const { invite, group } = await loadInvite(db, c.req.param("code"));

  const activeCount = await db
    .select({ id: groupMembers.id })
    .from(groupMembers)
    .where(
      and(eq(groupMembers.groupId, group.id), eq(groupMembers.status, "active")),
    );
  const existing = await db.query.groupMembers.findFirst({
    where: and(
      eq(groupMembers.groupId, group.id),
      eq(groupMembers.userId, userId),
    ),
  });

  if (existing && (existing.status === "active" || existing.status === "inactive")) {
    return c.json({
      group: await buildGroupDTO(db, group, userId, c.env.APP_URL),
      alreadyMember: true,
    });
  }
  if (activeCount.length >= LIMITS.maxActiveMembers && !existing) {
    throw badRequest(`Groups are capped at ${LIMITS.maxActiveMembers} members.`);
  }

  const now = Math.floor(Date.now() / 1000);
  if (existing) {
    await db
      .update(groupMembers)
      .set({ status: "active", joinedAt: now })
      .where(
        and(
          eq(groupMembers.groupId, group.id),
          eq(groupMembers.userId, userId),
        ),
      );
  } else {
    await db.insert(groupMembers).values({
      id: newId(),
      groupId: group.id,
      userId,
      role: "member",
      status: "active",
      joinedAt: now,
    });
  }
  await db
    .update(groupInvites)
    .set({ uses: invite.uses + 1 })
    .where(eq(groupInvites.id, invite.id));
  await db.update(groups).set({ updatedAt: now }).where(eq(groups.id, group.id));

  const profile = await db.query.profiles.findFirst({
    where: (p, { eq: e }) => e(p.userId, userId),
    columns: { displayName: true },
  });
  await systemMessage(db, group.id, `${profile?.displayName ?? "Someone"} joined the group. 👋`);
  await notifyGroup(db, group.id, userId, {
    kind: "member_joined",
    title: `${profile?.displayName ?? "Someone"} joined ${group.name}`,
  });

  return c.json({
    group: await buildGroupDTO(db, group, userId, c.env.APP_URL),
    alreadyMember: false,
  });
});

export default app;
