import { Hono } from "hono";
import { and, asc, desc, eq, inArray, notInArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { Env, Vars } from "../env";
import { createDb } from "../db/client";
import {
  activities,
  activityImages,
  activityVotes,
  groupActivityPool,
  groupSettings,
  matches,
  type Group,
} from "../db/schema";
import { parseBody } from "../lib/validate";
import { badRequest, conflict } from "../lib/errors";
import { newId } from "../lib/id";
import { track } from "../lib/analytics";
import { chunk, rowsPerInsert } from "../lib/chunk";
import { requireActiveMember, requireGroupMember, activeMemberIds } from "../lib/access";
import { activityVoteProgress } from "../engine/match";
import { buildDeckBatch, countEligibleActivities, haversineKm } from "../engine/deck";
import { runActivityMatch } from "../lib/engine-run";
import { matchDTO } from "../lib/match-view";
import { settingsToDTO } from "../lib/group-view";
import { toActivityDTO } from "../lib/dto";
import { LIMITS } from "@shared/constants";
import type { DB } from "../db/client";
import type { SwipeCardDTO, SwipeStateDTO } from "@shared/types";

type Ctx = { Bindings: Env; Variables: Vars };
const app = new Hono<Ctx>();

const uid = (c: { get: (k: "userId") => string | null }) => c.get("userId")!;

/** activity rows of the current pool, in deck order, as full DTOs. */
async function deckWithActivities(db: DB, groupId: string) {
  const pool = await db
    .select()
    .from(groupActivityPool)
    .where(eq(groupActivityPool.groupId, groupId))
    .orderBy(asc(groupActivityPool.sort));
  if (pool.length === 0) return [];
  const ids = pool.map((p) => p.activityId);
  const [acts, imgs, settings] = await Promise.all([
    db.select().from(activities).where(inArray(activities.id, ids)),
    db.select().from(activityImages).where(inArray(activityImages.activityId, ids)),
    db.query.groupSettings.findFirst({ where: eq(groupSettings.groupId, groupId) }),
  ]);
  const glat = settings?.lat != null ? settings.lat / 1e6 : null;
  const glng = settings?.lng != null ? settings.lng / 1e6 : null;
  const byId = new Map(acts.map((a) => [a.id, a]));
  return pool
    .map((p) => {
      const a = byId.get(p.activityId);
      if (!a) return null;
      const dist =
        glat != null && glng != null && a.lat != null && a.lng != null
          ? haversineKm(glat, glng, a.lat / 1e6, a.lng / 1e6)
          : null;
      return {
        sort: p.sort,
        activity: toActivityDTO(
          a,
          imgs
            .filter((i) => i.activityId === a.id)
            .sort((x, y) => x.sort - y.sort)
            .map((i) => i.url),
          dist,
        ),
      };
    })
    .filter(
      (x): x is { sort: number; activity: ReturnType<typeof toActivityDTO> } =>
        x != null,
    );
}

/** The full SwipeStateDTO — shared by GET /swipe and POST /swipe/extend. */
async function buildSwipeState(
  db: DB,
  group: Group,
  userId: string,
): Promise<SwipeStateDTO> {
  const groupId = group.id;
  const [deck, myVotes, matchRows, settings] = await Promise.all([
    deckWithActivities(db, groupId),
    db
      .select()
      .from(activityVotes)
      .where(
        and(eq(activityVotes.groupId, groupId), eq(activityVotes.userId, userId)),
      ),
    db
      .select({ activityId: matches.activityId })
      .from(matches)
      .where(eq(matches.groupId, groupId)),
    db.query.groupSettings.findFirst({ where: eq(groupSettings.groupId, groupId) }),
  ]);

  const myVoteByActivity = new Map(myVotes.map((v) => [v.activityId, v.value]));
  const matchedActivityIds = new Set(matchRows.map((m) => m.activityId));

  const queue: SwipeCardDTO[] = [];
  let lastVoted: SwipeCardDTO | null = null;
  deck.forEach((d, idx) => {
    const card: SwipeCardDTO = {
      activity: d.activity,
      yourVote: myVoteByActivity.get(d.activity.id) ?? null,
      position: idx,
      deckSize: deck.length,
    };
    if (
      !myVoteByActivity.has(d.activity.id) &&
      !matchedActivityIds.has(d.activity.id)
    ) {
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

  // is there another batch to pull? (pool ∪ this user's votes are excluded)
  let hasMore = false;
  if (settings) {
    const poolIds = deck.map((d) => d.activity.id);
    const exclude = [...new Set([...poolIds, ...myVoteByActivity.keys()])];
    hasMore = (await countEligibleActivities(db, settings, exclude)) > 0;
  }

  const latestMatch = await db.query.matches.findFirst({
    where: eq(matches.groupId, groupId),
    orderBy: [desc(matches.matchedAt)],
  });

  return {
    groupId,
    status: group.status,
    deckSize: deck.length,
    queue,
    lastVoted,
    currentProgress,
    newMatch: latestMatch ? await matchDTO(db, latestMatch.id) : null,
    hasMore,
    swipedByYou: myVotes.length,
    filters: settingsToDTO(settings),
    canChangeFilters: group.creatorId === userId,
    finished: deck.length > 0 && queue.length === 0 && !hasMore,
  };
}

/** Append the next batch of cards to the shared pool. Race-safe (PK conflict). */
export async function extendPool(
  db: DB,
  groupId: string,
  batchLimit = LIMITS.deckSize,
): Promise<{ added: number; hasMore: boolean }> {
  const settings = await db.query.groupSettings.findFirst({
    where: eq(groupSettings.groupId, groupId),
  });
  if (!settings) return { added: 0, hasMore: false };

  const [poolRows, votedRows, maxSortRow] = await Promise.all([
    db
      .select({ activityId: groupActivityPool.activityId })
      .from(groupActivityPool)
      .where(eq(groupActivityPool.groupId, groupId)),
    db
      .selectDistinct({ activityId: activityVotes.activityId })
      .from(activityVotes)
      .where(eq(activityVotes.groupId, groupId)),
    db
      .select({ m: sql<number>`coalesce(max(${groupActivityPool.sort}), -1)` })
      .from(groupActivityPool)
      .where(eq(groupActivityPool.groupId, groupId)),
  ]);

  const exclude = [
    ...new Set([
      ...poolRows.map((r) => r.activityId),
      ...votedRows.map((r) => r.activityId),
    ]),
  ];
  const { ids, hasMore } = await buildDeckBatch(db, settings, {
    exclude,
    limit: batchLimit,
  });
  if (ids.length === 0) return { added: 0, hasMore: false };

  const now = Math.floor(Date.now() / 1000);
  let sort = (maxSortRow[0]?.m ?? -1) + 1;
  const rows = ids.map((activityId) => ({
    groupId,
    activityId,
    sort: sort++,
    addedAt: now,
  }));
  for (const b of chunk(rows, rowsPerInsert(4))) {
    await db.insert(groupActivityPool).values(b).onConflictDoNothing();
  }
  return { added: ids.length, hasMore };
}

/**
 * Rebuild the not-yet-voted tail of the pool from the current settings. Votes
 * and matches are untouched: only unswiped cards are swapped. Called after a
 * mid-swipe filter change.
 */
export async function rebuildPoolTail(db: DB, groupId: string): Promise<void> {
  const voted = await db
    .selectDistinct({ activityId: activityVotes.activityId })
    .from(activityVotes)
    .where(eq(activityVotes.groupId, groupId));
  const keep = voted.map((v) => v.activityId);

  await db
    .delete(groupActivityPool)
    .where(
      keep.length
        ? and(
            eq(groupActivityPool.groupId, groupId),
            notInArray(groupActivityPool.activityId, keep),
          )
        : eq(groupActivityPool.groupId, groupId),
    );

  await extendPool(db, groupId);
}

/* --------------------------- swipe state ----------------------------- */
app.get("/:id/swipe", async (c) => {
  const db = createDb(c.env);
  const groupId = c.req.param("id");
  const { group } = await requireGroupMember(db, groupId, uid(c));
  return c.json(await buildSwipeState(db, group, uid(c)));
});

/* ------------------------ pull the next batch ----------------------- */
app.post("/:id/swipe/extend", async (c) => {
  const db = createDb(c.env);
  const groupId = c.req.param("id");
  const { group } = await requireActiveMember(db, groupId, uid(c));
  if (group.status !== "swiping" && group.status !== "date_matching") {
    // still return current state so the client can settle gracefully
    return c.json(await buildSwipeState(db, group, uid(c)));
  }
  await extendPool(db, groupId);
  return c.json(await buildSwipeState(db, group, uid(c)));
});

/* ----------------------------- cast vote ---------------------------- */
app.post("/:id/swipe", async (c) => {
  const db = createDb(c.env);
  const groupId = c.req.param("id");
  const { group } = await requireActiveMember(db, groupId, uid(c));
  if (
    group.status !== "swiping" &&
    group.status !== "date_matching" &&
    group.status !== "planned"
  ) {
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

  track(
    c,
    body.value === "nope"
      ? "activity_passed"
      : body.value === "superlike"
        ? "activity_superliked"
        : "activity_liked",
    {
      userId: uid(c),
      groupId,
      activityId: body.activityId,
      dedupeKey: `swipe:${groupId}:${body.activityId}:${uid(c)}`,
    },
  );

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

  await db.delete(activityVotes).where(eq(activityVotes.id, last[0]!.id));

  // make sure the undone card is still in the pool (a filter change may have
  // dropped unswiped cards; this one now has no vote so re-add it at the front)
  const stillPooled = await db.query.groupActivityPool.findFirst({
    where: and(
      eq(groupActivityPool.groupId, groupId),
      eq(groupActivityPool.activityId, last[0]!.activityId),
    ),
  });
  if (!stillPooled) {
    const minSort = await db
      .select({ m: sql<number>`coalesce(min(${groupActivityPool.sort}), 0)` })
      .from(groupActivityPool)
      .where(eq(groupActivityPool.groupId, groupId));
    await db
      .insert(groupActivityPool)
      .values({
        groupId,
        activityId: last[0]!.activityId,
        sort: (minSort[0]?.m ?? 0) - 1,
        addedAt: Math.floor(Date.now() / 1000),
      })
      .onConflictDoNothing();
  }

  return c.json({ ok: true, undoneActivityId: last[0]!.activityId });
});

export { buildSwipeState };
export default app;
