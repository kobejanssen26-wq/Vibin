/**
 * Team / Developers — mounted at /api/admin/cc/team behind withAdminSession + requireStaff() +
 * ccPermissionGate() (a developer reaches this only with the explicit `team.manage` permission).
 *
 * Rules enforced here, on the server, whatever the UI shows:
 *  - the owner account can never be listed as editable, changed, demoted, removed or re-assigned;
 *  - nobody edits or removes their own access;
 *  - only the owner may grant or revoke `team.manage`, and a delegated manager may only manage
 *    developers who do not hold `team.manage` themselves;
 *  - a delegated manager can only hand out permissions they hold themselves.
 */
import { Hono, type Context } from "hono";
import { and, eq, gt, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import {
  ADMIN_PERMISSIONS,
  DEFAULT_DEVELOPER_PERMISSIONS,
  normalizePermissions,
  type AdminPermission,
} from "@shared/constants";
import type { Env, Vars } from "../env";
import { createDb } from "../db/client";
import { developerAccess, developerInvites, profiles, users } from "../db/schema";
import { emailSchema, parseBody } from "../lib/validate";
import { badRequest, conflict, forbidden, notFound } from "../lib/errors";
import { rateLimit } from "../lib/ratelimit";
import { audit } from "../lib/audit";
import { canGrant } from "../lib/admin-rbac";
import {
  createInvite,
  makeDeveloper,
  permissionsOf,
  removeDeveloper,
} from "../lib/developer-access";

type Ctx = { Bindings: Env; Variables: Vars };
const app = new Hono<Ctx>();
const nowS = () => Math.floor(Date.now() / 1000);

const permsSchema = z.array(z.string().max(40)).max(20);

function actor(c: Context<Ctx>) {
  return {
    id: c.get("adminUserId")!,
    role: (c.get("adminRole") ?? "developer") as "owner" | "developer",
    perms: c.get("adminPerms"),
  };
}

/** Which permissions may this actor assign at all? (UI hint; the server re-checks every write.) */
function assignableFor(a: ReturnType<typeof actor>): AdminPermission[] {
  return ADMIN_PERMISSIONS.map((p) => p.key).filter((k) => canGrant(a.role, a.perms, [k]));
}

/* -------------------------------- list -------------------------------- */
app.get("/", async (c) => {
  const a = actor(c);
  const db = createDb(c.env);
  const staff = await db
    .select({
      id: users.id,
      email: users.email,
      role: users.role,
      status: users.status,
      createdAt: users.createdAt,
      displayName: profiles.displayName,
      permissions: developerAccess.permissions,
      invitedBy: developerAccess.invitedBy,
    })
    .from(users)
    .innerJoin(profiles, eq(profiles.userId, users.id))
    .leftJoin(developerAccess, eq(developerAccess.userId, users.id))
    .where(inArray(users.role, ["owner", "developer"]));

  const invites = await db
    .select()
    .from(developerInvites)
    .where(
      and(
        isNull(developerInvites.acceptedAt),
        isNull(developerInvites.revokedAt),
        gt(developerInvites.expiresAt, nowS()),
      ),
    );

  const members = staff
    .map((u) => ({
      id: u.id,
      email: u.email,
      displayName: u.displayName,
      role: u.role as "owner" | "developer",
      status: u.status,
      createdAt: u.createdAt,
      permissions: u.role === "owner" ? ADMIN_PERMISSIONS.map((p) => p.key) : permissionsOf(u.permissions),
      invitedBy: u.invitedBy,
      isYou: u.id === a.id,
      // Can THIS actor edit/remove this member? (UI hint only — see the route guards below.)
      manageable:
        u.role === "developer" &&
        u.id !== a.id &&
        (a.role === "owner" || !permissionsOf(u.permissions).includes("team.manage")),
    }))
    .sort((x, y) => (x.role === y.role ? x.createdAt - y.createdAt : x.role === "owner" ? -1 : 1));

  return c.json({
    you: { id: a.id, role: a.role, permissions: a.perms },
    assignable: assignableFor(a),
    defaults: DEFAULT_DEVELOPER_PERMISSIONS,
    permissionCatalogue: ADMIN_PERMISSIONS,
    members,
    invites: invites.map((i) => ({
      id: i.id,
      email: i.emailNormalized,
      permissions: permissionsOf(i.permissions),
      createdAt: i.createdAt,
      expiresAt: i.expiresAt,
    })),
  });
});

/** Shared guard for anything that changes an existing developer. */
async function loadManageable(c: Context<Ctx>) {
  const a = actor(c);
  const id = c.req.param("id") ?? "";
  if (id === a.id) throw forbidden("You can't change your own access.");
  const db = createDb(c.env);
  const target = await db
    .select({ id: users.id, email: users.email, role: users.role, permissions: developerAccess.permissions })
    .from(users)
    .leftJoin(developerAccess, eq(developerAccess.userId, users.id))
    .where(eq(users.id, id))
    .get();
  if (!target) throw notFound("Developer not found.");
  if (target.role === "owner") throw forbidden("The owner account can't be changed.");
  if (target.role !== "developer") throw notFound("Developer not found.");
  if (a.role !== "owner" && permissionsOf(target.permissions).includes("team.manage")) {
    throw forbidden("Only the owner can manage a developer who can manage the team.");
  }
  return { a, target };
}

/* ------------------------------ invitations ----------------------------- */
app.post("/invite", async (c) => {
  const a = actor(c);
  await rateLimit(c.env, "team-invite", a.id, 20, 60 * 60);
  const body = await parseBody(c, z.object({ email: emailSchema, permissions: permsSchema.optional() }));
  const perms = normalizePermissions(body.permissions ?? DEFAULT_DEVELOPER_PERMISSIONS);
  if (!canGrant(a.role, a.perms, perms)) {
    throw forbidden("You can only grant permissions you hold yourself (and never 'Manage developers').");
  }
  const db = createDb(c.env);
  const existing = await db.query.users.findFirst({
    where: eq(users.emailNormalized, body.email),
    columns: { id: true, role: true },
  });
  if (existing?.role === "owner") throw badRequest("That address belongs to the owner account.");
  if (existing?.role === "developer") throw conflict("That person is already a developer.");

  const inv = await createInvite(c.env, { email: body.email, permissions: perms, invitedBy: a.id });
  await audit(c, {
    action: "team.invite_created",
    actorType: a.role === "owner" ? "owner" : "admin",
    targetType: "developer_invite",
    targetId: inv.id,
    meta: { email: body.email, permissions: perms },
  });
  // The link is shown once to whoever created it. No email is sent automatically.
  return c.json({
    ok: true,
    id: inv.id,
    expiresAt: inv.expiresAt,
    link: `${c.env.APP_URL}/admin/invite/${inv.token}`,
  });
});

app.delete("/invites/:id", async (c) => {
  const a = actor(c);
  const db = createDb(c.env);
  const id = c.req.param("id") ?? "";
  const inv = await db.query.developerInvites.findFirst({ where: eq(developerInvites.id, id) });
  if (!inv || inv.acceptedAt || inv.revokedAt) throw notFound("Invitation not found.");
  await db.update(developerInvites).set({ revokedAt: nowS() }).where(eq(developerInvites.id, id));
  await audit(c, {
    action: "team.invite_revoked",
    actorType: a.role === "owner" ? "owner" : "admin",
    targetType: "developer_invite",
    targetId: id,
    meta: { email: inv.emailNormalized },
  });
  return c.json({ ok: true });
});

/* ---------------- add an existing VIBIN account directly ---------------- */
app.post("/developers", async (c) => {
  const a = actor(c);
  await rateLimit(c.env, "team-add", a.id, 20, 60 * 60);
  const body = await parseBody(c, z.object({ email: emailSchema, permissions: permsSchema.optional() }));
  const perms = normalizePermissions(body.permissions ?? DEFAULT_DEVELOPER_PERMISSIONS);
  if (!canGrant(a.role, a.perms, perms)) {
    throw forbidden("You can only grant permissions you hold yourself (and never 'Manage developers').");
  }
  const db = createDb(c.env);
  const user = await db.query.users.findFirst({
    where: eq(users.emailNormalized, body.email),
    columns: { id: true, role: true, status: true },
  });
  if (!user) throw notFound("There is no VIBIN account with that email. Send an invitation instead.");
  if (user.role === "owner") throw badRequest("That address belongs to the owner account.");
  if (user.role === "developer") throw conflict("That person is already a developer.");
  await makeDeveloper(c.env, user.id, perms, a.id);
  await audit(c, {
    action: "team.developer_added",
    actorType: a.role === "owner" ? "owner" : "admin",
    targetType: "user",
    targetId: user.id,
    meta: { email: body.email, permissions: perms },
  });
  return c.json({ ok: true, id: user.id });
});

/* ------------------------- change / remove access ------------------------ */
app.patch("/developers/:id", async (c) => {
  const { a, target } = await loadManageable(c);
  const body = await parseBody(c, z.object({ permissions: permsSchema }));
  const next = normalizePermissions(body.permissions);
  const before = permissionsOf(target.permissions);
  // Only the owner may add or remove `team.manage`; a manager may only hand out what they hold.
  const changed = next.filter((p) => !before.includes(p)).concat(before.filter((p) => !next.includes(p)));
  if (a.role !== "owner" && changed.includes("team.manage")) {
    throw forbidden("Only the owner can grant or remove 'Manage developers'.");
  }
  if (!canGrant(a.role, a.perms, next.filter((p) => !before.includes(p)))) {
    throw forbidden("You can only grant permissions you hold yourself.");
  }
  const db = createDb(c.env);
  await db
    .update(developerAccess)
    .set({ permissions: JSON.stringify(next), updatedAt: nowS() })
    .where(eq(developerAccess.userId, target.id));
  await audit(c, {
    action: "team.permissions_changed",
    actorType: a.role === "owner" ? "owner" : "admin",
    targetType: "user",
    targetId: target.id,
    meta: { email: target.email, from: before, to: next },
  });
  return c.json({ ok: true, permissions: next });
});

app.delete("/developers/:id", async (c) => {
  const { a, target } = await loadManageable(c);
  await removeDeveloper(c.env, target.id);
  await audit(c, {
    action: "team.developer_removed",
    actorType: a.role === "owner" ? "owner" : "admin",
    targetType: "user",
    targetId: target.id,
    meta: { email: target.email },
  });
  return c.json({ ok: true });
});

export default app;
