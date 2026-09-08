import { Hono, type Context } from "hono";
import { eq } from "drizzle-orm";
import { z } from "zod";
import {
  displayNameSchema,
  emailSchema,
  parseBody,
  passwordSchema,
} from "../lib/validate";
import type { Env, Vars } from "../env";
import { createDb } from "../db/client";
import { emailTokens, notificationPrefs, profiles, users } from "../db/schema";
import { hashPassword, sha256Hex, verifyPassword } from "../lib/password";
import {
  createSession,
  destroyAllSessions,
  destroySession,
  trackUserSession,
} from "../lib/session";
import {
  clearSessionCookie,
  setCsrfCookie,
  setSessionCookie,
} from "../lib/cookies";
import { badRequest, unauthorized } from "../lib/errors";
import { rateLimit, clientIp } from "../lib/ratelimit";
import { newId } from "../lib/id";
import { loadMe } from "../lib/me";
import {
  resetEmailBody,
  sendEmail,
  verifyEmailBody,
} from "../lib/email";

type Ctx = { Bindings: Env; Variables: Vars };
const app = new Hono<Ctx>();

const HOUR = 3600;

async function startSession(c: Context<Ctx>, userId: string) {
  const ua = c.req.header("user-agent") ?? "";
  const { sessionId, csrf } = await createSession(c.env, userId, ua);
  await trackUserSession(c.env, userId, sessionId);
  setSessionCookie(c, sessionId);
  setCsrfCookie(c, csrf);
}

/* ------------------------------- signup --------------------------------- */
app.post("/signup", async (c) => {
  await rateLimit(c.env, "signup", clientIp(c.req.raw), 5, 10 * 60);
  const body = await parseBody(
    c,
    z.object({
      email: emailSchema,
      password: passwordSchema,
      displayName: displayNameSchema,
    }),
  );
  const db = createDb(c.env);
  const normalized = body.email;

  const existing = await db.query.users.findFirst({
    where: eq(users.emailNormalized, normalized),
    columns: { id: true },
  });
  if (existing) {
    throw badRequest("An account with that email already exists.");
  }

  const now = Math.floor(Date.now() / 1000);
  const userId = newId();
  await db.batch([
    db.insert(users).values({
      id: userId,
      email: body.email,
      emailNormalized: normalized,
      passwordHash: await hashPassword(body.password),
      createdAt: now,
      updatedAt: now,
    }),
    db.insert(profiles).values({
      userId,
      displayName: body.displayName,
      updatedAt: now,
    }),
    db.insert(notificationPrefs).values({
      userId,
      channels: JSON.stringify({
        invites: true,
        joins: true,
        activityMatch: true,
        dateVoting: true,
        dateMatch: true,
        upcoming: true,
        messages: true,
      }),
      updatedAt: now,
    }),
  ]);

  // Email verification token (link logged in dev).
  const token = crypto.randomUUID();
  await db.insert(emailTokens).values({
    id: newId(),
    userId,
    kind: "verify",
    tokenHash: await sha256Hex(token),
    expiresAt: now + 24 * HOUR,
    createdAt: now,
  });
  await sendEmail(c.env, {
    to: body.email,
    subject: "Confirm your VIBIN account",
    text: verifyEmailBody(`${c.env.APP_URL}/verify-email?token=${token}`),
  });

  await startSession(c, userId);
  return c.json({ user: await loadMe(db, userId) }, 201);
});

/* -------------------------------- login --------------------------------- */
app.post("/login", async (c) => {
  await rateLimit(c.env, "login", clientIp(c.req.raw), 10, 10 * 60);
  const body = await parseBody(
    c,
    z.object({ email: emailSchema, password: z.string().min(1).max(200) }),
  );
  const db = createDb(c.env);
  const user = await db.query.users.findFirst({
    where: eq(users.emailNormalized, body.email),
  });

  // Always run a hash to blunt user-enumeration timing.
  const stored =
    user?.passwordHash ??
    "pbkdf2$100000x6$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
  const { ok, needsRehash } = await verifyPassword(body.password, stored);

  if (!user || !ok || user.status !== "active") {
    throw unauthorized("Email or password is incorrect.");
  }
  if (needsRehash) {
    await db
      .update(users)
      .set({ passwordHash: await hashPassword(body.password) })
      .where(eq(users.id, user.id));
  }

  await startSession(c, user.id);
  return c.json({ user: await loadMe(db, user.id) });
});

/* -------------------------------- logout -------------------------------- */
app.post("/logout", async (c) => {
  const sid = c.get("sessionId");
  if (sid) await destroySession(c.env, sid);
  clearSessionCookie(c);
  return c.json({ ok: true });
});

/* ------------------------------- session -------------------------------- */
app.get("/session", async (c) => {
  const userId = c.get("userId");
  if (!userId) return c.json({ user: null });
  const db = createDb(c.env);
  return c.json({ user: await loadMe(db, userId) });
});

/* ---------------------------- verify email ----------------------------- */
app.post("/verify-email", async (c) => {
  await rateLimit(c.env, "verify-email", clientIp(c.req.raw), 20, 10 * 60);
  const body = await parseBody(c, z.object({ token: z.string().min(10) }));
  const db = createDb(c.env);
  const hash = await sha256Hex(body.token);
  const now = Math.floor(Date.now() / 1000);

  const tok = await db.query.emailTokens.findFirst({
    where: (t, { and, eq: e }) =>
      and(e(t.tokenHash, hash), e(t.kind, "verify")),
  });
  if (!tok || tok.usedAt || tok.expiresAt < now) {
    throw badRequest("This verification link is invalid or has expired.");
  }
  await db.batch([
    db.update(users).set({ emailVerifiedAt: now }).where(eq(users.id, tok.userId)),
    db.update(emailTokens).set({ usedAt: now }).where(eq(emailTokens.id, tok.id)),
  ]);
  return c.json({ ok: true });
});

/* ------------------------- request password reset --------------------- */
app.post("/request-reset", async (c) => {
  await rateLimit(c.env, "reset-req", clientIp(c.req.raw), 5, 15 * 60);
  const body = await parseBody(c, z.object({ email: emailSchema }));
  const db = createDb(c.env);
  const user = await db.query.users.findFirst({
    where: eq(users.emailNormalized, body.email),
    columns: { id: true, email: true },
  });

  if (user) {
    const now = Math.floor(Date.now() / 1000);
    const token = crypto.randomUUID();
    await db.insert(emailTokens).values({
      id: newId(),
      userId: user.id,
      kind: "reset",
      tokenHash: await sha256Hex(token),
      expiresAt: now + HOUR,
      createdAt: now,
    });
    await sendEmail(c.env, {
      to: user.email,
      subject: "Reset your VIBIN password",
      text: resetEmailBody(`${c.env.APP_URL}/reset-password?token=${token}`),
    });
  }
  // Never reveal whether the email exists.
  return c.json({ ok: true });
});

/* ---------------------------- reset password -------------------------- */
app.post("/reset", async (c) => {
  await rateLimit(c.env, "reset", clientIp(c.req.raw), 15, 15 * 60);
  const body = await parseBody(
    c,
    z.object({ token: z.string().min(10), password: passwordSchema }),
  );
  const db = createDb(c.env);
  const hash = await sha256Hex(body.token);
  const now = Math.floor(Date.now() / 1000);

  const tok = await db.query.emailTokens.findFirst({
    where: (t, { and, eq: e }) => and(e(t.tokenHash, hash), e(t.kind, "reset")),
  });
  if (!tok || tok.usedAt || tok.expiresAt < now) {
    throw badRequest("This reset link is invalid or has expired.");
  }
  await db.batch([
    db
      .update(users)
      .set({ passwordHash: await hashPassword(body.password), updatedAt: now })
      .where(eq(users.id, tok.userId)),
    db.update(emailTokens).set({ usedAt: now }).where(eq(emailTokens.id, tok.id)),
  ]);
  await destroyAllSessions(c.env, tok.userId);
  clearSessionCookie(c);
  return c.json({ ok: true });
});

export default app;
