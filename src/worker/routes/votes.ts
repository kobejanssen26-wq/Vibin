import { Hono } from "hono";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Env, Vars } from "../env";
import { createDb } from "../db/client";
import {
  activities,
  activityImages,
  activityVotes,
  groupActivityPool,
  matches,
} from "../db/schema";
import { parseBody } from "../lib/validate";
import { badRequest, conflict } from "../lib/errors";
import { newId } from "../lib/id";
import { requireActiveMember, requireGroupMember, activeMemberIds } from "../lib/access";
import { activityVoteProgress } from "../engine/match";
import { runActivityMatch } from "../lib/engine-run";
import { matchDTO } from "../lib/match-view";
import { toActivityDTO } from "../lib/dto";
import type { SwipeCardDTO, SwipeStateDTO } from "@shared/types";

type Ctx = { Bindings: Env; Variables: Vars };
const app = new Hono<Ctx>();

const uid = (c: { get: (k: "userId") => string | null }) => c.get("userId")!;

async function deckWithActivities(db: ReturnType<typeof createDb>, groupId: string) {
  const pool = await db
    .select()
    .from(groupActivityPool)
    .where(eq(groupActivityPool.groupId, groupId))
    .orderBy(asc(groupActivityPool.sort));
  if (pool.length === 0) return [];
  const ids = pool.map((p) => p.activityId);
  const acts = await db
    .select()
    .from(activities)
    .where(inArray(activities.id, ids));
  const imgs = await db
    .select()
    .from(activityImages)
    .where(inArray(activityImages.activityId, ids));
  const byId = new Map(acts.map((a) => [a.id, a]));
  return pool
    .map((p) => {
      const a = byId.get(p.activityId);
      if (!a) return null;
      return {
        sort: p.sort,
        activity: toActivityDTO(
          a,
          imgs.filter((i) => i.activityId === a.id).sort((x, y) => x.sort - y.sort).map((i) => i.url),
        ),
      };
    })
    .filter((x): x is { sort: number; activity: ReturnType<typeof toActivityDTO> } => x != null);
}

/* --------------------------- swipe state ----------------------------- */
app.get("/:id/swipe", async (c) => {
  const db = createDb(c.env);
  const groupId = c.req.param("id");
  const { group } = await requireGroupMember(db, groupId, uid(c));
  const userId = uid(c);

  const deck = await deckWithActivities(db, groupId);
  const myVotes = await db
    .select()
    .from(activityVotes)
    .where(
      and(eq(activityVotes.groupId, groupId), eq(activityVotes.userId, userId)),
    );
  const myVoteByActivity = new Map(myVotes.map((v) => [v.activityId, v.value]));

  const matchedActivityIds = new Set(
    (
      await db
        .select({ activityId: matches.activityId })
        .from(matches)
        .where(eq(matches.groupId, groupId))
    ).map((m) => m.activityId),
  );

  const queue: SwipeCardDTO[] = [];
  let lastVoted: SwipeCardDTO | null = null;
  deck.forEach((d, idx) => {
    const card: SwipeCardDTO = {
      activity: d.activity,
      yourVote: myVoteByActivity.get(d.activity.id) ?? null,
      position: idx,
      deckSize: deck.length,
    };
    if (!myVoteByActivity.has(d.activity.id) && !matchedActivityIds.has(d.activity.id)) {
      queue.push(card);
    } else if (myVoteByActivity.has(d.activity.id)) {
      lastVoted = card;
    }
  });

  // collective progress on the frontmost undecided card
  let currentProgress: SwipeStateDTO["currentProgress"] = null;
  if (queue.length > 0) {
    const activeIds = await activeMemberIds(db, groupId);
    const cardVotes = await db
      .select({ userId: activityVotes.userId, value: activityVotes.value })
      .from(activityVotes)
      .where(
        and(
          eq(activityVotes.groupId, groupId),
          eq(activityVotes.activityId, queue[0]!.activity.id),
        ),
      );
    const p = activityVoteProgress(activeIds, cardVotes);
    currentProgress = { voted: p.voted, total: p.total };
  }

  const latestMatch = await db.query.matches.findFirst({
    where: eq(matches.groupId, groupId),
    orderBy: [desc(matches.matchedAt)],
  });

  const state: SwipeStateDTO = {
    groupId,
    status: group.status,
    deckSize: deck.length,
    queue,
    lastVoted,
    currentProgress,
    newMatch: latestMatch ? await matchDTO(db, latestMatch.id) : null,
    finished: deck.length > 0 && queue.length === 0,
  };
  return c.json(state);
});

/* ----------------------------- cast vote ---------------------------- */
app.post("/:id/swipe", async (c) => {
  const db = createDb(c.env);
  const groupId = c.req.param("id");
  const { group } = await requireActiveMember(db, groupId, uid(c));
  if (group.status !== "swiping" && group.status !== "date_matching" && group.status !== "planned") {
    throw conflict("This group isn't swiping right now.");
  }
  const body = await parseBody(
    c,
    z.object({
      activityId: z.string().min(1),
      value: z.enum(["like", "nope", "superlike"]),
    }),
  );

  const inDeck = await db.query.groupActivityPool.findFirst({
    where: and(
      eq(groupActivityPool.groupId, groupId),
      eq(groupActivityPool.activityId, body.activityId),
    ),
  });
  if (!inDeck) throw badRequest("That activity isn't in this group's deck.");

  const already = await db.query.matches.findFirst({
    where: and(
      eq(matches.groupId, groupId),
      eq(matches.activityId, body.activityId),
    ),
  });

  const now = Math.floor(Date.now() / 1000);
  await db
    .insert(activityVotes)
    .values({
      id: newId(),
      groupId,
      activityId: body.activityId,
      userId: uid(c),
      value: body.value,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        activityVotes.groupId,
        activityVotes.activityId,
        activityVotes.userId,
      ],
      set: { value: body.value, updatedAt: now },
    });

  let newMatch = null;
  if (!already && body.value !== "nope") {
    newMatch = await runActivityMatch(db, c.env, groupId, body.activityId, uid(c));
  }

  const activeIds = await activeMemberIds(db, groupId);
  const cardVotes = await db
    .select({ userId: activityVotes.userId, value: activityVotes.value })
    .from(activityVotes)
    .where(
      and(
        eq(activityVotes.groupId, groupId),
        eq(activityVotes.activityId, body.activityId),
      ),
    );
  const progress = activityVoteProgress(activeIds, cardVotes);

  return c.json({
    ok: true,
    progress: { voted: progress.voted, total: progress.total },
    newMatch,
  });
});

/* ------------------------------- undo ------------------------------- */
app.post("/:id/swipe/undo", async (c) => {
  const db = createDb(c.env);
  const groupId = c.req.param("id");
  await requireActiveMember(db, groupId, uid(c));

  const last = await db
    .select()
    .from(activityVotes)
    .where(
      and(eq(activityVotes.groupId, groupId), eq(activityVotes.userId, uid(c))),
    )
    .orderBy(desc(activityVotes.updatedAt))
    .limit(1);
  if (last.length === 0) throw badRequest("Nothing to undo.");

  const matched = await db.query.matches.findFirst({
    where: and(
      eq(matches.groupId, groupId),
      eq(matches.activityId, last[0]!.activityId),
    ),
  });
  if (matched) throw conflict("That card already matched — it can't be undone.");

  await db
    .delete(activityVotes)
    .where(eq(activityVotes.id, last[0]!.id));

  return c.json({ ok: true, undoneActivityId: last[0]!.activityId });
});

export default app;
