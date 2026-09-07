import { Hono } from "hono";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { Env, Vars } from "../env";
import { createDb } from "../db/client";
import { matches, plans } from "../db/schema";
import { notFound } from "../lib/errors";
import { requireGroupMember } from "../lib/access";
import { planRowToDTO, planIcs } from "../lib/plan-view";
import { matchDTO } from "../lib/match-view";

type Ctx = { Bindings: Env; Variables: Vars };
const app = new Hono<Ctx>();

const uid = (c: { get: (k: "userId") => string | null }) => c.get("userId")!;

/** All matches (past + present) for a group — the "Matches" dashboard tab. */
app.get("/groups/:id/matches", async (c) => {
  const db = createDb(c.env);
  const groupId = c.req.param("id");
  await requireGroupMember(db, groupId, uid(c));
  const rows = await db
    .select()
    .from(matches)
    .where(
      and(
        eq(matches.groupId, groupId),
        inArray(matches.status, ["activity_matched", "complete"]),
      ),
    )
    .orderBy(desc(matches.matchedAt));
  const dtos = await Promise.all(rows.map((m) => matchDTO(db, m.id)));
  return c.json({ matches: dtos.filter(Boolean) });
});

/** Confirmed plans for a group — the "Upcoming" dashboard tab. */
app.get("/groups/:id/plans", async (c) => {
  const db = createDb(c.env);
  const groupId = c.req.param("id");
  await requireGroupMember(db, groupId, uid(c));
  const rows = await db
    .select()
    .from(plans)
    .where(eq(plans.groupId, groupId))
    .orderBy(desc(plans.createdAt));
  const dtos = await Promise.all(
    rows.map((p) => planRowToDTO(db, p, c.env.APP_URL)),
  );
  return c.json({ plans: dtos });
});

app.get("/plans/:planId", async (c) => {
  const db = createDb(c.env);
  const plan = await db.query.plans.findFirst({
    where: eq(plans.id, c.req.param("planId")),
  });
  if (!plan) throw notFound("Plan not found.");
  await requireGroupMember(db, plan.groupId, uid(c)); // authz by group membership
  return c.json({ plan: await planRowToDTO(db, plan, c.env.APP_URL) });
});

/** ICS download. Auth via membership; returned as a file. */
app.get("/plans/:planId/calendar.ics", async (c) => {
  const db = createDb(c.env);
  const plan = await db.query.plans.findFirst({
    where: eq(plans.id, c.req.param("planId")),
  });
  if (!plan) throw notFound("Plan not found.");
  await requireGroupMember(db, plan.groupId, uid(c));
  const ics = await planIcs(db, plan.id);
  if (!ics) throw notFound("This plan doesn't have a confirmed date yet.");
  return new Response(ics, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": `attachment; filename="vibin-plan-${plan.id}.ics"`,
    },
  });
});

export default app;
