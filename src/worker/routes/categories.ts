import { Hono } from "hono";
import { eq } from "drizzle-orm";
import type { Env, Vars } from "../env";
import { createDb } from "../db/client";
import { activityCategories } from "../db/schema";
import { ACTIVITY_CATEGORIES } from "@shared/constants";

type Ctx = { Bindings: Env; Variables: Vars };
const app = new Hono<Ctx>();

/**
 * The swipe-filter category chip list, filtered to what an admin has left
 * active (§13). Falls back to the fixed constant if the table is empty (e.g.
 * a fresh DB before the seed's category upsert has ever run).
 */
app.get("/", async (c) => {
  const db = createDb(c.env);
  const rows = await db
    .select()
    .from(activityCategories)
    .where(eq(activityCategories.active, 1))
    .orderBy(activityCategories.sort);
  const categories = rows.length
    ? rows.map((r) => ({ id: r.id, label: r.label, icon: r.icon }))
    : ACTIVITY_CATEGORIES;
  return c.json({ categories });
});

export default app;
