import { Hono } from "hono";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Env, Vars } from "../env";
import { createDb } from "../db/client";
import {
  activityVotes,
  dateVotes,
  groupMembers,
  groups,
  messages,
  notificationPrefs,
  notifications,
  profiles,
  users,
} from "../db/schema";
import { parseBody } from "../lib/validate";
import { loadMe } from "../lib/me";
import { AppError, badRequest, notFound } from "../lib/errors";
import { verifyPassword } from "../lib/password";
import { destroyAllSessions } from "../lib/session";
import { clearSessionCookie } from "../lib/cookies";
import { newId } from "../lib/id";
import type { NotificationDTO } from "@shared/types";
import { LIMITS } from "@shared/constants";

type Ctx = { Bindings: Env; Variables: Vars };
const app = new Hono<Ctx>();

const uid = (c: { get: (k: "userId") => string | null }) => c.get("userId")!;

app.get("/", async (c) => {
  const db = createDb(c.env);
  return c.json({ user: await loadMe(db, uid(c)) });
});

app.patch("/", async (c) => {
  const body = await parseBody(
    c,
    z.object({
      displayName: z
        .string()
        .trim()
        .min(LIMITS.displayName.min)
        .max(LIMITS.displayName.max)
        .optional(),
      age: z.number().int().min(13).max(120).nullable().optional(),
      locationLabel: z.string().trim().max(120).nullable().optional(),
      bio: z.string().trim().max(LIMITS.bio.max).nullable().optional(),
    }),
  );
  const db = createDb(c.env);
  await db
    .update(profiles)
    .set({ ...body, updatedAt: Math.floor(Date.now() / 1000) })
    .where(eq(profiles.userId, uid(c)));
  return c.json({ user: await loadMe(db, uid(c)) });
});

app.post("/avatar", async (c) => {
  if (!c.env.MEDIA) {
    throw new AppError(
      503,
      "unavailable",
      "Photo uploads aren't enabled on this deployment yet.",
    );
  }
  const form = await c.req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw badRequest("No file uploaded.");
  if (file.size > 5 * 1024 * 1024) throw badRequest("Image must be under 5 MB.");
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw badRequest("Use a JPEG, PNG or WebP image.");
  }
  const ext = file.type.split("/")[1]!.replace("jpeg", "jpg");
  const key = `avatars/${uid(c)}/${newId()}.${ext}`;
  await c.env.MEDIA!.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type },
  });
  const db = createDb(c.env);
  await db
    .update(profiles)
    .set({ avatarKey: key, updatedAt: Math.floor(Date.now() / 1000) })
    .where(eq(profiles.userId, uid(c)));
  return c.json({ user: await loadMe(db, uid(c)) });
});

/* --------------------------- notifications ---------------------------- */
app.get("/notifications", async (c) => {
  const db = createDb(c.env);
  const rows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, uid(c)))
    .orderBy(desc(notifications.createdAt))
    .limit(50);
  const dto: NotificationDTO[] = rows.map((n) => ({
    id: n.id,
    kind: n.kind,
    title: n.title,
    body: n.body,
    data: JSON.parse(n.data) as Record<string, unknown>,
    read: n.readAt != null,
    createdAt: n.createdAt,
  }));
  return c.json({ notifications: dto, unread: dto.filter((n) => !n.read).length });
});

app.post("/notifications/read", async (c) => {
  const body = await parseBody(
    c,
    z.object({ ids: z.array(z.string()).max(200).optional() }),
  );
  const db = createDb(c.env);
  const now = Math.floor(Date.now() / 1000);
  const cond = body.ids?.length
    ? and(eq(notifications.userId, uid(c)), inArray(notifications.id, body.ids))
    : eq(notifications.userId, uid(c));
  await db.update(notifications).set({ readAt: now }).where(cond);
  return c.json({ ok: true });
});

app.get("/notification-prefs", async (c) => {
  const db = createDb(c.env);
  const row = await db.query.notificationPrefs.findFirst({
    where: eq(notificationPrefs.userId, uid(c)),
  });
  return c.json({ prefs: JSON.parse(row?.channels ?? "{}") });
});

app.put("/notification-prefs", async (c) => {
  const body = await parseBody(c, z.record(z.string(), z.boolean()));
  const db = createDb(c.env);
  await db
    .update(notificationPrefs)
    .set({
      channels: JSON.stringify(body),
      updatedAt: Math.floor(Date.now() / 1000),
    })
    .where(eq(notificationPrefs.userId, uid(c)));
  return c.json({ prefs: body });
});

/* ------------------------ GDPR: export & delete ---------------------- */
app.get("/export", async (c) => {
  const db = createDb(c.env);
  const userId = uid(c);
  const [user, profile, memberships, votes, dVotes, msgs] = await Promise.all([
    db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { passwordHash: false },
    }),
    db.query.profiles.findFirst({ where: eq(profiles.userId, userId) }),
    db.select().from(groupMembers).where(eq(groupMembers.userId, userId)),
    db.select().from(activityVotes).where(eq(activityVotes.userId, userId)),
    db.select().from(dateVotes).where(eq(dateVotes.userId, userId)),
    db.select().from(messages).where(eq(messages.userId, userId)),
  ]);
  return c.json({
    exportedAt: new Date().toISOString(),
    user,
    profile,
    memberships,
    activityVotes: votes,
    dateVotes: dVotes,
    messages: msgs,
  });
});

app.post("/delete", async (c) => {
  const body = await parseBody(c, z.object({ password: z.string().min(1) }));
  const db = createDb(c.env);
  const userId = uid(c);
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) throw notFound();
  const { ok } = await verifyPassword(body.password, user.passwordHash);
  if (!ok) throw badRequest("Password is incorrect.");

  // Reassign or archive groups this user created so co-members aren't orphaned.
  const owned = await db
    .select({ id: groups.id })
    .from(groups)
    .where(eq(groups.creatorId, userId));
  for (const g of owned) {
    const nextCreator = await db.query.groupMembers.findFirst({
      where: and(
        eq(groupMembers.groupId, g.id),
        eq(groupMembers.status, "active"),
      ),
      columns: { userId: true },
    });
    if (nextCreator && nextCreator.userId !== userId) {
      await db.batch([
        db
          .update(groups)
          .set({ creatorId: nextCreator.userId })
          .where(eq(groups.id, g.id)),
        db
          .update(groupMembers)
          .set({ role: "creator" })
          .where(
            and(
              eq(groupMembers.groupId, g.id),
              eq(groupMembers.userId, nextCreator.userId),
            ),
          ),
      ]);
    } else {
      await db.update(groups).set({ status: "archived" }).where(eq(groups.id, g.id));
    }
  }

  await destroyAllSessions(c.env, userId);
  clearSessionCookie(c);
  // Hard delete — FK cascades remove profile, memberships, votes, tokens, etc.
  await db.delete(users).where(eq(users.id, userId));
  return c.json({ ok: true });
});

export default app;
