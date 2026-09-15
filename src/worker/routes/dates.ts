import { Hono } from "hono";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Env, Vars } from "../env";
import { createDb } from "../db/client";
import { activities, dateOptions, dateVotes, matches } from "../db/schema";
import { parseBody } from "../lib/validate";
import { badRequest, conflict, notFound } from "../lib/errors";
import { newId } from "../lib/id";
import { requireActiveMember, requireGroupMember } from "../lib/access";
import { runDateMatch } from "../lib/engine-run";
import { track } from "../lib/analytics";
import { dateMatchStateDTO } from "../lib/match-view";
import { formatWhen } from "../lib/dates";
import { systemMessage } from "../lib/notify";
import { isOpenAt, localDayKey, parseDisplayHours } from "../lib/opening-hours";

type Ctx = { Bindings: Env; Variables: Vars };
const app = new Hono<Ctx>();

const uid = (c: { get: (k: "userId") => string | null }) => c.get("userId")!;

async function currentMatchId(
  db: ReturnType<typeof createDb>,
  groupId: string,
): Promise<string | null> {
  const m = await db.query.matches.findFirst({
    where: and(
      eq(matches.groupId, groupId),
      inArray(matches.status, ["activity_matched", "complete"]),
    ),
    orderBy: [desc(matches.matchedAt)],
  });
  return m?.id ?? null;
}

app.get("/:id/date-match", async (c) => {
  const db = createDb(c.env);
  const groupId = c.req.param("id");
  await requireGroupMember(db, groupId, uid(c));
  const matchId = await currentMatchId(db, groupId);
  if (!matchId) throw notFound("No match is waiting on a date yet.");
  const state = await dateMatchStateDTO(db, matchId, uid(c));
  return c.json(state);
});

app.post("/:id/date-match/vote", async (c) => {
  const db = createDb(c.env);
  const groupId = c.req.param("id");
  await requireActiveMember(db, groupId, uid(c));
  const body = await parseBody(
    c,
    z.object({
      optionId: z.string().min(1),
      value: z.enum(["yes", "no", "maybe"]),
    }),
  );

  const option = await db.query.dateOptions.findFirst({
    where: eq(dateOptions.id, body.optionId),
  });
  if (!option || option.groupId !== groupId) {
    throw badRequest("That date option doesn't belong to this group.");
  }
  const match = await db.query.matches.findFirst({
    where: eq(matches.id, option.matchId),
  });
  if (!match) throw notFound();
  if (match.status === "complete") {
    throw conflict("The date is already locked in for this plan.");
  }

  const now = Math.floor(Date.now() / 1000);
  await db
    .insert(dateVotes)
    .values({
      id: newId(),
      dateOptionId: body.optionId,
      matchId: option.matchId,
      userId: uid(c),
      value: body.value,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [dateVotes.dateOptionId, dateVotes.userId],
      set: { value: body.value, updatedAt: now },
    });

  track(c, "date_vote_cast", {
    userId: uid(c),
    groupId: c.req.param("id"),
    props: { value: body.value },
    dedupeKey: `date_vote:${body.optionId}:${uid(c)}`,
  });

  const { completed } = await runDateMatch(db, c.env, option.matchId, uid(c));
  const state = await dateMatchStateDTO(db, option.matchId, uid(c));
  return c.json({ ok: true, completed, state });
});

app.post("/:id/date-match/options", async (c) => {
  const db = createDb(c.env);
  const groupId = c.req.param("id");
  await requireActiveMember(db, groupId, uid(c));
  const body = await parseBody(
    c,
    z.object({
      startsAt: z.number().int().positive(),
      label: z.string().trim().max(80).optional(),
    }),
  );
  const now = Math.floor(Date.now() / 1000);
  if (body.startsAt < now + 3600) {
    throw badRequest("Pick a time at least an hour from now.");
  }
  const matchId = await currentMatchId(db, groupId);
  if (!matchId) throw notFound("No match is waiting on a date.");
  const match = await db.query.matches.findFirst({ where: eq(matches.id, matchId) });
  if (!match || match.status === "complete") {
    throw conflict("The date is already decided.");
  }

  // Never let the group vote on a time the venue is verifiably closed — but
  // only when we actually know the hours (most activities don't have
  // structured hours yet; unknown is not the same as closed, so it's never
  // blocked on uncertainty).
  const activity = await db.query.activities.findFirst({
    where: eq(activities.id, match.activityId),
    columns: { openingHours: true, title: true },
  });
  if (activity) {
    let display: Partial<Record<string, string>> = {};
    try {
      display = JSON.parse(activity.openingHours);
    } catch {
      /* malformed — treat as unknown, never block */
    }
    const spans = parseDisplayHours(display);
    if (isOpenAt(spans, body.startsAt) === false) {
      const dayKey = localDayKey(body.startsAt);
      const hoursThatDay = display[dayKey];
      throw badRequest(
        hoursThatDay
          ? `${activity.title} is closed at that time — it's open ${dayKey} ${hoursThatDay}.`
          : `${activity.title} is closed at that time.`,
      );
    }
  }

  const existing = await db
    .select()
    .from(dateOptions)
    .where(eq(dateOptions.matchId, matchId));
  if (existing.length >= 8) throw badRequest("That's enough options — vote on these.");
  if (existing.some((o) => o.startsAt === body.startsAt)) {
    throw badRequest("That time is already an option.");
  }

  const label = body.label || formatWhen(body.startsAt);
  await db.insert(dateOptions).values({
    id: newId(),
    matchId,
    groupId,
    startsAt: body.startsAt,
    label,
    sort: existing.length,
    createdAt: now,
  });
  await systemMessage(db, groupId, `A new date option was added: ${label}`, {
    type: "date_option_added",
    matchId,
  });

  return c.json({ state: await dateMatchStateDTO(db, matchId, uid(c)) });
});

export default app;
