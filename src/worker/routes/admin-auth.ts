/**
 * Owner Command Center authentication.
 *
 * Flow:
 *   first run   -> GET /state {setupComplete:false} -> POST /setup/begin
 *                  -> (scan QR) -> POST /mfa/enroll/confirm -> ready
 *   normal      -> POST /login (password) -> POST /mfa (TOTP or recovery code)
 *   lost MFA    -> POST /login -> {next:"enroll"} -> GET /mfa/enroll
 *                  -> POST /mfa/enroll/confirm
 *   lost all    -> POST /recover (deployment secret + email) -> reset email
 *
 * A `vibin_admin` cookie is issued at the password step but the session is
 * unusable until the MFA step. Authorization is re-checked server-side on
 * every admin request (see middleware/admin.ts).
 */
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Env, Vars } from "../env";
import { createDb } from "../db/client";
import {
  adminRecoveryCodes,
  adminSessions,
  adminTotp,
  emailTokens,
  notificationPrefs,
  profiles,
  users,
} from "../db/schema";
import { emailSchema, parseBody, passwordSchema } from "../lib/validate";
import { badRequest, forbidden, unauthorized } from "../lib/errors";
import { rateLimit, clientIp } from "../lib/ratelimit";
import { hashPassword, sha256Hex, verifyPassword } from "../lib/password";
import { newId } from "../lib/id";
import {
  clearAdminCookies,
  createAdminSession,
  markMfaVerified,
  resolveAdminSession,
  revokeAdminSession,
  revokeAllAdminSessions,
} from "../lib/admin-session";
import { encryptSecret, decryptSecret, hasEncryptionKey } from "../lib/crypto-box";
import {
  generateTotpSecret,
  otpauthUri,
  verifyTotp,
} from "../lib/totp";
import {
  consumeRecoveryCode,
  regenerateRecoveryCodes,
  remainingRecoveryCodes,
} from "../lib/recovery-codes";
import {
  SETTINGS,
  getSetting,
  isOwnerSetupComplete,
  setSetting,
} from "../lib/system-settings";
import { audit } from "../lib/audit";
import { sendEmail, resetEmailBody } from "../lib/email";
import { requireOwner, requirePendingAdmin } from "../middleware/admin";

type Ctx = { Bindings: Env; Variables: Vars };
const app = new Hono<Ctx>();
const nowS = () => Math.floor(Date.now() / 1000);
const ISSUER = "VIBIN Owner";

/** Timing-safe string compare for the deployment recovery secret. */
async function secretEquals(a: string, b: string): Promise<boolean> {
  const [ha, hb] = await Promise.all([sha256Hex(a), sha256Hex(b)]);
  if (ha.length !== hb.length) return false;
  let diff = 0;
  for (let i = 0; i < ha.length; i++) diff |= ha.charCodeAt(i) ^ hb.charCodeAt(i);
  return diff === 0;
}

async function ownerByEmail(env: Env, email: string) {
  const db = createDb(env);
  return db.query.users.findFirst({ where: eq(users.emailNormalized, email) });
}

/* ------------------------------- state -------------------------------- */
app.get("/state", async (c) => {
  const setupComplete = await isOwnerSetupComplete(c.env);
  return c.json({
    setupComplete,
    encryptionConfigured: hasEncryptionKey(c.env),
    recoveryConfigured: !!c.env.OWNER_RECOVERY_SECRET,
  });
});

/* ---------------------------- first-run setup ------------------------- */
app.post("/setup/begin", async (c) => {
  await rateLimit(c.env, "admin-setup", clientIp(c.req.raw), 8, 15 * 60);
  if (await isOwnerSetupComplete(c.env)) {
    throw forbidden("Owner setup is already complete.");
  }
  if (!hasEncryptionKey(c.env)) {
    throw badRequest(
      "ENCRYPTION_KEY is not configured on the server. Set it before running owner setup.",
    );
  }
  const body = await parseBody(
    c,
    z.object({ email: emailSchema, password: passwordSchema }),
  );
  const db = createDb(c.env);
  const now = nowS();

  /*
   * Single-owner invariant. Setup is only reachable while
   * `owner_setup_completed_at` is unset, but a half-finished run can leave an
   * owner row with no confirmed authenticator. If one exists:
   *   - a confirmed authenticator on it => setup effectively done => refuse
   *   - otherwise it's a broken attempt => demote it and any other stray
   *     owner, then continue for the submitted email.
   */
  const strayOwners = await db.query.users.findMany({
    where: eq(users.role, "owner"),
    columns: { id: true },
  });
  for (const so of strayOwners) {
    const t = await db.query.adminTotp.findFirst({
      where: eq(adminTotp.userId, so.id),
    });
    if (t?.confirmedAt) {
      throw forbidden("An owner account already exists.");
    }
  }
  await db.delete(adminTotp);
  await db.delete(adminRecoveryCodes);
  if (strayOwners.length) {
    await db.update(users).set({ role: "user" }).where(eq(users.role, "owner"));
  }

  let userId: string;
  const existing = await ownerByEmail(c.env, body.email);
  if (existing) {
    userId = existing.id;
    await db
      .update(users)
      .set({
        role: "owner",
        status: "active",
        passwordHash: await hashPassword(body.password),
        updatedAt: now,
      })
      .where(eq(users.id, existing.id));
  } else {
    userId = newId();
    const displayName = body.email.split("@")[0]!.slice(0, 40) || "Owner";
    await db.batch([
      db.insert(users).values({
        id: userId,
        email: body.email,
        emailNormalized: body.email,
        passwordHash: await hashPassword(body.password),
        role: "owner",
        createdAt: now,
        updatedAt: now,
      }),
      db.insert(profiles).values({ userId, displayName, updatedAt: now }),
      db.insert(notificationPrefs).values({ userId, channels: "{}", updatedAt: now }),
    ]);
  }

  const secret = generateTotpSecret();
  await db
    .insert(adminTotp)
    .values({
      userId,
      secretEnc: await encryptSecret(c.env, secret),
      confirmedAt: null,
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: adminTotp.userId,
      set: { secretEnc: await encryptSecret(c.env, secret), confirmedAt: null },
    });

  await createAdminSession(c, userId);
  await audit(c, { action: "owner.setup_begin", actorId: userId, targetType: "user", targetId: userId });

  return c.json({
    ok: true,
    secret,
    otpauthUri: otpauthUri({ secretB32: secret, issuer: ISSUER, account: body.email }),
  });
});

/* ------------------------------- login ------------------------------- */
app.post("/login", async (c) => {
  const ip = clientIp(c.req.raw);
  await rateLimit(c.env, "admin-login-ip", ip, 12, 10 * 60);
  const body = await parseBody(
    c,
    z.object({ email: emailSchema, password: z.string().min(1).max(200) }),
  );
  await rateLimit(c.env, "admin-login-email", body.email, 8, 10 * 60);

  const user = await ownerByEmail(c.env, body.email);
  const stored =
    user?.passwordHash ??
    "pbkdf2$100000x6$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
  const { ok } = await verifyPassword(body.password, stored);

  if (!user || !ok || user.role !== "owner" || user.status !== "active") {
    await audit(c, {
      action: "admin.login_failed",
      actorType: "system",
      actorId: user?.id ?? null,
      meta: { email: body.email, reason: !user ? "no_user" : !ok ? "bad_password" : "not_owner" },
    });
    throw unauthorized("Email or password is incorrect.");
  }

  await createAdminSession(c, user.id);
  const db = createDb(c.env);
  const totp = await db.query.adminTotp.findFirst({
    where: eq(adminTotp.userId, user.id),
  });
  const next = totp?.confirmedAt ? "totp" : "enroll";
  await audit(c, { action: "admin.login_password_ok", actorId: user.id, meta: { next } });
  return c.json({ ok: true, next });
});

/* -------------------------------- mfa -------------------------------- */
app.post("/mfa", requirePendingAdmin(), async (c) => {
  const adminUserId = c.get("adminUserId")!;
  await rateLimit(c.env, "admin-mfa", `${clientIp(c.req.raw)}:${adminUserId}`, 10, 5 * 60);
  const { code } = await parseBody(c, z.object({ code: z.string().min(4).max(40) }));

  const db = createDb(c.env);
  const session = await resolveAdminSession(c);
  if (!session) throw unauthorized("Admin session is no longer valid.");

  const totp = await db.query.adminTotp.findFirst({
    where: eq(adminTotp.userId, adminUserId),
  });
  if (!totp?.confirmedAt) throw badRequest("No confirmed authenticator. Re-enrol first.");

  const secret = await decryptSecret(c.env, totp.secretEnc);
  if (await verifyTotp(secret, code)) {
    await markMfaVerified(c.env, session.hash);
    await audit(c, { action: "admin.mfa_ok", actorId: adminUserId });
    return c.json({ ok: true });
  }
  if (await consumeRecoveryCode(c.env, adminUserId, code)) {
    await markMfaVerified(c.env, session.hash);
    const remaining = await remainingRecoveryCodes(c.env, adminUserId);
    await audit(c, { action: "admin.recovery_code_used", actorId: adminUserId, meta: { remaining } });
    return c.json({ ok: true, usedRecoveryCode: true, remaining });
  }
  await audit(c, { action: "admin.mfa_failed", actorId: adminUserId });
  throw unauthorized("That code didn't match.");
});

/* ---------------------------- mfa enrolment -------------------------- */
app.get("/mfa/enroll", requirePendingAdmin(), async (c) => {
  const adminUserId = c.get("adminUserId")!;
  if (!hasEncryptionKey(c.env)) throw badRequest("ENCRYPTION_KEY is not configured.");
  const db = createDb(c.env);
  const user = await db.query.users.findFirst({ where: eq(users.id, adminUserId) });
  const secret = generateTotpSecret();
  await db
    .insert(adminTotp)
    .values({ userId: adminUserId, secretEnc: await encryptSecret(c.env, secret), confirmedAt: null, createdAt: nowS() })
    .onConflictDoUpdate({
      target: adminTotp.userId,
      set: { secretEnc: await encryptSecret(c.env, secret), confirmedAt: null },
    });
  return c.json({
    secret,
    otpauthUri: otpauthUri({ secretB32: secret, issuer: ISSUER, account: user?.email ?? "owner" }),
  });
});

app.post("/mfa/enroll/confirm", requirePendingAdmin(), async (c) => {
  const adminUserId = c.get("adminUserId")!;
  await rateLimit(c.env, "admin-enroll", `${clientIp(c.req.raw)}:${adminUserId}`, 10, 10 * 60);
  const { code } = await parseBody(c, z.object({ code: z.string().min(6).max(10) }));

  const db = createDb(c.env);
  const totp = await db.query.adminTotp.findFirst({ where: eq(adminTotp.userId, adminUserId) });
  if (!totp) throw badRequest("Start enrolment first.");
  const secret = await decryptSecret(c.env, totp.secretEnc);
  if (!(await verifyTotp(secret, code))) {
    throw unauthorized("That code didn't match. Check your authenticator clock.");
  }

  await db.update(adminTotp).set({ confirmedAt: nowS() }).where(eq(adminTotp.userId, adminUserId));
  const recoveryCodes = await regenerateRecoveryCodes(c.env, adminUserId);

  const session = await resolveAdminSession(c);
  if (session) await markMfaVerified(c.env, session.hash);

  if (!(await isOwnerSetupComplete(c.env))) {
    await setSetting(c.env, SETTINGS.ownerSetupCompletedAt, String(nowS()), adminUserId);
    await audit(c, { action: "owner.setup_completed", actorId: adminUserId });
  } else {
    await audit(c, { action: "admin.mfa_enrolled", actorId: adminUserId });
  }
  return c.json({ ok: true, recoveryCodes });
});

/* ----------------------------- session ------------------------------ */
app.get("/session", async (c) => {
  const adminUserId = c.get("adminUserId");
  const setupComplete = await isOwnerSetupComplete(c.env);
  if (!adminUserId) {
    return c.json({ user: null, stage: "none", setupComplete });
  }
  const session = await resolveAdminSession(c);
  const db = createDb(c.env);
  const user = await db
    .select({
      id: users.id,
      email: users.email,
      role: users.role,
      status: users.status,
      displayName: profiles.displayName,
    })
    .from(users)
    .innerJoin(profiles, eq(profiles.userId, users.id))
    .where(eq(users.id, adminUserId))
    .get();

  if (!user || user.role !== "owner" || user.status !== "active") {
    return c.json({ user: null, stage: "none", setupComplete });
  }
  const totp = await db.query.adminTotp.findFirst({ where: eq(adminTotp.userId, adminUserId) });
  let stage: "mfa" | "enroll" | "ready" = "ready";
  if (!session?.mfaVerifiedAt) stage = totp?.confirmedAt ? "mfa" : "enroll";

  return c.json({
    user: { id: user.id, email: user.email, displayName: user.displayName, role: user.role },
    stage,
    setupComplete,
    sessionExpiresAt: session?.expiresAt ?? null,
  });
});

app.post("/logout", async (c) => {
  const hash = c.get("adminSessionId");
  if (hash) {
    await revokeAdminSession(c.env, hash);
    await audit(c, { action: "admin.logout", actorId: c.get("adminUserId") });
  }
  clearAdminCookies(c);
  return c.json({ ok: true });
});

/* ------------------------- deployment recovery --------------------- */
app.post("/recover", async (c) => {
  await rateLimit(c.env, "admin-recover", clientIp(c.req.raw), 3, 60 * 60);
  if (!c.env.OWNER_RECOVERY_SECRET) {
    // Feature not configured — do not disclose.
    throw unauthorized("Recovery is not available.");
  }
  const body = await parseBody(
    c,
    z.object({ recoverySecret: z.string().min(8).max(400), email: emailSchema }),
  );
  const match = await secretEquals(body.recoverySecret, c.env.OWNER_RECOVERY_SECRET);
  const user = await ownerByEmail(c.env, body.email);

  if (!match || !user || user.role !== "owner") {
    await audit(c, {
      action: "owner.recovery_failed",
      actorType: "system",
      actorId: user?.id ?? null,
      meta: { email: body.email, secretMatched: match },
    });
    throw unauthorized("Recovery details are incorrect.");
  }

  const db = createDb(c.env);
  // Clear MFA so the owner re-enrols after resetting the password.
  await db.delete(adminTotp).where(eq(adminTotp.userId, user.id));
  await db.delete(adminRecoveryCodes).where(eq(adminRecoveryCodes.userId, user.id));
  await revokeAllAdminSessions(c.env, user.id);

  // Issue a password-reset link via the existing token flow.
  const token = crypto.randomUUID();
  await db.insert(emailTokens).values({
    id: newId(),
    userId: user.id,
    kind: "reset",
    tokenHash: await sha256Hex(token),
    expiresAt: nowS() + 3600,
    createdAt: nowS(),
  });
  await sendEmail(c.env, {
    to: user.email,
    subject: "VIBIN owner account recovery",
    text: resetEmailBody(`${c.env.APP_URL}/reset-password?token=${token}`),
  });
  await audit(c, { action: "owner.recovery_used", actorId: user.id, meta: { email: user.email } });
  return c.json({ ok: true });
});

/* --------------------- owner-only session management --------------- */
app.get("/sessions", requireOwner(), async (c) => {
  const db = createDb(c.env);
  const current = c.get("adminSessionId");
  const rows = await db.query.adminSessions.findMany({
    where: eq(adminSessions.userId, c.get("adminUserId")!),
    orderBy: (s, { desc }) => desc(s.lastSeenAt),
    limit: 50,
  });
  return c.json({
    sessions: rows.map((s) => ({
      id: s.id,
      current: s.id === current,
      ip: s.ip,
      userAgent: s.userAgent,
      createdAt: s.createdAt,
      lastSeenAt: s.lastSeenAt,
      expiresAt: s.expiresAt,
      revokedAt: s.revokedAt,
      mfaVerifiedAt: s.mfaVerifiedAt,
    })),
  });
});

app.post("/sessions/revoke", requireOwner(), async (c) => {
  const { id } = await parseBody(c, z.object({ id: z.string().min(16).max(80) }));
  await revokeAdminSession(c.env, id);
  await audit(c, { action: "admin.session_revoked", targetType: "admin_session", targetId: id });
  return c.json({ ok: true });
});

app.post("/sessions/revoke-all", requireOwner(), async (c) => {
  const n = await revokeAllAdminSessions(
    c.env,
    c.get("adminUserId")!,
    c.get("adminSessionId") ?? undefined,
  );
  await audit(c, { action: "admin.sessions_revoked_all", meta: { count: n } });
  return c.json({ ok: true, revoked: n });
});

/* --------------------- MFA / recovery-code management ------------- */
async function reauth(env: Env, userId: string, password: string): Promise<void> {
  const db = createDb(env);
  const u = await db.query.users.findFirst({ where: eq(users.id, userId) });
  const { ok } = await verifyPassword(password, u?.passwordHash ?? "");
  if (!ok) throw forbidden("Password re-entry failed.");
}

app.post("/recovery-codes/regenerate", requireOwner(), async (c) => {
  const { password } = await parseBody(c, z.object({ password: z.string().min(1).max(200) }));
  await reauth(c.env, c.get("adminUserId")!, password);
  const codes = await regenerateRecoveryCodes(c.env, c.get("adminUserId")!);
  await audit(c, { action: "admin.recovery_codes_regenerated" });
  return c.json({ ok: true, recoveryCodes: codes });
});

app.get("/recovery-codes/remaining", requireOwner(), async (c) => {
  return c.json({ remaining: await remainingRecoveryCodes(c.env, c.get("adminUserId")!) });
});

app.post("/mfa/reset", requireOwner(), async (c) => {
  const { password } = await parseBody(c, z.object({ password: z.string().min(1).max(200) }));
  await reauth(c.env, c.get("adminUserId")!, password);
  const db = createDb(c.env);
  await db.delete(adminTotp).where(eq(adminTotp.userId, c.get("adminUserId")!));
  await db.delete(adminRecoveryCodes).where(eq(adminRecoveryCodes.userId, c.get("adminUserId")!));
  await audit(c, { action: "admin.mfa_reset" });
  return c.json({ ok: true, note: "Authenticator cleared — you'll re-enrol on next sign-in." });
});

export default app;
