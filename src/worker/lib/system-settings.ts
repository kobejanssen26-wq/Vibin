import { eq } from "drizzle-orm";
import type { Env } from "../env";
import { createDb } from "../db/client";
import { systemSettings } from "../db/schema";

export const SETTINGS = {
  ownerSetupCompletedAt: "owner_setup_completed_at",
  maintenanceMode: "maintenance_mode",
  maintenanceMessage: "maintenance_message",
} as const;

export async function getSetting(
  env: Env,
  key: string,
): Promise<string | null> {
  const db = createDb(env);
  const row = await db.query.systemSettings.findFirst({
    where: eq(systemSettings.key, key),
  });
  return row?.value ?? null;
}

export async function setSetting(
  env: Env,
  key: string,
  value: string,
  updatedBy: string | null,
): Promise<void> {
  const db = createDb(env);
  const nowS = Math.floor(Date.now() / 1000);
  await db
    .insert(systemSettings)
    .values({ key, value, updatedAt: nowS, updatedBy })
    .onConflictDoUpdate({
      target: systemSettings.key,
      set: { value, updatedAt: nowS, updatedBy },
    });
}

export async function isOwnerSetupComplete(env: Env): Promise<boolean> {
  return (await getSetting(env, SETTINGS.ownerSetupCompletedAt)) != null;
}

export async function isMaintenanceMode(env: Env): Promise<boolean> {
  return (await getSetting(env, SETTINGS.maintenanceMode)) === "1";
}
