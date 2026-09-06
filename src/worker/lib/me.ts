import { eq } from "drizzle-orm";
import type { DB } from "../db/client";
import { profiles, users } from "../db/schema";
import type { Me } from "@shared/types";
import { avatarUrl, initialsFrom } from "./dto";
import { notFound } from "./errors";

export async function loadMe(db: DB, userId: string): Promise<Me> {
  const row = await db
    .select({
      id: users.id,
      email: users.email,
      emailVerifiedAt: users.emailVerifiedAt,
      role: users.role,
      displayName: profiles.displayName,
      avatarKey: profiles.avatarKey,
      age: profiles.age,
      locationLabel: profiles.locationLabel,
      bio: profiles.bio,
    })
    .from(users)
    .innerJoin(profiles, eq(profiles.userId, users.id))
    .where(eq(users.id, userId))
    .get();

  if (!row) throw notFound("Account not found.");

  return {
    id: row.id,
    email: row.email,
    emailVerified: row.emailVerifiedAt != null,
    role: row.role,
    displayName: row.displayName,
    avatarUrl: avatarUrl(row.avatarKey),
    initials: initialsFrom(row.displayName),
    age: row.age,
    locationLabel: row.locationLabel,
    bio: row.bio,
  };
}
