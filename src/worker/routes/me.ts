import { Hono } from "hono";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Env, Vars } from "../env";
import { createDb } from "../db/client";
import {
  activityVotes,
  dateVotes,
  emailTokens,
  groupMembers,
  groups,
  messages,
  notificationPrefs,
  notifications,
  plans,
  profiles,
  pushTokens,
  users,
} from "../db/schema";
import { emailSchema, parseBody, passwordSchema } from "../lib/validate";
import { loadMe } from "../lib/me";
import { planRowToDTO } from "../lib/plan-view";
import { AppError, badRequest, notFound } from "../lib/errors";
import { hashPassword, sha256Hex, verifyPassword } from "../lib/password";
import { destroyAllSessions } from "../lib/session";
import { clearSessionCookie } from "../lib/cookies";
import { newId } from "../lib/id";
import { changeEmailVerifyBody, sendEmail } from "../lib/email";
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

/* ----------------------- push notification tokens ------------------- */
/** Register (or refresh) this device's Expo push token. Idempotent. */
app.post("/push-tokens", async (c) => {
  const body = await parseBody(
    c,
    z.object({
      token: z.string().trim().min(1).max(400),
      platform: z.enum(["ios", "android", "web"]),
      deviceName: z.string().trim().max(120).nullish(),
    }),
  );
  const db = createDb(c.env);
  const now = Math.floor(Date.now() / 1000);
  await db
    .insert(pushTokens)
    .values({
      id: newId(),
      userId: uid(c),
      token: body.token,
      platform: body.platform,
      deviceName: body.deviceName ?? null,
      createdAt: now,
      lastSeenAt: now,
    })
    .onConflictDoUpdate({
      target: pushTokens.token,
      set: { userId: uid(c), platform: body.platform, lastSeenAt: now },
    });
  return c.json({ ok: true });
});

/** Drop this device's token (called on sign-out). */
app.delete("/push-tokens", async (c) => {
  const body = await parseBody(c, z.object({ token: z.string().min(1).max(400) }));
  const db = createDb(c.env);
  await db.delete(pushTokens).where(eq(pushTokens.token, body.token));
  return c.json({ ok: true });
});

/* ----------------------- plans across all groups -------------------- */
/** Every plan from a group the user is in — for the mobile "Plans" tab. */
app.get("/plans", async (c) => {
  const db = createDb(c.env);
  const memberships = await db
    .select({ groupId: groupMembers.groupId })
    .from(groupMembers)
    .where(
      and(
        eq(groupMembers.userId, uid(c)),
        inArray(groupMembers.status, ["active", "inactive"]),
      ),
    );
  const groupIds = memberships.map((m) => m.groupId);
  if (groupIds.length === 0) return c.json({ plans: [] });

  const rows = await db
    .select()
    .from(plans)
    .where(inArray(plans.groupId, groupIds))
    .orderBy(desc(plans.createdAt))
    .limit(100);

  const dtos = await Promise.all(
    rows.map((p) => planRowToDTO(db, p, c.env.APP_URL)),
  );
  // upcoming first (nulls / past last), then most-recently created
  dtos.sort((a, b) => {
    const now = Math.floor(Date.now() / 1000);
    const av = a.startsAt && a.startsAt >= now ? a.startsAt : Infinity;
    const bv = b.startsAt && b.startsAt >= now ? b.startsAt : Infinity;
    return av - bv;
  });
  return c.json({ plans: dtos });
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

/* --------------------------- security settings -------------------------- */
app.patch("/password", async (c) => {
  const body = await parseBody(
    c,
    z.object({ currentPassword: z.string().min(1).max(200), newPassword: passwordSchema }),
  );
  const db = createDb(c.env);
  const userId = uid(c);
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) throw notFound();
  const { ok } = await verifyPassword(body.currentPassword, user.passwordHash);
  if (!ok) throw badRequest("Current password is incorrect.");

  await db
    .update(users)
    .set({ passwordHash: await hashPassword(body.newPassword), updatedAt: Math.floor(Date.now() / 1000) })
    .where(eq(users.id, userId));
  return c.json({ ok: true });
});

app.patch("/email", async (c) => {
  const body = await parseBody(
    c,
    z.object({ newEmail: emailSchema, currentPassword: z.string().min(1).max(200) }),
  );
  const db = createDb(c.env);
  const userId = uid(c);
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) throw notFound();
  const { ok } = await verifyPassword(body.currentPassword, user.passwordHash);
  if (!ok) throw badRequest("Current password is incorrect.");

  const normalized = body.newEmail.toLowerCase();
  if (normalized === user.emailNormalized) throw badRequest("That's already your email.");
  const taken = await db.query.users.findFirst({ where: eq(users.emailNormalized, normalized) });
  if (taken) throw badRequest("That email is already in use.");

  const now = Math.floor(Date.now() / 1000);
  await db
    .update(users)
    .set({ email: body.newEmail, emailNormalized: normalized, emailVerifiedAt: null, updatedAt: now })
    .where(eq(users.id, userId));

  const token = crypto.randomUUID();
  await db.insert(emailTokens).values({
    id: newId(),
    userId,
    kind: "verify",
    tokenHash: await sha256Hex(token),
    expiresAt: now + 24 * 3600,
    createdAt: now,
  });
  await sendEmail(c.env, {
    to: body.newEmail,
    subject: "Confirm your new VIBIN email",
    text: changeEmailVerifyBody(`${c.env.APP_URL}/verify-email?token=${token}`),
  });

  return c.json({ ok: true, email: body.newEmail });
});

export default app;
