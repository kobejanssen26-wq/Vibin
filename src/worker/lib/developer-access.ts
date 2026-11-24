/**
 * Developer accounts: creating invitations, promoting an account to developer, and removing access.
 *
 * Invariants (the owner is the highest authority and can never be reached from here):
 *  - nothing in this file ever changes a row whose role is 'owner' (it refuses instead);
 *  - a developer is just a normal VIBIN account with role='developer' plus a `developer_access` row;
 *  - removing access turns the account back into a normal user and kills its admin sessions + MFA.
 */
import { and, eq, gt, isNull } from "drizzle-orm";
import { normalizePermissions, type AdminPermission } from "@shared/constants";
import type { Env } from "../env";
import { createDb } from "../db/client";
import {
  adminRecoveryCodes,
  adminTotp,
  developerAccess,
  developerInvites,
  users,
} from "../db/schema";
import { newId, newSessionId } from "./id";
import { sha256Hex } from "./password";
import { revokeAllAdminSessions } from "./admin-session";
import { badRequest, conflict } from "./errors";

const nowS = () => Math.floor(Date.now() / 1000);

/** An invitation link stays valid for a week. */
export const INVITE_TTL_SECONDS = 7 * 24 * 3600;

export async function createInvite(
  env: Env,
  args: { email: string; permissions: AdminPermission[]; invitedBy: string },
): Promise<{ id: string; token: string; expiresAt: number }> {
  const db = createDb(env);
  const created = nowS();
  // Only one open invitation per address: a new link replaces the old one.
  await db
    .update(developerInvites)
    .set({ revokedAt: created })
    .where(
      and(
        eq(developerInvites.emailNormalized, args.email),
        isNull(developerInvites.acceptedAt),
        isNull(developerInvites.revokedAt),
      ),
    );
  const id = newId();
  const token = `${newSessionId()}${newSessionId()}`; // 64 url-safe chars
  const expiresAt = created + INVITE_TTL_SECONDS;
  await db.insert(developerInvites).values({
    id,
    emailNormalized: args.email,
    tokenHash: await sha256Hex(token),
    permissions: JSON.stringify(normalizePermissions(args.permissions)),
    invitedBy: args.invitedBy,
    expiresAt,
    createdAt: created,
  });
  return { id, token, expiresAt };
}

/** The open (unused, not revoked, not expired) invitation behind a raw token, if any. */
export async function findOpenInvite(env: Env, token: string) {
  if (!token || token.length < 32 || token.length > 200) return null;
  const db = createDb(env);
  const row = await db.query.developerInvites.findFirst({
    where: and(
      eq(developerInvites.tokenHash, await sha256Hex(token)),
      isNull(developerInvites.acceptedAt),
      isNull(developerInvites.revokedAt),
      gt(developerInvites.expiresAt, nowS()),
    ),
  });
  return row ?? null;
}

export function permissionsOf(json: string | null | undefined): AdminPermission[] {
  try {
    return normalizePermissions(JSON.parse(json ?? "[]"));
  } catch {
    return [];
  }
}

/**
 * Turn an existing account into a developer (or update an existing developer's permissions).
 * Refuses the owner account and suspended/deleted accounts.
 */
export async function makeDeveloper(
  env: Env,
  userId: string,
  permissions: AdminPermission[],
  invitedBy: string,
): Promise<void> {
  const db = createDb(env);
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { id: true, role: true, status: true },
  });
  if (!user) throw badRequest("That account does not exist.");
  if (user.role === "owner") throw badRequest("The owner account cannot be changed here.");
  if (user.status !== "active") throw conflict("That account is not active.");
  const now = nowS();
  await db.batch([
    db.update(users).set({ role: "developer", updatedAt: now }).where(eq(users.id, userId)),
    db
      .insert(developerAccess)
      .values({
        userId,
        permissions: JSON.stringify(normalizePermissions(permissions)),
        invitedBy,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: developerAccess.userId,
        set: { permissions: JSON.stringify(normalizePermissions(permissions)), updatedAt: now },
      }),
  ]);
}

/** Take developer access away: back to a normal user, admin sessions and MFA gone. */
export async function removeDeveloper(env: Env, userId: string): Promise<void> {
  const db = createDb(env);
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { role: true },
  });
  if (!user || user.role !== "developer") throw badRequest("That account is not a developer.");
  await db.batch([
    db.update(users).set({ role: "user", updatedAt: nowS() }).where(eq(users.id, userId)),
    db.delete(developerAccess).where(eq(developerAccess.userId, userId)),
    db.delete(adminTotp).where(eq(adminTotp.userId, userId)),
    db.delete(adminRecoveryCodes).where(eq(adminRecoveryCodes.userId, userId)),
  ]);
  await revokeAllAdminSessions(env, userId);
}
