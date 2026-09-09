import { Hono } from "hono";
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";
import type { Env, Vars } from "../env";
import { createDb } from "../db/client";
import {
  activityVotes,
  groupActivityPool,
  groupInvites,
  groupMembers,
  groupSettings,
  groups,
} from "../db/schema";
import { groupNameSchema, parseBody } from "../lib/validate";
import { badRequest, conflict, forbidden, notFound } from "../lib/errors";
import { newId, newInviteCode } from "../lib/id";
import {
  requireGroupCreator,
  requireGroupMember,
} from "../lib/access";
import { buildGroupDTO, matchCountFor, settingsToDTO } from "../lib/group-view";
import { chunk, rowsPerInsert } from "../lib/chunk";
import { rateLimit } from "../lib/ratelimit";
import { track } from "../lib/analytics";
import { systemMessage, notifyGroup } from "../lib/notify";
import { buildDeck } from "../engine/deck";
import { activityVoteProgress } from "../engine/match";
import { activePlanDTO } from "../lib/plan-view";
import {
  BUDGET_BANDS,
  DATE_MODES,
  RADIUS_OPTIONS_KM,
  TIME_BANDS,
  ACTIVITY_CATEGORIES,
  LIMITS,
} from "@shared/constants";
import { resolvePlace } from "@shared/be-places";
import type { GroupSummaryDTO } from "@shared/types";

type Ctx = { Bindings: Env; Variables: Vars };
const app = new Hono<Ctx>();

const uid = (c: { get: (k: "userId") => string | null }) => c.get("userId")!;

/* ------------------------------- create -------------------------------- */
app.post("/", async (c) => {
  const userId = uid(c);
  await rateLimit(c.env, "group-create", userId, 20, 3600); // 20 / hour / user
  const { name } = await parseBody(c, z.object({ name: groupNameSchema }));
  const db = createDb(c.env);
  const now = Math.floor(Date.now() / 1000);
  const groupId = newId();
  const code = newInviteCode();

  await db.batch([
    db.insert(groups).values({
      id: groupId,
      name,
      creatorId: userId,
      status: "configuring",
      createdAt: now,
      updatedAt: now,
    }),
    db.insert(groupMembers).values({
      id: newId(),
      groupId,
      userId,
      role: "creator",
      status: "active",
      joinedAt: now,
    }),
    // Default a new group to "all activities" so the creator can start swiping
    // in one tap; they can narrow it down on the config screen.
    db.insert(groupSettings).values({ groupId, allActivities: 1, updatedAt: now }),
    db.insert(groupInvites).values({
      id: newId(),
      groupId,
      code,
      createdBy: userId,
      createdAt: now,
    }),
  ]);
  await systemMessage(db, groupId, `Group "${name}" created. Invite your crew!`);
  track(c, "group_created", { userId, groupId, dedupeKey: `group_created:${groupId}` });
  track(c, "group_invite_sent", {
    userId,
    groupId,
    props: { source: "auto" },
    dedupeKey: `group_invite_sent:${groupId}:initial`,
  });

  const group = await db.query.groups.findFirst({ where: eq(groups.id, groupId) });
  return c.json(
    { group: await buildGroupDTO(db, group!, userId, c.env.APP_URL) },
    201,
  );
});

/* -------------------------------- list -------------------------------- */
app.get("/", async (c) => {
  const db = createDb(c.env);
  const userId = uid(c);

  const memberRows = await db
    .select({ group: groups, status: groupMembers.status })
    .from(groupMembers)
    .innerJoin(groups, eq(groups.id, groupMembers.groupId))
    .where(
      and(
        eq(groupMembers.userId, userId),
        inArray(groupMembers.status, ["active", "inactive"]),
        ne(groups.status, "archived"),
      ),
    )
    .orderBy(desc(groups.updatedAt));

  const summaries: GroupSummaryDTO[] = [];
  for (const { group } of memberRows) {
    const allMembers = await db
      .select({ userId: groupMembers.userId, status: groupMembers.status })
      .from(groupMembers)
      .where(eq(groupMembers.groupId, group.id));
    const visible = allMembers.filter(
      (m) => m.status === "active" || m.status === "inactive",
    );
    const activeIds = allMembers
      .filter((m) => m.status === "active")
      .map((m) => m.userId);

    const settingsRow = await db.query.groupSettings.findFirst({
      where: eq(groupSettings.groupId, group.id),
    });

    let progress: GroupSummaryDTO["progress"] = null;
    if (group.status === "swiping") {
      const firstCard = await db.query.groupActivityPool.findFirst({
        where: eq(groupActivityPool.groupId, group.id),
        orderBy: (p, { asc }) => asc(p.sort),
      });
      if (firstCard) {
        const votes = await db
          .select({
            userId: activityVotes.userId,
            value: activityVotes.value,
          })
          .from(activityVotes)
          .where(
            and(
              eq(activityVotes.groupId, group.id),
              eq(activityVotes.activityId, firstCard.activityId),
            ),
          );
        const p = activityVoteProgress(activeIds, votes);
        progress = { voted: p.voted, total: p.total };
      }
    }

    summaries.push({
      id: group.id,
      name: group.name,
      status: group.status,
      memberCount: visible.length,
      activeMemberCount: activeIds.length,
      dateKnown: settingsRow ? settingsToDTO(settingsRow)!.dateKnown : false,
      progress,
      matchCount: await matchCountFor(db, group.id),
      upcomingPlan: await activePlanDTO(db, group.id, userId, c.env.APP_URL),
      lastActivityAt: group.updatedAt,
    });
  }

  return c.json({ groups: summaries });
});

/* -------------------------------- read -------------------------------- */
app.get("/:id", async (c) => {
  const db = createDb(c.env);
  const { group } = await requireGroupMember(db, c.req.param("id"), uid(c));
  return c.json({ group: await buildGroupDTO(db, group, uid(c), c.env.APP_URL) });
});

/* ------------------------------ settings ------------------------------ */
const settingsSchema = z.object({
  categories: z
    .array(z.enum(ACTIVITY_CATEGORIES.map((x) => x.id) as [string, ...string[]]))
    .max(ACTIVITY_CATEGORIES.length),
  allActivities: z.boolean(),
  locationLabel: z.string().trim().max(120).nullable(),
  lat: z.number().min(-90).max(90).nullable(),
  lng: z.number().min(-180).max(180).nullable(),
  radiusKm: z.number().refine((n) => RADIUS_OPTIONS_KM.includes(n as never)),
  budgetBand: z.enum(BUDGET_BANDS.map((b) => b.id) as [string, ...string[]]),
  dateMode: z.enum(DATE_MODES.map((d) => d.id) as [string, ...string[]]),
  dateSpecific: z.number().int().positive().nullable(),
  timeBand: z.enum(TIME_BANDS.map((t) => t.id) as [string, ...string[]]),
  timeSpecific: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable(),
});

app.put("/:id/settings", async (c) => {
  const db = createDb(c.env);
  const groupId = c.req.param("id");
  const { group } = await requireGroupCreator(db, groupId, uid(c));
  if (group.status !== "configuring" && group.status !== "swiping") {
    throw conflict("Settings are locked once a plan is in progress.");
  }
  const body = await parseBody(c, settingsSchema);
  if (!body.allActivities && body.categories.length === 0) {
    throw badRequest("Pick at least one category, or choose “All activities”.");
  }
  if (body.dateMode === "specific" && !body.dateSpecific) {
    throw badRequest("Choose a specific date.");
  }
  // Resolve the free-text place to a coordinate so the radius filter actually
  // applies. An explicit lat/lng from the client wins; otherwise geocode the
  // label offline (known Belgian towns + postcodes). Unresolved -> no radius.
  let lat = body.lat;
  let lng = body.lng;
  if ((lat == null || lng == null) && body.locationLabel) {
    const hit = resolvePlace(body.locationLabel);
    if (hit) {
      lat = hit.lat;
      lng = hit.lng;
    }
  }
  const now = Math.floor(Date.now() / 1000);
  await db
    .update(groupSettings)
    .set({
      categories: JSON.stringify(body.categories),
      allActivities: body.allActivities ? 1 : 0,
      locationLabel: body.locationLabel,
      lat: lat != null ? Math.round(lat * 1e6) : null,
      lng: lng != null ? Math.round(lng * 1e6) : null,
      radiusKm: body.radiusKm,
      budgetBand: body.budgetBand as never,
      dateMode: body.dateMode as never,
      dateSpecific: body.dateSpecific,
      timeBand: body.timeBand as never,
      timeSpecific: body.timeSpecific,
      updatedAt: now,
    })
    .where(eq(groupSettings.groupId, groupId));
  await db.update(groups).set({ updatedAt: now }).where(eq(groups.id, groupId));
  track(c, "group_config_saved", { userId: uid(c), groupId });

  return c.json({ group: await buildGroupDTO(db, group, uid(c), c.env.APP_URL) });
});

/* ------------------------------- start -------------------------------- */
app.post("/:id/start", async (c) => {
  const db = createDb(c.env);
  const groupId = c.req.param("id");
  const { group } = await requireGroupCreator(db, groupId, uid(c));
  if (group.status === "swiping") {
    return c.json({ group: await buildGroupDTO(db, group, uid(c), c.env.APP_URL) });
  }
  if (group.status !== "configuring") {
    throw conflict("This group has already moved past swiping.");
  }
  const settings = await db.query.groupSettings.findFirst({
    where: eq(groupSettings.groupId, groupId),
  });
  if (!settings) throw badRequest("Configure the group first.");

  const deck = await buildDeck(db, settings);
  if (deck.length === 0) {
    throw badRequest(
      "No activities match those filters. Widen the radius, budget or categories.",
    );
  }
  const now = Math.floor(Date.now() / 1000);
  const poolRows = deck.map((activityId, i) => ({
    groupId,
    activityId,
    sort: i,
    addedAt: now,
  }));
  for (const batch of chunk(poolRows, rowsPerInsert(4))) {
    await db.insert(groupActivityPool).values(batch);
  }
  await db
    .update(groups)
    .set({ status: "swiping", updatedAt: now })
    .where(eq(groups.id, groupId));
  await systemMessage(
    db,
    groupId,
    `Swiping has started — ${deck.length} activities in the deck. Everyone needs to like the same one for it to match. 🔥`,
  );
  await notifyGroup(db, groupId, uid(c), {
    kind: "swiping_started",
    title: `Swiping started in ${group.name}`,
    body: "Open VIBIN and start swiping.",
  });
  track(c, "swiping_started", {
    userId: uid(c),
    groupId,
    props: { deckSize: deck.length },
    dedupeKey: `swiping_started:${groupId}`,
  });

  const fresh = await db.query.groups.findFirst({ where: eq(groups.id, groupId) });
  return c.json({ group: await buildGroupDTO(db, fresh!, uid(c), c.env.APP_URL) });
});

/* --------------------------- member management ----------------------- */
app.patch("/:id/members/:memberId", async (c) => {
  const db = createDb(c.env);
  const groupId = c.req.param("id");
  const memberId = c.req.param("memberId");
  await requireGroupCreator(db, groupId, uid(c));
  const body = await parseBody(
    c,
    z.object({ status: z.enum(["active", "inactive", "removed"]) }),
  );
  if (memberId === uid(c)) throw badRequest("You can't change your own status.");

  const target = await db.query.groupMembers.findFirst({
    where: and(
      eq(groupMembers.groupId, groupId),
      eq(groupMembers.userId, memberId),
    ),
  });
  if (!target) throw notFound("That person isn't in this group.");

  await db
    .update(groupMembers)
    .set({ status: body.status })
    .where(
      and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, memberId)),
    );
  await db
    .update(groups)
    .set({ updatedAt: Math.floor(Date.now() / 1000) })
    .where(eq(groups.id, groupId));

  const group = await db.query.groups.findFirst({ where: eq(groups.id, groupId) });
  return c.json({ group: await buildGroupDTO(db, group!, uid(c), c.env.APP_URL) });
});

/* ------------------------------- leave -------------------------------- */
app.post("/:id/leave", async (c) => {
  const db = createDb(c.env);
  const groupId = c.req.param("id");
  const { group, isCreator } = await requireGroupMember(db, groupId, uid(c));
  if (isCreator) {
    throw badRequest(
      "Transfer the group or archive it before leaving — you're the creator.",
    );
  }
  await db
    .update(groupMembers)
    .set({ status: "left" })
    .where(
      and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, uid(c))),
    );
  await systemMessage(db, groupId, `Someone left the group.`);
  return c.json({ ok: true });
});

/* ------------------------------ archive ------------------------------- */
app.delete("/:id", async (c) => {
  const db = createDb(c.env);
  const groupId = c.req.param("id");
  await requireGroupCreator(db, groupId, uid(c));
  await db
    .update(groups)
    .set({ status: "archived", updatedAt: Math.floor(Date.now() / 1000) })
    .where(eq(groups.id, groupId));
  return c.json({ ok: true });
});

export default app;
