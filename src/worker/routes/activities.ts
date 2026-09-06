import { Hono } from "hono";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Env, Vars } from "../env";
import { createDb } from "../db/client";
import { activities, activityImages } from "../db/schema";
import { parseQuery } from "../lib/validate";
import { notFound } from "../lib/errors";
import { toActivityDTO } from "../lib/dto";
import { ACTIVITY_CATEGORIES } from "@shared/constants";

type Ctx = { Bindings: Env; Variables: Vars };
const app = new Hono<Ctx>();

/**
 * Read-only activity catalogue. This is NOT a discovery feed — it exists so the
 * app can render an activity's detail page (from a match) and for admin tooling.
 * There is intentionally no "browse all activities" surface in the product.
 */
app.get("/", async (c) => {
  const db = createDb(c.env);
  const q = parseQuery(
    c,
    z.object({
      category: z
        .enum(ACTIVITY_CATEGORIES.map((x) => x.id) as [string, ...string[]])
        .optional(),
      limit: z.coerce.number().int().min(1).max(100).default(50),
    }),
  );
  const where = [eq(activities.active, 1)];
  if (q.category) where.push(eq(activities.categoryId, q.category));
  const rows = await db
    .select()
    .from(activities)
    .where(and(...where))
    .orderBy(desc(activities.updatedAt))
    .limit(q.limit);
  return c.json({ activities: rows.map((a) => toActivityDTO(a)) });
});

app.get("/:id", async (c) => {
  const db = createDb(c.env);
  const activity = await db.query.activities.findFirst({
    where: eq(activities.id, c.req.param("id")),
  });
  if (!activity || !activity.active) throw notFound("Activity not found.");
  const imgs = await db
    .select()
    .from(activityImages)
    .where(eq(activityImages.activityId, activity.id))
    .orderBy(activityImages.sort);
  return c.json({
    activity: toActivityDTO(
      activity,
      imgs.map((i) => i.url),
    ),
  });
});

export default app;
