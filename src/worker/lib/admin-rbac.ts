/**
 * Role-based access control for the admin panel (Owner Command Center).
 *
 * Two staff roles may sign in to /admin:
 *   owner     -> highest authority, holds every permission and every owner-only area. Exactly one.
 *   developer -> holds only the permissions the owner granted (`developer_access.permissions`).
 *
 * The check lives on the server (middleware/admin.ts) and works on the request path, so a developer
 * can never reach an area just because a button is hidden in the UI. Anything that is NOT listed in
 * RULES below is owner-only — new admin routes are safe by default.
 */
import { eq } from "drizzle-orm";
import {
  ALL_ADMIN_PERMISSIONS,
  normalizePermissions,
  type AdminPermission,
} from "@shared/constants";
import type { Env } from "../env";
import { createDb } from "../db/client";
import { developerAccess } from "../db/schema";

export type Need = AdminPermission | "owner";

/** First match wins. Paths are relative to /api/admin/cc. */
const RULES: ReadonlyArray<readonly [RegExp, Need]> = [
  // Contact data of venues stays with the owner even inside the catalogue area.
  [/^\/quality\/(shared-emails|link)(\/|$)/, "owner"],
  [/^\/(activities|categories|data-quality|images|rankings|quality)(\/|$)/, "catalogue"],
  [/^\/(support|reports)(\/|$)/, "support"],
  [/^\/(events|event-sources|events-coverage|rank-explain)(\/|$)/, "events"],
  [/^\/files(\/|$)/, "files.read"],
  [/^\/team(\/|$)/, "team.manage"],
];

/** What a request to `relPath` (relative to /api/admin/cc) requires. Default: owner only. */
export function requiredFor(relPath: string): Need {
  const p = relPath.startsWith("/") ? relPath : `/${relPath}`;
  for (const [re, need] of RULES) if (re.test(p)) return need;
  return "owner";
}

/** Permission keys currently held by a developer (empty when there is no access row). */
export async function loadPermissions(env: Env, userId: string): Promise<AdminPermission[]> {
  const db = createDb(env);
  const row = await db.query.developerAccess.findFirst({
    where: eq(developerAccess.userId, userId),
    columns: { permissions: true },
  });
  if (!row) return [];
  try {
    return normalizePermissions(JSON.parse(row.permissions));
  } catch {
    return [];
  }
}

export function allPermissions(): AdminPermission[] {
  return [...ALL_ADMIN_PERMISSIONS];
}

/**
 * Is `actor` allowed to hand out exactly these permissions? The owner may grant anything; a
 * delegated manager (`team.manage`) may only grant a subset of what they hold themselves and can
 * never hand out `team.manage` — that stays with the owner.
 */
export function canGrant(
  actorRole: "owner" | "developer",
  actorPerms: readonly string[],
  wanted: readonly AdminPermission[],
): boolean {
  if (actorRole === "owner") return true;
  return wanted.every((p) => p !== "team.manage" && actorPerms.includes(p));
}
